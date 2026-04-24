// Terminal-to-session linker. Links terminal panes to Claude sessions
// via CWD matching and PID ancestry.
// Author: Subash Karki
package linker

import (
	"context"
	"database/sql"
	"log/slog"
	"sync"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
)

// Event names emitted by the Linker.
const (
	EventTerminalLinked   = "terminal:linked"
	EventTerminalUnlinked = "terminal:unlinked"
)

// Linker matches terminal panes to Claude sessions using CWD overlap
// and PID ancestry, then persists the link in the database.
type Linker struct {
	queries     *db.Queries
	termManager *terminal.Manager
	emitEvent   func(name string, data interface{})
	mu          sync.Mutex // serialise link/unlink operations
}

// New creates a Linker.
func New(queries *db.Queries, termManager *terminal.Manager, emitEvent func(string, interface{})) *Linker {
	return &Linker{
		queries:     queries,
		termManager: termManager,
		emitEvent:   emitEvent,
	}
}

// LinkTerminalToActiveSession finds an active Claude session whose CWD
// matches the terminal's CWD and links them. When multiple candidates
// exist, PID ancestry and recency are used to disambiguate.
func (l *Linker) LinkTerminalToActiveSession(ctx context.Context, paneID, termCwd, worktreeID, projectID string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	sessions, err := l.queries.ListActiveSessions(ctx)
	if err != nil {
		slog.Error("linker: list active sessions", "err", err)
		return err
	}

	// Filter by CWD match.
	var candidates []db.Session
	for _, s := range sessions {
		if s.Cwd.Valid && CWDsMatch(termCwd, s.Cwd.String) {
			candidates = append(candidates, s)
		}
	}

	if len(candidates) == 0 {
		return nil // no session to link — not an error
	}

	var chosen db.Session

	if len(candidates) == 1 {
		chosen = candidates[0]
	} else {
		// Multiple matches — try PID ancestry to disambiguate.
		chosen, err = l.disambiguateByPID(paneID, candidates)
		if err != nil {
			// PID disambiguation failed — fall back to most recent.
			slog.Warn("linker: PID disambiguation failed, using most recent", "pane_id", paneID, "err", err)
			chosen = mostRecentSession(candidates)
		}
	}

	res, err := l.queries.LinkTerminalToSession(ctx, db.LinkTerminalToSessionParams{
		SessionID: sql.NullString{String: chosen.ID, Valid: true},
		PaneID:    paneID,
	})
	if err != nil {
		slog.Error("linker: link terminal to session", "pane_id", paneID, "session_id", chosen.ID, "err", err)
		return err
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		slog.Info("linker: terminal already linked, skipping", "pane_id", paneID)
		return nil
	}

	slog.Info("linker: linked terminal to session", "pane_id", paneID, "session_id", chosen.ID)
	l.emitEvent(EventTerminalLinked, map[string]interface{}{
		"paneId":    paneID,
		"sessionId": chosen.ID,
	})

	return nil
}

// LinkSessionToUnlinkedTerminals scans unlinked terminals and links any
// whose CWD matches the given session. Worktree isolation is respected.
func (l *Linker) LinkSessionToUnlinkedTerminals(ctx context.Context, sessionID string, sessionCwd string, sessionPID int64) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	terminals, err := l.queries.ListUnlinkedActiveTerminals(ctx)
	if err != nil {
		slog.Error("linker: list unlinked terminals", "err", err)
		return err
	}

	// Filter by CWD match.
	var candidates []db.TerminalSession
	for _, t := range terminals {
		if !t.Cwd.Valid || !CWDsMatch(sessionCwd, t.Cwd.String) {
			continue
		}
		candidates = append(candidates, t)
	}

	if len(candidates) == 0 {
		return nil
	}

	// Disambiguate when multiple terminals match.
	if len(candidates) > 1 && sessionPID > 0 {
		var pidMatches []db.TerminalSession
		for _, t := range candidates {
			sess, ok := l.termManager.Get(t.PaneID)
			if !ok {
				continue
			}
			shellPID := sess.Info().PID
			if shellPID > 0 && IsDescendant(int(sessionPID), shellPID) {
				pidMatches = append(pidMatches, t)
			}
		}
		if len(pidMatches) > 0 {
			candidates = pidMatches
		}
	}

	for _, t := range candidates {
		res, err := l.queries.LinkTerminalToSession(ctx, db.LinkTerminalToSessionParams{
			SessionID: sql.NullString{String: sessionID, Valid: true},
			PaneID:    t.PaneID,
		})
		if err != nil {
			slog.Error("linker: link session to terminal", "session_id", sessionID, "pane_id", t.PaneID, "err", err)
			continue
		}
		rows, _ := res.RowsAffected()
		if rows == 0 {
			slog.Info("linker: terminal already linked, skipping", "pane_id", t.PaneID)
			continue
		}
		slog.Info("linker: linked session to terminal", "session_id", sessionID, "pane_id", t.PaneID)
		l.emitEvent(EventTerminalLinked, map[string]interface{}{
			"paneId":    t.PaneID,
			"sessionId": sessionID,
		})
	}

	return nil
}

