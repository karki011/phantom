// session_watcher.go watches ~/.claude/sessions/ for session JSON files,
// syncs them to the SQLite database, and detects stale sessions.
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
	"syscall"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// terminalLinker is the subset of linker.Linker used by SessionWatcher.
// Defined as an interface to avoid circular imports (collector → linker is fine,
// but linker does not import collector).
type terminalLinker interface {
	LinkSessionToUnlinkedTerminals(ctx context.Context, sessionID, sessionCwd string, sessionPID int64) error
	UnlinkSession(ctx context.Context, sessionID string) error
}

// SessionWatcher watches ~/.claude/sessions/ for session lifecycle events.
type SessionWatcher struct {
	queries   *db.Queries
	watcher   *fsnotify.Watcher
	ctx       context.Context
	cancel    context.CancelFunc
	emitEvent func(name string, data interface{})
	onActive  func(sessionID, jsonlPath string)
	linker    terminalLinker

	// debounce per-file fsnotify events
	mu       sync.Mutex
	debounce map[string]*time.Timer

	// stale detection — require N consecutive PID check failures before marking
	// completed. Handles transient ESRCH errors during zombie reap, exec transitions, etc.
	staleMu       sync.Mutex
	staleFailures map[string]int
}

const staleFailureThreshold = 3

// NewSessionWatcher creates a SessionWatcher. queries must be backed by db.Writer.
func NewSessionWatcher(queries *db.Queries, emitEvent func(string, interface{})) *SessionWatcher {
	return &SessionWatcher{
		queries:       queries,
		emitEvent:     emitEvent,
		debounce:      make(map[string]*time.Timer),
		staleFailures: make(map[string]int),
	}
}

func (sw *SessionWatcher) Name() string { return "session-watcher" }

// SetOnActive registers a callback invoked when a session becomes active.
// Used to auto-start JSONL tailing for safety evaluation.
func (sw *SessionWatcher) SetOnActive(fn func(sessionID, jsonlPath string)) {
	sw.onActive = fn
}

// SetLinker injects the terminal linker so the watcher can auto-link/unlink
// terminals when sessions start, stop, or go stale.
func (sw *SessionWatcher) SetLinker(l terminalLinker) {
	sw.linker = l
}

// Start begins watching the sessions directory and launches background goroutines.
func (sw *SessionWatcher) Start(ctx context.Context) error {
	sw.ctx, sw.cancel = context.WithCancel(ctx)

	sessDir := sessionsDir()
	if err := os.MkdirAll(sessDir, 0o755); err != nil {
		return fmt.Errorf("session_watcher: create sessions dir: %w", err)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("session_watcher: create watcher: %w", err)
	}
	sw.watcher = watcher

	if err := watcher.Add(sessDir); err != nil {
		watcher.Close()
		return fmt.Errorf("session_watcher: watch %s: %w", sessDir, err)
	}

	// Scan existing files on startup
	sw.scanExisting(sessDir)

	// Resurrect sessions whose PID is still alive but DB says completed.
	// This handles app restarts where the Claude process outlived PhantomOS.
	sw.resurrectAlive()

	// fsnotify event loop
	go sw.eventLoop()

	// Stale session detector (every 5s)
	go sw.staleDetector()

	// Context bridge (every 10s)
	go sw.contextBridge()

	slog.Info("session_watcher: watching", "dir", sessDir)
	return nil
}

// Stop gracefully shuts down the watcher and all goroutines.
func (sw *SessionWatcher) Stop() error {
	if sw.cancel != nil {
		sw.cancel()
	}
	if sw.watcher != nil {
		return sw.watcher.Close()
	}
	return nil
}

// sessionsDir returns ~/.claude/sessions/.
func sessionsDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "sessions")
}

// scanExisting processes all .json files already present in the sessions directory.
func (sw *SessionWatcher) scanExisting(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		slog.Error("session_watcher: scan existing", "err", err)
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		sw.processSessionFile(filepath.Join(dir, e.Name()), false)
	}
}

