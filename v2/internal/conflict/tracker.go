// Author: Subash Karki
package conflict

import (
	"log/slog"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/linker"
)

// Session represents any active editing session — Composer pane, terminal CLI,
// or future autonomous agent.
type Session struct {
	ID        string    `json:"id"`         // pane ID or session UUID
	SessionID string    `json:"session_id"` // DB session ID (for cross-referencing)
	Name      string    `json:"name"`       // memorable name (Pokémon name from Feature 1)
	Source    string    `json:"source"`     // "composer", "terminal", "agent" — extensible
	RepoCWD   string    `json:"repo_cwd"`   // normalized to git repo root
	StartedAt time.Time `json:"started_at"`
}

// FileEdit tracks a file being actively edited by a session.
type FileEdit struct {
	SessionID string    `json:"session_id"`
	FilePath  string    `json:"file_path"`
	Timestamp time.Time `json:"timestamp"`
}

// Conflict describes a detected overlap between sessions.
type Conflict struct {
	SessionA   Session   `json:"session_a"`
	SessionB   Session   `json:"session_b"`
	Type       string    `json:"type"`                 // "repo" or "file"
	FilePath   string    `json:"file_path,omitempty"`   // only for "file" type
	DetectedAt time.Time `json:"detected_at"`
}

// ConflictHandler is called when a conflict is detected.
// Multiple handlers can be registered (composer emits UI events, AI engine
// logs for strategy, safety audits).
type ConflictHandler func(conflict Conflict)

// TrackerStats exposes operational metrics.
type TrackerStats struct {
	ActiveSessions int `json:"active_sessions"`
	TrackedFiles   int `json:"tracked_files"`
	TotalConflicts int `json:"total_conflicts"`
}

// RepoRootResolver resolves a CWD to its git repository root. The default
// implementation shells out to `git rev-parse --show-toplevel`. Tests can
// inject a stub via TrackerOption.
type RepoRootResolver func(cwd string) string

// TrackerOption configures a Tracker at construction time.
type TrackerOption func(*Tracker)

// WithRepoRootResolver overrides the default git-based repo root resolution.
// Useful for testing without real git repos.
func WithRepoRootResolver(fn RepoRootResolver) TrackerOption {
	return func(t *Tracker) {
		t.resolveRoot = fn
	}
}

// Tracker monitors active editing sessions and detects when multiple sessions
// target the same git repository or edit the same files.
type Tracker struct {
	mu       sync.RWMutex
	sessions map[string]Session              // id -> Session
	files    map[string]map[string]FileEdit  // id -> filePath -> FileEdit
	handlers []ConflictHandler

	// repoRoots caches repo root resolution so repeated queries for the
	// same CWD don't shell out to `git rev-parse` every time.
	repoRoots   map[string]string
	repoRootsMu sync.RWMutex

	// resolveRoot resolves a normalized CWD to a git repo root. Injected
	// via WithRepoRootResolver; defaults to defaultRepoRootResolver.
	resolveRoot RepoRootResolver

	// totalConflicts is a monotonically increasing counter of detected conflicts.
	totalConflicts int

	logger *slog.Logger
}

// NewTracker creates a Tracker. Pass nil for logger to disable logging.
func NewTracker(logger *slog.Logger, opts ...TrackerOption) *Tracker {
	t := &Tracker{
		sessions:    make(map[string]Session),
		files:       make(map[string]map[string]FileEdit),
		repoRoots:   make(map[string]string),
		resolveRoot: defaultRepoRootResolver,
		logger:      logger,
	}
	for _, opt := range opts {
		opt(t)
	}
	return t
}

