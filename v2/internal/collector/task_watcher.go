// Package collector — TaskWatcher: watches ~/.claude/tasks/ for task JSON files.
// Author: Subash Karki
package collector

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// TaskWatcher watches ~/.claude/tasks/<sessionId>/<taskId>.json and upserts
// task records into the DB.
type TaskWatcher struct {
	queries        *db.Queries
	watcher        *fsnotify.Watcher
	ctx            context.Context
	cancel         context.CancelFunc
	emitEvent      func(name string, data interface{})
	onTaskComplete func(sessionID, taskID string)

	mu       sync.Mutex
	debounce map[string]time.Time // last process time per file path
}

// taskFilePayload is the expected shape of a task JSON file.
type taskFilePayload struct {
	ID          string `json:"id"`
	Subject     string `json:"subject"`
	Description string `json:"description"`
	Status      string `json:"status"`
	Blocks      string `json:"blocks"`
	BlockedBy   string `json:"blockedBy"`
}

// Crew patterns to detect in task subjects.
var crewPatterns = regexp.MustCompile(`\[(Cortex|Solo|Spark|Sentinel|Prism|Oracle)\]`)

// NewTaskWatcher creates a new TaskWatcher.
func NewTaskWatcher(
	queries *db.Queries,
	emitEvent func(string, interface{}),
	onTaskComplete func(sessionID, taskID string),
) *TaskWatcher {
	return &TaskWatcher{
		queries:        queries,
		emitEvent:      emitEvent,
		onTaskComplete: onTaskComplete,
		debounce:       make(map[string]time.Time),
	}
}

func (w *TaskWatcher) Name() string { return "task-watcher" }

func (w *TaskWatcher) Start(ctx context.Context) error {
	w.ctx, w.cancel = context.WithCancel(ctx)

	var err error
	w.watcher, err = fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	tasksDir := w.tasksDir()
	if err := os.MkdirAll(tasksDir, 0o755); err != nil {
		slog.Warn("task-watcher: cannot create tasks dir", "path", tasksDir, "err", err)
	}

	// Add the root tasks directory.
	if err := w.watcher.Add(tasksDir); err != nil {
		slog.Error("task-watcher: watch tasks dir", "path", tasksDir, "err", err)
		return err
	}

	// Add existing subdirectories (session folders).
	w.addSubdirectories(tasksDir)

	slog.Info("task-watcher started", "dir", tasksDir)

	for {
		select {
		case <-w.ctx.Done():
			slog.Info("task-watcher stopped")
			return nil

		case event, ok := <-w.watcher.Events:
			if !ok {
				return nil
			}
			w.handleEvent(event)

		case err, ok := <-w.watcher.Errors:
			if !ok {
				return nil
			}
			slog.Error("task-watcher: fsnotify error", "err", err)
		}
	}
}

func (w *TaskWatcher) Stop() error {
	if w.cancel != nil {
		w.cancel()
	}
	if w.watcher != nil {
		return w.watcher.Close()
	}
	return nil
}

// tasksDir returns ~/.claude/tasks/.
func (w *TaskWatcher) tasksDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "tasks")
}

// addSubdirectories adds watchers for all subdirectories of dir.
func (w *TaskWatcher) addSubdirectories(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			subdir := filepath.Join(dir, entry.Name())
			_ = w.watcher.Add(subdir)
		}
	}
}

func (w *TaskWatcher) handleEvent(event fsnotify.Event) {
	// If a new directory appears, add a watcher for it.
	if event.Has(fsnotify.Create) {
		info, err := os.Stat(event.Name)
		if err == nil && info.IsDir() {
			_ = w.watcher.Add(event.Name)
			return
		}
	}

	// Only process Create/Write on .json files.
	if !event.Has(fsnotify.Create) && !event.Has(fsnotify.Write) {
		return
	}
	if !strings.HasSuffix(event.Name, ".json") {
		return
	}

	// Debounce: 200ms per file path.
	w.mu.Lock()
	lastTime, exists := w.debounce[event.Name]
	now := time.Now()
	if exists && now.Sub(lastTime) < 200*time.Millisecond {
		w.mu.Unlock()
		return
	}
	w.debounce[event.Name] = now
	w.mu.Unlock()

	w.processTaskFile(event.Name)
}