// eventLoop handles fsnotify events with debouncing.
func (sw *SessionWatcher) eventLoop() {
	for {
		select {
		case <-sw.ctx.Done():
			return
		case ev, ok := <-sw.watcher.Events:
			if !ok {
				return
			}
			if !strings.HasSuffix(ev.Name, ".json") {
				continue
			}
			switch {
			case ev.Has(fsnotify.Create) || ev.Has(fsnotify.Write):
				sw.debouncedProcess(ev.Name, false)
			case ev.Has(fsnotify.Remove):
				sw.handleRemove(ev.Name)
			}
		case err, ok := <-sw.watcher.Errors:
			if !ok {
				return
			}
			slog.Error("session_watcher: watcher error", "err", err)
		}
	}
}

// debouncedProcess delays processing a file by 200ms to coalesce rapid writes.
func (sw *SessionWatcher) debouncedProcess(path string, isRemove bool) {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	if t, exists := sw.debounce[path]; exists {
		t.Stop()
	}
	sw.debounce[path] = time.AfterFunc(200*time.Millisecond, func() {
		sw.mu.Lock()
		delete(sw.debounce, path)
		sw.mu.Unlock()

		if isRemove {
			sw.handleRemove(path)
		} else {
			sw.processSessionFile(path, false)
		}
	})
}

// rawSession is the flexible JSON shape Claude writes to sessions/.
type rawSession struct {
	Type       string      `json:"type"`
	SessionID  string      `json:"sessionId"`
	ID         string      `json:"id"`
	Pid        interface{} `json:"pid"` // may be string or number
	Cwd        string      `json:"cwd"`
	Name       string      `json:"name"`
	Kind       string      `json:"kind"`
	Entrypoint string      `json:"entrypoint"`
	StartedAt  interface{} `json:"startedAt"` // may be ISO string or unix ms number
	Model      string      `json:"model"`
}

