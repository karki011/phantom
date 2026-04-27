// Package collector — TodoWatcher: watches ~/.claude/todos/ for todo JSON files.
// Author: Subash Karki
package collector

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// todoItem represents a single entry in a todos JSON array.
type todoItem struct {
	Content    string `json:"content"`
	Status     string `json:"status"`
	ActiveForm string `json:"activeForm"`
}

// TodoWatcher watches ~/.claude/todos/ for .json files and upserts todo items
// as tasks into the DB.
type TodoWatcher struct {
	queries        *db.Queries
	prov           provider.Provider
	watcher        *fsnotify.Watcher
	ctx            context.Context
	cancel         context.CancelFunc
	emitEvent      func(name string, data interface{})
	onTaskComplete func(sessionID, taskID string)

	mu            sync.Mutex
	previousTodos map[string][]todoItem // file path → previous todo state
}

// NewTodoWatcher creates a new TodoWatcher.
func NewTodoWatcher(
	queries *db.Queries,
	prov provider.Provider,
	emitEvent func(string, interface{}),
	onTaskComplete func(sessionID, taskID string),
) *TodoWatcher {
	return &TodoWatcher{
		queries:        queries,
		prov:           prov,
		emitEvent:      emitEvent,
		onTaskComplete: onTaskComplete,
		previousTodos:  make(map[string][]todoItem),
	}
}

func (w *TodoWatcher) Name() string { return "todo-watcher" }

func (w *TodoWatcher) Start(ctx context.Context) error {
	w.ctx, w.cancel = context.WithCancel(ctx)

	var err error
	w.watcher, err = fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	todosDir := w.todosDir()
	if err := os.MkdirAll(todosDir, 0o755); err != nil {
		slog.Warn("todo-watcher: cannot create todos dir", "path", todosDir, "err", err)
	}

	if err := w.watcher.Add(todosDir); err != nil {
		slog.Error("todo-watcher: watch todos dir", "path", todosDir, "err", err)
		return err
	}

	slog.Info("todo-watcher started", "dir", todosDir)

	for {
		select {
		case <-w.ctx.Done():
			slog.Info("todo-watcher stopped")
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
			slog.Error("todo-watcher: fsnotify error", "err", err)
		}
	}
}

func (w *TodoWatcher) Stop() error {
	if w.cancel != nil {
		w.cancel()
	}
	if w.watcher != nil {
		return w.watcher.Close()
	}
	return nil
}

// todosDir returns the todos directory path from the provider config.
func (w *TodoWatcher) todosDir() string {
	return w.prov.TodosDir()
}

func (w *TodoWatcher) handleEvent(event fsnotify.Event) {
	if !event.Has(fsnotify.Create) && !event.Has(fsnotify.Write) {
		return
	}
	if !strings.HasSuffix(event.Name, ".json") {
		return
	}

	w.processTodoFile(event.Name)
}

// extractSessionID extracts the session ID from a todo filename.
// Pattern: <sessionId>-agent-*.json → sessionId is everything before first "-agent-".
func extractSessionID(filename string) string {
	base := strings.TrimSuffix(filepath.Base(filename), ".json")
	idx := strings.Index(base, "-agent-")
	if idx < 0 {
		// Fallback: use entire filename (minus .json) as session ID.
		return base
	}
	return base[:idx]
}