// Register adds a session and checks for repo-level conflicts with all
// existing sessions. Any detected conflicts are dispatched to handlers.
func (t *Tracker) Register(s Session) {
	s.RepoCWD = t.cachedRepoRoot(s.RepoCWD)

	t.mu.Lock()
	t.sessions[s.ID] = s
	t.mu.Unlock()

	// Check for repo-level conflicts against every other active session.
	t.mu.RLock()
	others := t.snapshotSessionsLocked()
	t.mu.RUnlock()

	for _, other := range others {
		if other.ID == s.ID {
			continue
		}
		if cwdsOverlap(s.RepoCWD, other.RepoCWD) {
			c := Conflict{
				SessionA:   s,
				SessionB:   other,
				Type:       "repo",
				DetectedAt: time.Now(),
			}
			t.mu.Lock()
			t.totalConflicts++
			t.mu.Unlock()
			t.logConflict(c)
			t.notifyHandlers(c)
		}
	}
}

// Unregister removes a session and all its tracked file edits.
func (t *Tracker) Unregister(sessionID string) {
	t.mu.Lock()
	delete(t.sessions, sessionID)
	delete(t.files, sessionID)
	t.mu.Unlock()
}

// RegisterFile tracks a file edit for a session and checks for file-level
// conflicts (another session editing the same file in the same repo).
func (t *Tracker) RegisterFile(sessionID, filePath string) {
	t.mu.Lock()
	sess, ok := t.sessions[sessionID]
	if !ok {
		t.mu.Unlock()
		return
	}
	if t.files[sessionID] == nil {
		t.files[sessionID] = make(map[string]FileEdit)
	}
	t.files[sessionID][filePath] = FileEdit{
		SessionID: sessionID,
		FilePath:  filePath,
		Timestamp: time.Now(),
	}

	// Snapshot other sessions' files under lock, then release and check.
	type candidate struct {
		session Session
		edit    FileEdit
	}
	var candidates []candidate
	for otherID, otherFiles := range t.files {
		if otherID == sessionID {
			continue
		}
		if edit, found := otherFiles[filePath]; found {
			if otherSess, exists := t.sessions[otherID]; exists {
				candidates = append(candidates, candidate{session: otherSess, edit: edit})
			}
		}
	}
	t.mu.Unlock()

	for _, cand := range candidates {
		c := Conflict{
			SessionA:   sess,
			SessionB:   cand.session,
			Type:       "file",
			FilePath:   filePath,
			DetectedAt: time.Now(),
		}
		t.mu.Lock()
		t.totalConflicts++
		t.mu.Unlock()
		t.logConflict(c)
		t.notifyHandlers(c)
	}
}

// UnregisterFiles clears all tracked file edits for a session without
// removing the session itself.
func (t *Tracker) UnregisterFiles(sessionID string) {
	t.mu.Lock()
	delete(t.files, sessionID)
	t.mu.Unlock()
}

// OnConflict registers a handler that is called whenever a conflict is
// detected. Handlers are called synchronously in registration order —
// keep them fast or spawn a goroutine internally.
func (t *Tracker) OnConflict(handler ConflictHandler) {
	t.mu.Lock()
	t.handlers = append(t.handlers, handler)
	t.mu.Unlock()
}

// GetConflicts returns all active conflicts involving the given session.
// A conflict is "active" when both sessions in the pair are still registered.
func (t *Tracker) GetConflicts(sessionID string) []Conflict {
	t.mu.RLock()
	defer t.mu.RUnlock()

	sess, ok := t.sessions[sessionID]
	if !ok {
		return nil
	}

	var conflicts []Conflict

	// Repo-level conflicts.
	for _, other := range t.sessions {
		if other.ID == sessionID {
			continue
		}
		if cwdsOverlap(sess.RepoCWD, other.RepoCWD) {
			conflicts = append(conflicts, Conflict{
				SessionA:   sess,
				SessionB:   other,
				Type:       "repo",
				DetectedAt: time.Now(),
			})
		}
	}

	// File-level conflicts.
	myFiles := t.files[sessionID]
	for otherID, otherFiles := range t.files {
		if otherID == sessionID {
			continue
		}
		otherSess, exists := t.sessions[otherID]
		if !exists {
			continue
		}
		for fp := range myFiles {
			if _, found := otherFiles[fp]; found {
				conflicts = append(conflicts, Conflict{
					SessionA:   sess,
					SessionB:   otherSess,
					Type:       "file",
					FilePath:   fp,
					DetectedAt: time.Now(),
				})
			}
		}
	}

	return conflicts
}