// processSessionFile reads a session JSON file and upserts into the database.
func (sw *SessionWatcher) processSessionFile(path string, _ bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		slog.Error("session_watcher: read file", "path", path, "err", err)
		return
	}

	var raw rawSession
	if err := json.Unmarshal(data, &raw); err != nil {
		slog.Error("session_watcher: parse file", "path", path, "err", err)
		return
	}

	// Resolve session ID: prefer sessionId, fall back to id, then filename
	sessionID := raw.SessionID
	if sessionID == "" {
		sessionID = raw.ID
	}
	if sessionID == "" {
		sessionID = strings.TrimSuffix(filepath.Base(path), ".json")
	}
	if sessionID == "" {
		return
	}

	// Parse PID flexibly (string or number)
	pid := parsePID(raw.Pid)

	// Parse startedAt — may be ISO string or unix ms number
	var startedEpoch int64
	switch v := raw.StartedAt.(type) {
	case float64:
		if v > 1e12 {
			startedEpoch = int64(v / 1000)
		} else {
			startedEpoch = int64(v)
		}
	case json.Number:
		if n, err := v.Int64(); err == nil {
			if n > 1e12 {
				startedEpoch = n / 1000
			} else {
				startedEpoch = n
			}
		}
	case string:
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			startedEpoch = t.Unix()
		} else if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
			startedEpoch = t.Unix()
		}
	}
	if startedEpoch == 0 {
		startedEpoch = time.Now().Unix()
	}

	// Derive repo from cwd (last path component)
	repo := ""
	if raw.Cwd != "" {
		repo = filepath.Base(raw.Cwd)
	}

	// Check PID liveness
	status := "active"
	if pid > 0 {
		if err := syscall.Kill(int(pid), 0); err != nil {
			slog.Warn("session_watcher: PID check failed", "session_id", sessionID, "pid", pid, "err", err)
			status = "completed"
		} else {
			slog.Info("session_watcher: PID alive", "session_id", sessionID, "pid", pid)
		}
	} else {
		slog.Warn("session_watcher: no PID", "session_id", sessionID)
		status = "completed"
	}

	// Try GetSession first — if exists, update; if not, create
	existing, err := sw.queries.GetSession(sw.ctx, sessionID)
	if err == nil {
		dbStatus := ""
		if existing.Status.Valid {
			dbStatus = existing.Status.String
		}
		slog.Info("session_watcher: update existing", "session_id", sessionID, "pid", pid, "pid_status", status, "db_status", dbStatus)
		if status == "active" {
			// PID alive — force active regardless of DB state
		} else if existing.Status.Valid && existing.Status.String == "active" {
			status = "active"
		}
		// Clear ended_at when session is active (resurrect case)
		endedAt := existing.EndedAt
		if status == "active" {
			endedAt = sql.NullInt64{}
		}
		if err := sw.queries.UpdateSession(sw.ctx, db.UpdateSessionParams{
			ID:                  sessionID,
			Pid:                 nullInt64(pid),
			Cwd:                 nullString(raw.Cwd),
			Repo:                nullString(repo),
			Name:                nullString(raw.Name),
			Kind:                nullString(raw.Kind),
			Model:               nullStringOr(raw.Model, existing.Model),
			Entrypoint:          nullString(raw.Entrypoint),
			EndedAt:             endedAt,
			Status:              nullString(status),
			TaskCount:           existing.TaskCount,
			CompletedTasks:      existing.CompletedTasks,
			XpEarned:            existing.XpEarned,
			InputTokens:         existing.InputTokens,
			OutputTokens:        existing.OutputTokens,
			CacheReadTokens:     existing.CacheReadTokens,
			CacheWriteTokens:    existing.CacheWriteTokens,
			EstimatedCostMicros: existing.EstimatedCostMicros,
			MessageCount:        existing.MessageCount,
			ToolUseCount:        existing.ToolUseCount,
			FirstPrompt:         existing.FirstPrompt,
			ToolBreakdown:       existing.ToolBreakdown,
			LastInputTokens:     existing.LastInputTokens,
			ContextUsedPct:      existing.ContextUsedPct,
		}); err != nil {
			slog.Error("session_watcher: update session", "session_id", sessionID, "err", err)
			return
		}
		sw.emitEvent(EventSessionUpdate, map[string]interface{}{
			"sessionId": sessionID,
			"status":    status,
		})
	} else {
		// Session does not exist — create
		if err := sw.queries.CreateSession(sw.ctx, db.CreateSessionParams{
			ID:         sessionID,
			Pid:        nullInt64(pid),
			Cwd:        nullString(raw.Cwd),
			Repo:       nullString(repo),
			Name:       nullString(raw.Name),
			Kind:       nullString(raw.Kind),
			Model:      nullString(raw.Model),
			Entrypoint: nullString(raw.Entrypoint),
			StartedAt:  nullInt64(startedEpoch),
			Status:     nullString(status),
		}); err != nil {
			slog.Error("session_watcher: create session", "session_id", sessionID, "err", err)
			return
		}
		sw.emitEvent(EventSessionNew, map[string]interface{}{
			"sessionId": sessionID,
			"cwd":       raw.Cwd,
			"kind":      raw.Kind,
			"status":    status,
		})
	}

	// Auto-start JSONL tailing for active sessions so the safety pipeline fires.
	if status == "active" && sw.onActive != nil {
		sw.onActive(sessionID, "")
	}

	// Best-effort: link unlinked terminals whose CWD matches this session.
	if status == "active" && raw.Cwd != "" && sw.linker != nil {
		if err := sw.linker.LinkSessionToUnlinkedTerminals(sw.ctx, sessionID, raw.Cwd, pid); err != nil {
			slog.Warn("session_watcher: link terminals", "session_id", sessionID, "err", err)
		}
	}
}

