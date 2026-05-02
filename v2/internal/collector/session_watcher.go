// session_watcher.go watches the provider's sessions directory for session JSON files,
// syncs them to the SQLite database, and detects stale sessions.
// Author: Subash Karki
package collector

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/namegen"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// terminalLinker is the subset of linker.Linker used by SessionWatcher.
// Defined as an interface to avoid circular imports (collector → linker is fine,
// but linker does not import collector).
type terminalLinker interface {
	LinkSessionToUnlinkedTerminals(ctx context.Context, sessionID, sessionCwd string, sessionPID int64) error
	UnlinkSession(ctx context.Context, sessionID string) error
}

// journalAppender is the subset of journal.Service used by SessionWatcher
// to append work log lines without importing the full journal package.
type journalAppender interface {
	AppendWorkLog(date, line string)
}

// SessionWatcher watches the provider's sessions directory for session lifecycle events.
type SessionWatcher struct {
	queries   *db.Queries
	prov      provider.Provider
	watcher   *fsnotify.Watcher
	ctx       context.Context
	cancel    context.CancelFunc
	emitEvent func(name string, data interface{})
	onActive  func(sessionID, jsonlPath string)
	linker    terminalLinker
	enricher  *SessionEnricher
	journal   journalAppender

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
func NewSessionWatcher(queries *db.Queries, prov provider.Provider, emitEvent func(string, interface{})) *SessionWatcher {
	return &SessionWatcher{
		queries:       queries,
		prov:          prov,
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

// SetEnricher injects the session enricher so completed sessions get
// journal data (summary, files touched, git stats, daily aggregates).
func (sw *SessionWatcher) SetEnricher(e *SessionEnricher) {
	sw.enricher = e
}

// SetJournal injects the journal appender so the watcher can auto-log
// session start/end events to the daily journal work log.
func (sw *SessionWatcher) SetJournal(j journalAppender) {
	sw.journal = j
}

// Start begins watching the sessions directory and launches background goroutines.
func (sw *SessionWatcher) Start(ctx context.Context) error {
	sw.ctx, sw.cancel = context.WithCancel(ctx)

	sessDir := sw.sessionsDir()
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

	// Backfill Pokémon names on any existing sessions that don't have one.
	sw.backfillNames()

	// Resurrect sessions whose PID is still alive but DB says completed.
	// This handles app restarts where the Claude process outlived Phantom.
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

// sessionsDir returns the sessions directory path from the provider.
func (sw *SessionWatcher) sessionsDir() string {
	return sw.prov.SessionsDir()
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

	// Resolve session ID: prefer sessionId, fall back to id.
	// Never use the filename (PID) as session ID — it causes lookup failures.
	sessionID := raw.SessionID
	if sessionID == "" {
		sessionID = raw.ID
	}
	if sessionID == "" {
		slog.Debug("session_watcher: skipping file without sessionId", "path", filepath.Base(path))
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

	// Check PID liveness via provider
	status := "active"
	if pid > 0 {
		if !sw.prov.IsSessionAlive(provider.RawSession{PID: int(pid)}) {
			slog.Warn("session_watcher: PID check failed", "session_id", sessionID, "pid", pid)
			status = "completed"
		} else {
			slog.Info("session_watcher: PID alive", "session_id", sessionID, "pid", pid)
		}
	} else {
		slog.Warn("session_watcher: no PID", "session_id", sessionID)
		status = "completed"
	}

	// Generate a Pokémon name if the session doesn't already have one.
	sessionName := raw.Name
	if sessionName == "" {
		existing := sw.buildNameCollisionSet()
		sessionName = namegen.GenerateUnique(existing)
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
		}
		// When PID is dead, respect the DB status — don't resurrect a session
		// that was explicitly killed or marked completed.
		// Clear ended_at when session is active (resurrect case)
		endedAt := existing.EndedAt
		if status == "active" {
			endedAt = sql.NullInt64{}
		}
		// Preserve existing name if already set; otherwise use generated name.
		updateName := existing.Name
		if !updateName.Valid || updateName.String == "" {
			updateName = nullString(sessionName)
		}
		if err := sw.queries.UpdateSession(sw.ctx, db.UpdateSessionParams{
			ID:                  sessionID,
			Pid:                 nullInt64(pid),
			Cwd:                 nullString(raw.Cwd),
			Repo:                nullString(repo),
			Name:                updateName,
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
		jsonlPath, _ := sw.prov.FindConversationFile(sessionID, raw.Cwd)
		liveState := computeLiveState(jsonlPath, status, time.Now().Unix())
		sw.emitEvent(EventSessionUpdate, map[string]interface{}{
			"sessionId":  sessionID,
			"status":     status,
			"live_state": liveState,
		})
	} else {
		// Session does not exist — create with generated Pokémon name.
		if err := sw.queries.CreateSession(sw.ctx, db.CreateSessionParams{
			ID:         sessionID,
			Pid:        nullInt64(pid),
			Cwd:        nullString(raw.Cwd),
			Repo:       nullString(repo),
			Name:       nullString(sessionName),
			Kind:       nullString(raw.Kind),
			Model:      nullString(raw.Model),
			Entrypoint: nullString(raw.Entrypoint),
			StartedAt:  nullInt64(startedEpoch),
			Status:     nullString(status),
			Provider:   sw.prov.Name(),
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

	// Append work log entry for new active sessions.
	if status == "active" && err != nil && sw.journal != nil {
		// err != nil means this was a Create (not an Update)
		today := time.Now().Format("2006-01-02")
		ts := time.Now().Format("15:04")
		repoLabel := ""
		if raw.Cwd != "" {
			repoLabel = filepath.Base(raw.Cwd)
		}
		var parts []string
		if repoLabel != "" {
			parts = append(parts, fmt.Sprintf("%s [%s] Started", ts, repoLabel))
		} else {
			parts = append(parts, fmt.Sprintf("%s Started", ts))
		}
		if raw.Model != "" {
			parts = append(parts, shortModel(raw.Model))
		}
		sw.journal.AppendWorkLog(today, strings.Join(parts, " · "))
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
	fileID := strings.TrimSuffix(filepath.Base(path), ".json")
	if fileID == "" {
		return
	}

	// The filename is the PID, not the session UUID. Only proceed if it looks
	// like a UUID (contains hyphens). PID-based removals are handled by the
	// stale-check loop which already has the real session ID.
	sessionID := fileID
	if !strings.Contains(fileID, "-") {
		slog.Debug("session_watcher: remove — skipping PID-based file", "file", fileID)
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

	// Enrich session with journal data (summary, files, git stats).
	if sw.enricher != nil {
		sw.enricher.EnrichSession(sw.ctx, sessionID)
	}

	// Append work log entry for session end.
	if sw.journal != nil {
		sw.appendSessionEndLog(sessionID)
	}

	sw.emitEvent(EventSessionEnd, map[string]interface{}{
		"sessionId": sessionID,
		"reason":    "file_removed",
	})

	// If this was the last active session, trigger EOD generation.
	sw.triggerEodIfLastSession()
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
			// Check PID liveness via provider.
			// Require consecutive failures to avoid flipping on transient ESRCH
			// (zombie reap, exec transitions, etc.)
			if !sw.prov.IsSessionAlive(provider.RawSession{PID: int(s.Pid.Int64)}) {
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

			// Enrich session with journal data (summary, files, git stats).
			if sw.enricher != nil {
				sw.enricher.EnrichSession(sw.ctx, s.ID)
			}

			// Append work log entry for session end.
			if sw.journal != nil {
				sw.appendSessionEndLog(s.ID)
			}

			sw.emitEvent(EventSessionStale, map[string]interface{}{
				"sessionId": s.ID,
				"reason":    "pid_dead",
			})

			// If this was the last active session, trigger EOD generation.
			sw.triggerEodIfLastSession()
		}
	}
}

// contextBridge watches the provider's context directory for session context JSON
// updates via fsnotify. Falls back to 10s polling if fsnotify fails.
func (sw *SessionWatcher) contextBridge() {
	ctxDir := sw.prov.ContextDir()
	_ = os.MkdirAll(ctxDir, 0o755)

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		slog.Warn("session_watcher: context bridge fsnotify unavailable, polling", "err", err)
		sw.contextBridgePoll()
		return
	}
	defer watcher.Close()

	if err := watcher.Add(ctxDir); err != nil {
		slog.Warn("session_watcher: context bridge watch failed, polling", "err", err)
		sw.contextBridgePoll()
		return
	}

	const debounceInterval = 2 * time.Second
	var debounceTimer *time.Timer
	debounceCh := make(chan struct{}, 1)
	fallback := time.NewTicker(30 * time.Second)
	defer fallback.Stop()

	for {
		select {
		case <-sw.ctx.Done():
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return

		case ev, ok := <-watcher.Events:
			if !ok {
				return
			}
			if !strings.HasSuffix(ev.Name, ".json") {
				continue
			}
			if !ev.Has(fsnotify.Write) && !ev.Has(fsnotify.Create) {
				continue
			}
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(debounceInterval, func() {
				select {
				case debounceCh <- struct{}{}:
				default:
				}
			})

		case <-debounceCh:
			sw.pollContext()

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			slog.Error("session_watcher: context bridge watcher error", "err", err)

		case <-fallback.C:
			sw.pollContext()
		}
	}
}

// contextBridgePoll is the legacy 10s polling fallback for the context bridge.
func (sw *SessionWatcher) contextBridgePoll() {
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

	ctxDir := sw.prov.ContextDir()

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
// Handles the case where a Claude process outlives a Phantom restart.
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
		if !sw.prov.IsSessionAlive(provider.RawSession{PID: int(s.Pid.Int64)}) {
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
		jsonlPath, _ := sw.prov.FindConversationFile(s.ID, s.Cwd.String)
		liveState := computeLiveState(jsonlPath, "active", time.Now().Unix())
		sw.emitEvent(EventSessionUpdate, map[string]interface{}{
			"sessionId":  s.ID,
			"status":     "active",
			"live_state": liveState,
		})
		if sw.onActive != nil {
			sw.onActive(s.ID, "")
		}
	}
}

// triggerEodIfLastSession checks whether all sessions have ended for the day.
// If so, emits a "journal:eod-trigger" event so the frontend can auto-generate
// the End of Day recap without the user clicking a button.
func (sw *SessionWatcher) triggerEodIfLastSession() {
	activeSessions, err := sw.queries.ListActiveSessions(sw.ctx)
	if err != nil {
		slog.Error("session_watcher: check active for eod trigger", "err", err)
		return
	}
	if len(activeSessions) == 0 && sw.emitEvent != nil {
		slog.Info("session_watcher: last session ended, emitting eod-trigger")
		sw.emitEvent("journal:eod-trigger", nil)
	}
}

// appendSessionEndLog looks up the session in the DB and writes a formatted
// work log line like: "10:43 [repo] Ended · 29m · opus-4 · 12 msgs · 45K tokens · $1.23 · "fix auth""
func (sw *SessionWatcher) appendSessionEndLog(sessionID string) {
	today := time.Now().Format("2006-01-02")
	ts := time.Now().Format("15:04")

	s, err := sw.queries.GetSession(sw.ctx, sessionID)
	if err != nil {
		sw.journal.AppendWorkLog(today, fmt.Sprintf("%s Ended", ts))
		return
	}
	sw.journal.AppendWorkLog(today, FormatSessionEndLine(s, ts))
}

// FormatSessionEndLine renders the canonical "Ended" work log line for a session
// using the same gating and ordering as the live session-end path. The ts argument
// is the leading "HH:MM" timestamp embedded in the line.
func FormatSessionEndLine(s db.Session, ts string) string {
	repoLabel := ""
	if s.Cwd.Valid && s.Cwd.String != "" {
		repoLabel = filepath.Base(s.Cwd.String)
	}

	var parts []string
	if repoLabel != "" {
		parts = append(parts, fmt.Sprintf("%s [%s] Ended", ts, repoLabel))
	} else {
		parts = append(parts, fmt.Sprintf("%s Ended", ts))
	}

	if s.StartedAt.Valid && s.StartedAt.Int64 > 0 {
		var dur time.Duration
		if s.EndedAt.Valid && s.EndedAt.Int64 >= s.StartedAt.Int64 {
			dur = time.Unix(s.EndedAt.Int64, 0).Sub(time.Unix(s.StartedAt.Int64, 0))
		} else {
			dur = time.Since(time.Unix(s.StartedAt.Int64, 0))
		}
		if dur >= time.Hour {
			parts = append(parts, fmt.Sprintf("%dh%dm", int(dur.Hours()), int(dur.Minutes())%60))
		} else if dur >= time.Minute {
			parts = append(parts, fmt.Sprintf("%dm", int(dur.Minutes())))
		} else {
			parts = append(parts, "<1m")
		}
	}

	if s.Model.Valid && s.Model.String != "" {
		parts = append(parts, shortModel(s.Model.String))
	}

	msgCount := int64OrZeroCollector(s.MessageCount)
	if msgCount > 0 {
		parts = append(parts, fmt.Sprintf("%d msgs", msgCount))
	}

	totalTokens := int64OrZeroCollector(s.InputTokens) + int64OrZeroCollector(s.OutputTokens)
	if totalTokens > 0 {
		var tokenStr string
		if totalTokens >= 1_000_000 {
			tokenStr = fmt.Sprintf("%.1fM", float64(totalTokens)/1_000_000)
		} else if totalTokens >= 1_000 {
			tokenStr = fmt.Sprintf("%dK", totalTokens/1_000)
		} else {
			tokenStr = fmt.Sprintf("%d", totalTokens)
		}
		parts = append(parts, tokenStr+" tokens")
	}

	if s.EstimatedCostMicros.Valid && s.EstimatedCostMicros.Int64 > 0 {
		parts = append(parts, fmt.Sprintf("$%.2f", float64(s.EstimatedCostMicros.Int64)/1_000_000))
	}

	if s.Outcome.Valid {
		outcome := strings.ToLower(strings.TrimSpace(s.Outcome.String))
		if outcome != "" && outcome != "unknown" {
			parts = append(parts, outcome)
		}
	}

	if s.Branch.Valid && s.Branch.String != "" && s.Branch.String != repoLabel {
		parts = append(parts, fmt.Sprintf("branch:%s", s.Branch.String))
	}

	if s.FilesTouched.Valid && s.FilesTouched.String != "" {
		var files []string
		if err := json.Unmarshal([]byte(s.FilesTouched.String), &files); err == nil && len(files) > 0 {
			parts = append(parts, fmt.Sprintf("%d files", len(files)))
		}
	}

	if s.GitCommits.Valid && s.GitCommits.Int64 > 0 {
		parts = append(parts, fmt.Sprintf("%d commits", s.GitCommits.Int64))
	}

	if s.PrUrl.Valid && s.PrUrl.String != "" {
		if m := prNumberRegex.FindStringSubmatch(s.PrUrl.String); len(m) == 2 {
			parts = append(parts, fmt.Sprintf("PR #%s", m[1]))
		}
	}

	if s.FirstPrompt.Valid && s.FirstPrompt.String != "" {
		prompt := s.FirstPrompt.String
		if len(prompt) > 60 {
			prompt = prompt[:57] + "..."
		}
		parts = append(parts, fmt.Sprintf("\"%s\"", prompt))
	}

	return strings.Join(parts, " · ")
}

var prNumberRegex = regexp.MustCompile(`/pull/(\d+)`)

func shortModel(model string) string {
	m := strings.ToLower(model)
	switch {
	case strings.Contains(m, "opus"):
		return "opus"
	case strings.Contains(m, "sonnet"):
		return "sonnet"
	case strings.Contains(m, "haiku"):
		return "haiku"
	case strings.Contains(m, "o3"):
		return "o3"
	case strings.Contains(m, "o4-mini"):
		return "o4-mini"
	case strings.Contains(m, "gpt-4"):
		return "gpt-4"
	case strings.Contains(m, "gemini"):
		return "gemini"
	default:
		if len(model) > 20 {
			return model[:20]
		}
		return model
	}
}

func int64OrZeroCollector(n sql.NullInt64) int64 {
	if n.Valid {
		return n.Int64
	}
	return 0
}

// buildNameCollisionSet queries active session names to avoid duplicates.
func (sw *SessionWatcher) buildNameCollisionSet() map[string]bool {
	sessions, err := sw.queries.ListActiveSessions(sw.ctx)
	if err != nil {
		return nil
	}
	existing := make(map[string]bool, len(sessions))
	for _, s := range sessions {
		if s.Name.Valid && s.Name.String != "" {
			existing[s.Name.String] = true
		}
	}
	return existing
}

// backfillNames assigns Pokémon names to all existing sessions that have
// no name. Called once at startup from Start().
func (sw *SessionWatcher) backfillNames() {
	ids, err := sw.queries.ListUnnamedSessions(sw.ctx)
	if err != nil {
		slog.Error("session_watcher: backfill list unnamed", "err", err)
		return
	}
	if len(ids) == 0 {
		return
	}
	existing := sw.buildNameCollisionSet()
	for _, id := range ids {
		name := namegen.GenerateUnique(existing)
		existing[name] = true
		if err := sw.queries.UpdateSessionName(sw.ctx, db.UpdateSessionNameParams{
			Name: nullString(name),
			ID:   id,
		}); err != nil {
			slog.Error("session_watcher: backfill name", "session_id", id, "err", err)
		} else {
			slog.Info("session_watcher: backfilled name", "session_id", id, "name", name)
		}
	}
}

// --- helpers ---

// computeLiveState derives a fine-grained "live_state" for a session that the
// frontend can render as a colored dot. The DB `status` column intentionally
// stays narrow (`active|completed|paused`) because many queries pin on those
// values; this function returns a wider semantic state for the wire payload
// only — never persisted.
//
// States:
//   - "running" — last activity within the last 2 seconds
//   - "waiting" — trailing JSONL line is a `tool_use` with no matching `tool_result`
//   - "idle"    — `5s < last_activity < 5min` AND dbStatus is "active"
//   - "error"   — most recent JSONL line is `type:"error"` OR session ended
//     with an unhealthy signal
//
// Reads only the trailing ~16KB of the JSONL via io.SeekEnd to avoid scanning
// large transcripts; tolerates any I/O error by falling back to a sane default.
func computeLiveState(jsonlPath, dbStatus string, lastActivityAt int64) string {
	now := time.Now().Unix()
	sinceActivity := now - lastActivityAt

	if dbStatus != "active" {
		if jsonlPath != "" && trailingJSONLIsError(jsonlPath) {
			return "error"
		}
		return "idle"
	}

	if jsonlPath != "" && trailingJSONLIsError(jsonlPath) {
		return "error"
	}
	if jsonlPath != "" && trailingToolUsePending(jsonlPath) {
		return "waiting"
	}

	switch {
	case sinceActivity < 2:
		return "running"
	case sinceActivity < 5*60:
		return "idle"
	default:
		return "idle"
	}
}

// readTrailingJSONLLines reads up to maxBytes from the end of the file and
// returns the last N complete lines (most recent last).
func readTrailingJSONLLines(path string, maxBytes int64, maxLines int) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return nil
	}
	size := stat.Size()
	readFrom := int64(0)
	if size > maxBytes {
		readFrom = size - maxBytes
	}
	if _, err := f.Seek(readFrom, io.SeekStart); err != nil {
		return nil
	}
	buf := make([]byte, size-readFrom)
	if _, err := io.ReadFull(f, buf); err != nil {
		return nil
	}

	all := strings.Split(strings.TrimRight(string(buf), "\n"), "\n")
	if readFrom > 0 && len(all) > 0 {
		all = all[1:]
	}
	if len(all) > maxLines {
		all = all[len(all)-maxLines:]
	}
	return all
}

// trailingJSONLIsError returns true if the most recent JSONL line is an error.
func trailingJSONLIsError(path string) bool {
	lines := readTrailingJSONLLines(path, 4096, 4)
	if len(lines) == 0 {
		return false
	}
	last := lines[len(lines)-1]
	var probe struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal([]byte(last), &probe); err != nil {
		return false
	}
	return probe.Type == "error"
}

// trailingToolUsePending returns true if the trailing window of JSONL lines
// contains an assistant `tool_use` event with no matching `tool_result` after.
func trailingToolUsePending(path string) bool {
	lines := readTrailingJSONLLines(path, 16*1024, 32)
	if len(lines) == 0 {
		return false
	}

	type contentBlock struct {
		Type      string `json:"type"`
		ID        string `json:"id"`
		ToolUseID string `json:"tool_use_id"`
	}
	type message struct {
		Content []contentBlock `json:"content"`
	}
	type entry struct {
		Type    string  `json:"type"`
		Message message `json:"message"`
	}

	pending := map[string]struct{}{}
	for _, raw := range lines {
		var e entry
		if err := json.Unmarshal([]byte(raw), &e); err != nil {
			continue
		}
		for _, c := range e.Message.Content {
			switch c.Type {
			case "tool_use":
				if c.ID != "" {
					pending[c.ID] = struct{}{}
				}
			case "tool_result":
				if c.ToolUseID != "" {
					delete(pending, c.ToolUseID)
				}
			}
		}
	}
	return len(pending) > 0
}

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