// processTodoFile reads a todo JSON array and upserts each item as a task.
func (w *TodoWatcher) processTodoFile(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		slog.Debug("todo-watcher: read file", "path", path, "err", err)
		return
	}

	var todos []todoItem
	if err := json.Unmarshal(data, &todos); err != nil {
		slog.Debug("todo-watcher: parse file", "path", path, "err", err)
		return
	}

	sessionID := extractSessionID(path)

	// Check if session exists — skip orphans.
	_, err = w.queries.GetSession(w.ctx, sessionID)
	if err != nil {
		slog.Debug("todo-watcher: orphan todo (no session)", "session_id", sessionID)
		return
	}

	now := time.Now().UnixMilli()

	// Get previous state for diff detection.
	w.mu.Lock()
	prev := w.previousTodos[path]
	w.mu.Unlock()

	// Build a map of previous todos by index for comparison.
	prevByIdx := make(map[int]todoItem)
	for i, t := range prev {
		prevByIdx[i] = t
	}

	// Process current todos.
	for i, todo := range todos {
		taskID := fmt.Sprintf("%s:todo-%d", sessionID, i)

		existing, getErr := w.queries.GetTask(w.ctx, taskID)
		isNew := getErr != nil

		if isNew {
			if createErr := w.queries.CreateTask(w.ctx, db.CreateTaskParams{
				ID:         taskID,
				SessionID:  sql.NullString{String: sessionID, Valid: true},
				TaskNum:    sql.NullInt64{Int64: int64(i), Valid: true},
				Subject:    sql.NullString{String: todo.Content, Valid: todo.Content != ""},
				Status:     sql.NullString{String: todo.Status, Valid: todo.Status != ""},
				ActiveForm: sql.NullString{String: todo.ActiveForm, Valid: todo.ActiveForm != ""},
				CreatedAt:  sql.NullInt64{Int64: now, Valid: true},
				UpdatedAt:  sql.NullInt64{Int64: now, Valid: true},
			}); createErr != nil {
				slog.Error("todo-watcher: create task", "id", taskID, "err", createErr)
				continue
			}

			_ = w.queries.IncrementSessionTaskCount(w.ctx, sessionID)

			if w.emitEvent != nil {
				w.emitEvent(EventTaskNew, map[string]string{
					"id":         taskID,
					"session_id": sessionID,
					"subject":    todo.Content,
					"status":     todo.Status,
				})
			}
		} else {
			if updateErr := w.queries.UpdateTask(w.ctx, db.UpdateTaskParams{
				ID:         taskID,
				Subject:    sql.NullString{String: todo.Content, Valid: todo.Content != ""},
				Status:     sql.NullString{String: todo.Status, Valid: todo.Status != ""},
				ActiveForm: sql.NullString{String: todo.ActiveForm, Valid: todo.ActiveForm != ""},
				UpdatedAt:  sql.NullInt64{Int64: now, Valid: true},
			}); updateErr != nil {
				slog.Error("todo-watcher: update task", "id", taskID, "err", updateErr)
				continue
			}

			if w.emitEvent != nil {
				w.emitEvent(EventTaskUpdate, map[string]string{
					"id":         taskID,
					"session_id": sessionID,
					"subject":    todo.Content,
					"status":     todo.Status,
				})
			}
		}

		// Detect status change to completed.
		if todo.Status == "completed" {
			wasCompleted := false
			if !isNew && existing.Status.Valid {
				wasCompleted = existing.Status.String == "completed"
			}
			if !wasCompleted {
				_ = w.queries.IncrementSessionCompletedTasks(w.ctx, sessionID)
				if w.onTaskComplete != nil {
					w.onTaskComplete(sessionID, taskID)
				}
			}
		}
	}

	// Detect removed todos — if a todo at an index existed before but is gone
	// from the new array (array shrank), mark it completed.
	if len(prev) > len(todos) {
		for i := len(todos); i < len(prev); i++ {
			taskID := fmt.Sprintf("%s:todo-%d", sessionID, i)
			_ = w.queries.UpdateTaskStatus(w.ctx, db.UpdateTaskStatusParams{
				ID:        taskID,
				Status:    sql.NullString{String: "completed", Valid: true},
				UpdatedAt: sql.NullInt64{Int64: now, Valid: true},
			})
			_ = w.queries.IncrementSessionCompletedTasks(w.ctx, sessionID)
			if w.onTaskComplete != nil {
				w.onTaskComplete(sessionID, taskID)
			}
			if w.emitEvent != nil {
				w.emitEvent(EventTaskUpdate, map[string]string{
					"id":         taskID,
					"session_id": sessionID,
					"status":     "completed",
				})
			}
		}
	}

	// Update previous state.
	w.mu.Lock()
	w.previousTodos[path] = todos
	w.mu.Unlock()
}