// handleRemove marks a session as completed when its JSON file is removed.
func (sw *SessionWatcher) handleRemove(path string) {
	sessionID := strings.TrimSuffix(filepath.Base(path), ".json")
	if sessionID == "" {
		return
	}

	now := time.Now().Unix()
	if err := sw.queries.UpdateSessionStatus(sw.ctx, db.UpdateSessionStatusParams{
		ID:      sessionID,
		Status:  nullString("completed"),
		EndedAt: nullInt64(now),
	}); err != nil {
		slog.Error("session_watcher: mark removed session", "session_id", sessionID, "err", err)
		return
	}

	// Unlink any terminals that were linked to this session.
	if sw.linker != nil {
		if err := sw.linker.UnlinkSession(sw.ctx, sessionID); err != nil {
			slog.Warn("session_watcher: unlink terminals on remove", "session_id", sessionID, "err", err)
		}
	}

	sw.emitEvent(EventSessionEnd, map[string]interface{}{
		"sessionId": sessionID,
		"reason":    "file_removed",
	})
}

// staleDetector periodically checks active sessions for dead PIDs.
func (sw *SessionWatcher) staleDetector() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-sw.ctx.Done():
			return
		case <-ticker.C:
			sw.checkStale()
		}
	}
}

func (sw *SessionWatcher) checkStale() {
	sessions, err := sw.queries.ListActiveSessions(sw.ctx)
	if err != nil {
		slog.Error("session_watcher: list active sessions", "err", err)
		return
	}

	now := time.Now().Unix()
	for _, s := range sessions {
		stale := false

		if s.Pid.Valid && s.Pid.Int64 > 0 {
			// Check PID liveness: signal 0 checks alive without sending signal.
			// Require consecutive failures to avoid flipping on transient ESRCH
			// (zombie reap, exec transitions, etc.)
			if err := syscall.Kill(int(s.Pid.Int64), 0); err != nil {
				sw.staleMu.Lock()
				sw.staleFailures[s.ID]++
				count := sw.staleFailures[s.ID]
				sw.staleMu.Unlock()
				if count >= staleFailureThreshold {
					stale = true
				} else {
					slog.Info("session_watcher: PID check failed (retry)", "session_id", s.ID, "pid", s.Pid.Int64, "count", count)
				}
			} else {
				// PID alive — reset the counter
				sw.staleMu.Lock()
				delete(sw.staleFailures, s.ID)
				sw.staleMu.Unlock()
			}
		} else if s.StartedAt.Valid && (now-s.StartedAt.Int64) > 600 {
			// No PID + age > 10 min → mark completed
			stale = true
		}

		if stale {
			slog.Warn("session_watcher: marking stale", "session_id", s.ID, "pid", s.Pid.Int64)
			if err := sw.queries.UpdateSessionStatus(sw.ctx, db.UpdateSessionStatusParams{
				ID:      s.ID,
				Status:  nullString("completed"),
				EndedAt: nullInt64(now),
			}); err != nil {
				slog.Error("session_watcher: mark stale session", "session_id", s.ID, "err", err)
				continue
			}

			// Unlink any terminals that were linked to this stale session.
			if sw.linker != nil {
				if err := sw.linker.UnlinkSession(sw.ctx, s.ID); err != nil {
					slog.Warn("session_watcher: unlink terminals on stale", "session_id", s.ID, "err", err)
				}
			}

			sw.emitEvent(EventSessionStale, map[string]interface{}{
				"sessionId": s.ID,
				"reason":    "pid_dead",
			})
		}
	}
}

// contextBridge reads context data for active sessions every 10 seconds.
func (sw *SessionWatcher) contextBridge() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-sw.ctx.Done():
			return
		case <-ticker.C:
			sw.pollContext()
		}
	}
}