// processTaskFile reads a task JSON file and upserts it into the DB.
func (w *TaskWatcher) processTaskFile(path string) {
	// Extract session ID and raw task ID from path:
	// ~/.claude/tasks/<sessionId>/<taskId>.json
	dir := filepath.Dir(path)
	sessionID := filepath.Base(dir)
	rawTaskID := strings.TrimSuffix(filepath.Base(path), ".json")

	data, err := os.ReadFile(path)
	if err != nil {
		slog.Debug("task-watcher: read file", "path", path, "err", err)
		return
	}

	var payload taskFilePayload
	if err := json.Unmarshal(data, &payload); err != nil {
		slog.Debug("task-watcher: parse file", "path", path, "err", err)
		return
	}

	// Use file-level id if present, otherwise fall back to filename.
	rawID := payload.ID
	if rawID == "" {
		rawID = rawTaskID
	}

	// Build composite key to avoid cross-session collisions.
	compositeID := sessionID + ":" + rawID

	// Check if session exists — skip orphan tasks.
	_, err = w.queries.GetSession(w.ctx, sessionID)
	if err != nil {
		slog.Debug("task-watcher: orphan task (no session)", "session_id", sessionID, "task_id", compositeID)
		return
	}

	// Parse crew from subject.
	crew := ""
	if match := crewPatterns.FindStringSubmatch(payload.Subject); len(match) > 1 {
		crew = match[1]
	}

	now := time.Now().UnixMilli()

	// Check if task already exists.
	existing, err := w.queries.GetTask(w.ctx, compositeID)
	isNew := err != nil // sql.ErrNoRows or any error → treat as new

	if isNew {
		// Create new task.
		if createErr := w.queries.CreateTask(w.ctx, db.CreateTaskParams{
			ID:          compositeID,
			SessionID:   sql.NullString{String: sessionID, Valid: true},
			Subject:     sql.NullString{String: payload.Subject, Valid: payload.Subject != ""},
			Description: sql.NullString{String: payload.Description, Valid: payload.Description != ""},
			Crew:        sql.NullString{String: crew, Valid: crew != ""},
			Status:      sql.NullString{String: payload.Status, Valid: payload.Status != ""},
			Blocks:      sql.NullString{String: payload.Blocks, Valid: payload.Blocks != ""},
			BlockedBy:   sql.NullString{String: payload.BlockedBy, Valid: payload.BlockedBy != ""},
			CreatedAt:   sql.NullInt64{Int64: now, Valid: true},
			UpdatedAt:   sql.NullInt64{Int64: now, Valid: true},
		}); createErr != nil {
			slog.Error("task-watcher: create task", "id", compositeID, "err", createErr)
			return
		}

		_ = w.queries.IncrementSessionTaskCount(w.ctx, sessionID)

		// Backfill session name if missing.
		w.backfillSessionName(sessionID, payload.Subject, crew)

		if w.emitEvent != nil {
			w.emitEvent(EventTaskNew, map[string]string{
				"id":         compositeID,
				"session_id": sessionID,
				"subject":    payload.Subject,
				"status":     payload.Status,
			})
		}
	} else {
		// Update existing task.
		if updateErr := w.queries.UpdateTask(w.ctx, db.UpdateTaskParams{
			ID:          compositeID,
			Subject:     sql.NullString{String: payload.Subject, Valid: payload.Subject != ""},
			Description: sql.NullString{String: payload.Description, Valid: payload.Description != ""},
			Crew:        sql.NullString{String: crew, Valid: crew != ""},
			Status:      sql.NullString{String: payload.Status, Valid: payload.Status != ""},
			Blocks:      sql.NullString{String: payload.Blocks, Valid: payload.Blocks != ""},
			BlockedBy:   sql.NullString{String: payload.BlockedBy, Valid: payload.BlockedBy != ""},
			UpdatedAt:   sql.NullInt64{Int64: now, Valid: true},
		}); updateErr != nil {
			slog.Error("task-watcher: update task", "id", compositeID, "err", updateErr)
			return
		}

		if w.emitEvent != nil {
			w.emitEvent(EventTaskUpdate, map[string]string{
				"id":         compositeID,
				"session_id": sessionID,
				"subject":    payload.Subject,
				"status":     payload.Status,
			})
		}
	}

	// If status changed to completed, fire callback.
	if payload.Status == "completed" {
		if isNew || (existing.Status.Valid && existing.Status.String != "completed") {
			_ = w.queries.IncrementSessionCompletedTasks(w.ctx, sessionID)
			if w.onTaskComplete != nil {
				w.onTaskComplete(sessionID, compositeID)
			}
		}
	}
}

// backfillSessionName sets the session name to the first task's subject if
// the session currently has no name.
func (w *TaskWatcher) backfillSessionName(sessionID, subject, crew string) {
	sess, err := w.queries.GetSession(w.ctx, sessionID)
	if err != nil {
		return
	}
	if sess.Name.Valid && sess.Name.String != "" {
		return
	}

	// Strip crew prefix: "[Cortex] Do thing" → "Do thing"
	name := subject
	if crew != "" {
		name = strings.TrimSpace(strings.TrimPrefix(name, "["+crew+"]"))
	}
	if name == "" {
		return
	}

	// UpdateSession requires all fields; copy existing session and set name.
	_ = w.queries.UpdateSession(w.ctx, db.UpdateSessionParams{
		ID:                  sessionID,
		Pid:                 sess.Pid,
		Cwd:                 sess.Cwd,
		Repo:                sess.Repo,
		Name:                sql.NullString{String: name, Valid: true},
		Kind:                sess.Kind,
		Model:               sess.Model,
		Entrypoint:          sess.Entrypoint,
		EndedAt:             sess.EndedAt,
		Status:              sess.Status,
		TaskCount:           sess.TaskCount,
		CompletedTasks:      sess.CompletedTasks,
		XpEarned:            sess.XpEarned,
		InputTokens:         sess.InputTokens,
		OutputTokens:        sess.OutputTokens,
		CacheReadTokens:     sess.CacheReadTokens,
		CacheWriteTokens:    sess.CacheWriteTokens,
		EstimatedCostMicros: sess.EstimatedCostMicros,
		MessageCount:        sess.MessageCount,
		ToolUseCount:        sess.ToolUseCount,
		FirstPrompt:         sess.FirstPrompt,
		ToolBreakdown:       sess.ToolBreakdown,
		LastInputTokens:     sess.LastInputTokens,
		ContextUsedPct:      sess.ContextUsedPct,
	})
}
