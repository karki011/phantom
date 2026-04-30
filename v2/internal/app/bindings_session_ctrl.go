// bindings_session_ctrl.go exposes session lifecycle operations to the Wails frontend.
// Author: Subash Karki
package app

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/session"
)

// reapZombieSessions marks every status='active' session as completed.
// At app boot no Claude session can actually be running yet — any that
// remain in 'active' state are leftovers from a previous run that died
// without proper cleanup (the bug fixed in DestroyTerminal: closing a
// tab unlinked the terminal but never killed the linked Claude session,
// so the row sat at status='active' forever and showed up in the
// resource monitor as a ghost).
func (a *App) reapZombieSessions() {
	if a.DB == nil {
		return
	}
	qReader := db.New(a.DB.Reader)
	qWriter := db.New(a.DB.Writer)

	sessions, err := qReader.ListActiveSessions(context.Background())
	if err != nil {
		slog.Warn("reapZombieSessions: list", "err", err)
		return
	}
	if len(sessions) == 0 {
		return
	}

	now := time.Now().Unix()
	reaped := 0
	for _, s := range sessions {
		if err := qWriter.UpdateSessionStatus(context.Background(), db.UpdateSessionStatusParams{
			ID:      s.ID,
			Status:  sql.NullString{String: "completed", Valid: true},
			EndedAt: sql.NullInt64{Int64: now, Valid: true},
		}); err != nil {
			slog.Warn("reapZombieSessions: mark completed", "id", s.ID, "err", err)
			continue
		}
		reaped++
	}
	if reaped > 0 {
		slog.Info("reapZombieSessions: marked stale Claude sessions completed", "count", reaped)
	}
}

// PauseSession pauses the named session, buffering its output.
func (a *App) PauseSession(sessionID string) error {
	if err := a.SessionCtrl.Pause(context.Background(), sessionID); err != nil {
		slog.Error("PauseSession failed", "sessionID", sessionID, "err", err)
		return err
	}
	return nil
}

// ResumeSession resumes a paused session. Buffered output is discarded in this
// binding; callers that need flushed output should subscribe to the terminal
// output channel directly.
func (a *App) ResumeSession(sessionID string) error {
	// noop flush — frontend drives output via WebSocket subscription.
	if err := a.SessionCtrl.Resume(context.Background(), sessionID, func([]byte) {}); err != nil {
		slog.Error("ResumeSession failed", "sessionID", sessionID, "err", err)
		return err
	}
	return nil
}

// SetSessionPolicy changes the approval policy for a session.
func (a *App) SetSessionPolicy(sessionID, policy string) error {
	if err := a.SessionCtrl.SetPolicy(context.Background(), sessionID, session.Policy(policy)); err != nil {
		slog.Error("SetSessionPolicy failed", "sessionID", sessionID, "policy", policy, "err", err)
		return err
	}
	return nil
}

// GetSessionState returns the current state snapshot for a session.
func (a *App) GetSessionState(sessionID string) *session.SessionState {
	return a.SessionCtrl.GetState(sessionID)
}

// BranchSession creates a new session forked from sessionID at the event
// identified by atEventSeq.
func (a *App) BranchSession(sessionID string, atEventSeq int) (*session.BranchInfo, error) {
	info, err := a.SessionCtrl.Branch(context.Background(), sessionID, atEventSeq)
	if err != nil {
		slog.Error("BranchSession failed", "sessionID", sessionID, "atEventSeq", atEventSeq, "err", err)
		return nil, err
	}
	return info, nil
}

// RewindSession soft-marks a session as rewound to toEventSeq.
func (a *App) RewindSession(sessionID string, toEventSeq int) error {
	if err := a.SessionCtrl.Rewind(context.Background(), sessionID, toEventSeq); err != nil {
		slog.Error("RewindSession failed", "sessionID", sessionID, "toEventSeq", toEventSeq, "err", err)
		return err
	}
	return nil
}

// GetSessionBranches returns all branches of a session. Returns nil on error.
func (a *App) GetSessionBranches(sessionID string) []session.BranchInfo {
	branches, err := a.SessionCtrl.GetBranches(context.Background(), sessionID)
	if err != nil {
		slog.Error("GetSessionBranches failed", "sessionID", sessionID, "err", err)
		return nil
	}
	return branches
}

// KillSession terminates a running Claude session by sending SIGTERM to its process group
// and marks it completed in the sessions table so the session watcher won't resurrect it.
func (a *App) KillSession(sessionID string) error {
	if err := a.SessionCtrl.Kill(context.Background(), sessionID); err != nil {
		slog.Error("KillSession failed", "sessionID", sessionID, "err", err)
		return err
	}

	if a.DB != nil {
		q := db.New(a.DB.Writer)
		now := time.Now().Unix()
		if err := q.UpdateSessionStatus(context.Background(), db.UpdateSessionStatusParams{
			ID:      sessionID,
			Status:  sql.NullString{String: "completed", Valid: true},
			EndedAt: sql.NullInt64{Int64: now, Valid: true},
		}); err != nil {
			slog.Warn("KillSession: mark completed failed", "sessionID", sessionID, "err", err)
		}
	}

	return nil
}