func (sw *SessionWatcher) pollContext() {
	sessions, err := sw.queries.ListActiveSessions(sw.ctx)
	if err != nil {
		slog.Error("session_watcher: list active for context", "err", err)
		return
	}

	home, _ := os.UserHomeDir()
	ctxDir := filepath.Join(home, ".claude", "phantom-os", "context")

	for _, s := range sessions {
		ctxFile := filepath.Join(ctxDir, s.ID+".json")
		data, err := os.ReadFile(ctxFile)
		if err != nil {
			continue // file may not exist yet — non-fatal
		}

		var ctxData struct {
			ContextUsedPct int64 `json:"contextUsedPct"`
		}
		if err := json.Unmarshal(data, &ctxData); err != nil {
			continue
		}

		if err := sw.queries.UpdateSessionTokens(sw.ctx, db.UpdateSessionTokensParams{
			ID:              s.ID,
			InputTokens:     s.InputTokens,
			OutputTokens:    s.OutputTokens,
			CacheReadTokens: s.CacheReadTokens,
			CacheWriteTokens: s.CacheWriteTokens,
			EstimatedCostMicros: s.EstimatedCostMicros,
			MessageCount:    s.MessageCount,
			ToolUseCount:    s.ToolUseCount,
			LastInputTokens: s.LastInputTokens,
			ContextUsedPct:  nullInt64(ctxData.ContextUsedPct),
		}); err != nil {
			slog.Error("session_watcher: update context", "session_id", s.ID, "err", err)
			continue
		}

		sw.emitEvent(EventSessionContext, map[string]interface{}{
			"sessionId":      s.ID,
			"contextUsedPct": ctxData.ContextUsedPct,
		})
	}
}

// resurrectAlive re-checks recently completed sessions whose PIDs are still alive.
// Handles the case where a Claude process outlives a PhantomOS restart.
func (sw *SessionWatcher) resurrectAlive() {
	completed, err := sw.queries.ListSessionsByStatus(sw.ctx, nullString("completed"))
	if err != nil {
		slog.Error("session_watcher: resurrectAlive: list completed", "err", err)
		return
	}

	now := time.Now().Unix()
	cutoff := now - 3600 // only check sessions completed within the last hour

	for _, s := range completed {
		if s.EndedAt.Valid && s.EndedAt.Int64 < cutoff {
			continue
		}
		if !s.Pid.Valid || s.Pid.Int64 <= 0 {
			continue
		}
		if err := syscall.Kill(int(s.Pid.Int64), 0); err != nil {
			continue
		}
		// PID is alive — resurrect
		slog.Info("session_watcher: resurrecting session", "session_id", s.ID, "pid", s.Pid.Int64)
		if err := sw.queries.UpdateSessionStatus(sw.ctx, db.UpdateSessionStatusParams{
			ID:      s.ID,
			Status:  nullString("active"),
			EndedAt: sql.NullInt64{},
		}); err != nil {
			slog.Error("session_watcher: resurrectAlive: update", "session_id", s.ID, "err", err)
			continue
		}
		sw.emitEvent(EventSessionUpdate, map[string]interface{}{
			"sessionId": s.ID,
			"status":    "active",
		})
		if sw.onActive != nil {
			sw.onActive(s.ID, "")
		}
	}
}

// --- helpers ---

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func nullStringOr(s string, fallback sql.NullString) sql.NullString {
	if s != "" {
		return sql.NullString{String: s, Valid: true}
	}
	return fallback
}

func nullInt64(v int64) sql.NullInt64 {
	if v == 0 {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: v, Valid: true}
}

// parsePID handles both numeric and string PID values from JSON.
func parsePID(v interface{}) int64 {
	switch p := v.(type) {
	case float64:
		return int64(p)
	case string:
		var n int64
		fmt.Sscanf(p, "%d", &n)
		return n
	case json.Number:
		n, _ := p.Int64()
		return n
	default:
		return 0
	}
}