// GetActiveSessions returns all sessions targeting the given repo CWD.
// The CWD is resolved to its git repo root before matching.
func (t *Tracker) GetActiveSessions(repoCWD string) []Session {
	resolved := t.cachedRepoRoot(repoCWD)

	t.mu.RLock()
	defer t.mu.RUnlock()

	var sessions []Session
	for _, s := range t.sessions {
		if cwdsOverlap(s.RepoCWD, resolved) {
			sessions = append(sessions, s)
		}
	}
	return sessions
}

// IsRepoActive returns true when at least one session targets the given repo.
func (t *Tracker) IsRepoActive(repoCWD string) bool {
	return len(t.GetActiveSessions(repoCWD)) > 0
}

// ActiveSessionCount returns the number of sessions targeting the given repo.
func (t *Tracker) ActiveSessionCount(repoCWD string) int {
	return len(t.GetActiveSessions(repoCWD))
}

// Stats returns operational metrics.
func (t *Tracker) Stats() TrackerStats {
	t.mu.RLock()
	defer t.mu.RUnlock()

	totalFiles := 0
	for _, fm := range t.files {
		totalFiles += len(fm)
	}

	return TrackerStats{
		ActiveSessions: len(t.sessions),
		TrackedFiles:   totalFiles,
		TotalConflicts: t.totalConflicts,
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// snapshotSessionsLocked returns a copy of all sessions. Caller must hold
// at least an RLock on t.mu.
func (t *Tracker) snapshotSessionsLocked() []Session {
	out := make([]Session, 0, len(t.sessions))
	for _, s := range t.sessions {
		out = append(out, s)
	}
	return out
}

// notifyHandlers dispatches a conflict to all registered handlers.
func (t *Tracker) notifyHandlers(c Conflict) {
	t.mu.RLock()
	handlers := make([]ConflictHandler, len(t.handlers))
	copy(handlers, t.handlers)
	t.mu.RUnlock()

	for _, h := range handlers {
		h(c)
	}
}

// logConflict emits a structured log entry for a detected conflict.
func (t *Tracker) logConflict(c Conflict) {
	if t.logger == nil {
		return
	}
	t.logger.Info("conflict detected",
		"type", c.Type,
		"session_a", c.SessionA.ID,
		"session_b", c.SessionB.ID,
		"file_path", c.FilePath,
	)
}

// cwdsOverlap checks whether two normalized repo CWDs point to the same
// repository using the linker's segment-level path matching.
func cwdsOverlap(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	return linker.CWDsMatch(a, b)
}

// cachedRepoRoot resolves a CWD to its git repository root, caching results
// so repeated queries for the same path avoid repeated shell-outs.
func (t *Tracker) cachedRepoRoot(cwd string) string {
	if cwd == "" {
		return ""
	}

	normalized := linker.NormalizeCWD(cwd)

	// Check cache first.
	t.repoRootsMu.RLock()
	if cached, ok := t.repoRoots[normalized]; ok {
		t.repoRootsMu.RUnlock()
		return cached
	}
	t.repoRootsMu.RUnlock()

	// Resolve via the injected resolver.
	root := t.resolveRoot(normalized)

	// Cache the result.
	t.repoRootsMu.Lock()
	t.repoRoots[normalized] = root
	t.repoRootsMu.Unlock()

	return root
}

// defaultRepoRootResolver runs `git rev-parse --show-toplevel` in the given
// directory. Returns the normalized output on success, or the normalized
// input on failure (non-git directories fall back so comparisons still work).
func defaultRepoRootResolver(cwd string) string {
	cmd := exec.Command("git", "-c", "core.optionalLocks=false", "rev-parse", "--show-toplevel")
	cmd.Dir = cwd
	out, err := cmd.Output()
	if err != nil {
		return linker.NormalizeCWD(cwd)
	}
	return linker.NormalizeCWD(strings.TrimSpace(string(out)))
}