// UnlinkTerminal removes the session association from a terminal pane.
func (l *Linker) UnlinkTerminal(ctx context.Context, paneID string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	term, err := l.queries.GetTerminalSession(ctx, paneID)
	if err != nil {
		slog.Warn("linker: get terminal for unlink", "pane_id", paneID, "err", err)
		return err
	}

	if !term.SessionID.Valid {
		return nil // already unlinked
	}

	sessionID := term.SessionID.String

	if err := l.queries.UnlinkTerminal(ctx, paneID); err != nil {
		slog.Error("linker: unlink terminal", "pane_id", paneID, "err", err)
		return err
	}

	slog.Info("linker: unlinked terminal", "pane_id", paneID, "session_id", sessionID)
	l.emitEvent(EventTerminalUnlinked, map[string]interface{}{
		"paneId":    paneID,
		"sessionId": sessionID,
	})

	return nil
}

// UnlinkSession removes the session association from all terminals linked
// to the given session.
func (l *Linker) UnlinkSession(ctx context.Context, sessionID string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	terminals, err := l.queries.GetTerminalsBySessionId(ctx, sql.NullString{String: sessionID, Valid: true})
	if err != nil {
		slog.Error("linker: get terminals for session", "session_id", sessionID, "err", err)
		return err
	}

	if err := l.queries.UnlinkAllTerminalsFromSession(ctx, sql.NullString{String: sessionID, Valid: true}); err != nil {
		slog.Error("linker: unlink all terminals from session", "session_id", sessionID, "err", err)
		return err
	}

	for _, t := range terminals {
		slog.Info("linker: unlinked terminal from session", "pane_id", t.PaneID, "session_id", sessionID)
		l.emitEvent(EventTerminalUnlinked, map[string]interface{}{
			"paneId":    t.PaneID,
			"sessionId": sessionID,
		})
	}

	return nil
}

// disambiguateByPID uses PID ancestry to pick the session whose Claude
// process is a descendant of the terminal's shell.
func (l *Linker) disambiguateByPID(paneID string, candidates []db.Session) (db.Session, error) {
	sess, ok := l.termManager.Get(paneID)
	if !ok {
		return db.Session{}, errNoTerminal(paneID)
	}

	shellPID := sess.Info().PID
	if shellPID <= 0 {
		return db.Session{}, errNoPID(paneID)
	}

	var pidMatches []db.Session
	for _, c := range candidates {
		if c.Pid.Valid && c.Pid.Int64 > 0 && IsDescendant(int(c.Pid.Int64), shellPID) {
			pidMatches = append(pidMatches, c)
		}
	}

	switch len(pidMatches) {
	case 0:
		// No PID ancestry match — caller should fall back.
		return db.Session{}, errNoPIDMatch(paneID)
	case 1:
		return pidMatches[0], nil
	default:
		// Multiple PID matches — pick most recent.
		return mostRecentSession(pidMatches), nil
	}
}

// mostRecentSession returns the session with the highest StartedAt value.
func mostRecentSession(sessions []db.Session) db.Session {
	best := sessions[0]
	for _, s := range sessions[1:] {
		if s.StartedAt.Valid && (!best.StartedAt.Valid || s.StartedAt.Int64 > best.StartedAt.Int64) {
			best = s
		}
	}
	return best
}
