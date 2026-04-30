// Wails bindings for terminal CRUD operations.
// Author: Subash Karki
package app

import (
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
)

// terminalWSMessage is the JSON envelope sent over WebSocket for terminal data.
type terminalWSMessage struct {
	Type      string `json:"type"`
	SessionID string `json:"session_id"`
	Payload   string `json:"payload"`
}

// CreateTerminal spawns a new PTY session, persists it in the database,
// wires its output to Wails events, and best-effort links to an active
// Claude session via CWD matching.
func (a *App) CreateTerminal(id, worktreeId, projectId, cwd string, cols, rows int) error {
	// 1. Spawn PTY.
	_, err := a.Terminal.Create(a.ctx, id, cwd, uint16(cols), uint16(rows))
	if err != nil {
		return fmt.Errorf("CreateTerminal: %w", err)
	}

	// 2. Persist to DB.
	q := db.New(a.DB.Writer)
	now := time.Now().Unix()
	if err := q.CreateTerminalSession(a.ctx, db.CreateTerminalSessionParams{
		PaneID:       id,
		WorktreeID:   nullStr(worktreeId),
		ProjectID:    nullStr(projectId),
		SessionID:    sql.NullString{}, // NULL — linker fills this in
		Cwd:          nullStr(cwd),
		Cols:         sql.NullInt64{Int64: int64(cols), Valid: true},
		Rows:         sql.NullInt64{Int64: int64(rows), Valid: true},
		Status:       sql.NullString{String: "active", Valid: true},
		StartedAt:    sql.NullInt64{Int64: now, Valid: true},
		LastActiveAt: sql.NullInt64{Int64: now, Valid: true},
	}); err != nil {
		slog.Error("CreateTerminal: persist to DB", "pane_id", id, "err", err)
		// Non-fatal: PTY is already running, don't fail the whole operation.
	}

	// 3. Wire PTY output to Wails events.
	a.SubscribeTerminal(id)

	// 4. Attach async transcript writer (best-effort, non-blocking).
	//    The PTY hot path drops frames before stalling on disk, so a slow
	//    writer can only cause transcript gaps — never UI lag.
	if logDir, terr := terminal.TranscriptDir(); terr == nil {
		if sess, ok := a.Terminal.Get(id); ok {
			if attachErr := sess.AttachTranscript(a.ctx, logDir); attachErr != nil {
				slog.Warn("CreateTerminal: attach transcript", "pane_id", id, "err", attachErr)
			}
		}
	} else {
		slog.Warn("CreateTerminal: resolve transcript dir", "pane_id", id, "err", terr)
	}

	// 5. Best-effort link to active Claude session.
	if a.Linker != nil && cwd != "" {
		if err := a.Linker.LinkTerminalToActiveSession(a.ctx, id, cwd, worktreeId, projectId); err != nil {
			slog.Warn("CreateTerminal: link to session", "pane_id", id, "err", err)
		}
	}

	return nil
}

// DestroyTerminal saves scrollback, unlinks from any Claude session,
// marks the DB record as ended, kills the PTY, and unsubscribes events.
func (a *App) DestroyTerminal(id string) error {
	q := db.New(a.DB.Writer)
	now := time.Now().Unix()

	// 1. Capture scrollback before killing PTY (accept minor data-loss from last ms).
	sess, ok := a.Terminal.Get(id)
	if ok {
		scrollback := string(sess.Scrollback.Bytes())
		if err := q.UpdateTerminalScrollback(a.ctx, db.UpdateTerminalScrollbackParams{
			PaneID:       id,
			Scrollback:   sql.NullString{String: scrollback, Valid: scrollback != ""},
			LastActiveAt: sql.NullInt64{Int64: now, Valid: true},
		}); err != nil {
			slog.Warn("DestroyTerminal: save scrollback", "pane_id", id, "err", err)
		}
	}

	// 2. Unlink from session (best-effort).
	if a.Linker != nil {
		if err := a.Linker.UnlinkTerminal(a.ctx, id); err != nil {
			slog.Warn("DestroyTerminal: unlink", "pane_id", id, "err", err)
		}
	}

	// 3. Mark ended in DB.
	if err := q.EndTerminalSession(a.ctx, db.EndTerminalSessionParams{
		EndedAt: sql.NullInt64{Int64: now, Valid: true},
		PaneID:  id,
	}); err != nil {
		slog.Warn("DestroyTerminal: end session in DB", "pane_id", id, "err", err)
	}

	// 4. Kill PTY.
	if err := a.Terminal.Destroy(id); err != nil {
		slog.Warn("DestroyTerminal: destroy PTY", "pane_id", id, "err", err)
	}

	// 5. Unsubscribe Wails events.
	a.UnsubscribeTerminal(id)

	return nil
}

// RestoreTerminal recreates a PTY from a previously saved DB record
// (handles both 'ended' and 'active' crash-recovery states).
func (a *App) RestoreTerminal(paneId string) error {
	q := db.New(a.DB.Writer)

	// 1. Read saved state from DB.
	row, err := q.GetTerminalForRestore(a.ctx, paneId)
	if err != nil {
		return fmt.Errorf("RestoreTerminal: get DB record: %w", err)
	}

	cwd := ""
	if row.Cwd.Valid {
		cwd = row.Cwd.String
	}
	cols := uint16(80)
	rows := uint16(24)
	if row.Cols.Valid {
		cols = uint16(row.Cols.Int64)
	}
	if row.Rows.Valid {
		rows = uint16(row.Rows.Int64)
	}

	// 2. Create fresh PTY.
	sess, err := a.Terminal.Create(a.ctx, paneId, cwd, cols, rows)
	if err != nil {
		return fmt.Errorf("RestoreTerminal: create PTY: %w", err)
	}

	// 3. Write restore banner + old scrollback into ring buffer.
	const restoreBanner = "\r\n--- Previous session restored ---\r\n\r\n"
	sess.Scrollback.Write([]byte(restoreBanner))
	if row.Scrollback.Valid && row.Scrollback.String != "" {
		sess.Scrollback.Write([]byte(row.Scrollback.String))
	}

	// 4. Reactivate in DB.
	now := time.Now().Unix()
	if err := q.ReactivateTerminal(a.ctx, db.ReactivateTerminalParams{
		StartedAt:    sql.NullInt64{Int64: now, Valid: true},
		LastActiveAt: sql.NullInt64{Int64: now, Valid: true},
		PaneID:       paneId,
	}); err != nil {
		slog.Warn("RestoreTerminal: reactivate in DB", "pane_id", paneId, "err", err)
	}

	// 5. Subscribe to Wails events.
	a.SubscribeTerminal(paneId)

	// 6. Attach async transcript writer (best-effort, non-blocking).
	if logDir, terr := terminal.TranscriptDir(); terr == nil {
		if attachErr := sess.AttachTranscript(a.ctx, logDir); attachErr != nil {
			slog.Warn("RestoreTerminal: attach transcript", "pane_id", paneId, "err", attachErr)
		}
	}

	return nil
}

// DestroyTerminalsForWorktree saves scrollback, ends all active terminals
// for the given worktree in the DB, and destroys each PTY.
func (a *App) DestroyTerminalsForWorktree(worktreeId string) error {
	q := db.New(a.DB.Writer)
	now := time.Now().Unix()

	// 1. List active terminals to capture scrollback and destroy PTYs.
	terminals, err := q.ListTerminalsByWorktree(a.ctx, sql.NullString{String: worktreeId, Valid: worktreeId != ""})
	if err != nil {
		return fmt.Errorf("DestroyTerminalsForWorktree: list: %w", err)
	}

	// 2. Save scrollback for each before bulk-ending.
	for _, t := range terminals {
		sess, ok := a.Terminal.Get(t.PaneID)
		if ok {
			scrollback := string(sess.Scrollback.Bytes())
			_ = q.UpdateTerminalScrollback(a.ctx, db.UpdateTerminalScrollbackParams{
				PaneID:       t.PaneID,
				Scrollback:   sql.NullString{String: scrollback, Valid: scrollback != ""},
				LastActiveAt: sql.NullInt64{Int64: now, Valid: true},
			})
		}
	}

	// 3. Bulk-end in DB (also clears session_id).
	if err := q.EndTerminalsByWorktree(a.ctx, db.EndTerminalsByWorktreeParams{
		EndedAt:    sql.NullInt64{Int64: now, Valid: true},
		WorktreeID: sql.NullString{String: worktreeId, Valid: worktreeId != ""},
	}); err != nil {
		slog.Warn("DestroyTerminalsForWorktree: bulk end", "worktree_id", worktreeId, "err", err)
	}

	// 4. Destroy each PTY and unsubscribe.
	for _, t := range terminals {
		if err := a.Terminal.Destroy(t.PaneID); err != nil {
			slog.Warn("DestroyTerminalsForWorktree: destroy PTY", "pane_id", t.PaneID, "err", err)
		}
		a.UnsubscribeTerminal(t.PaneID)
	}

	return nil
}

// WriteTerminal sends raw text data to the terminal's PTY input.
func (a *App) WriteTerminal(id string, data string) error {
	return a.Terminal.Write(id, []byte(data))
}

// RunTerminalCommand writes a command string to the terminal's PTY stdin,
// followed by a newline to execute it.
// Author: Subash Karki
func (a *App) RunTerminalCommand(sessionId string, command string) error {
	return a.Terminal.Write(sessionId, []byte(command+"\n"))
}

// ResizeTerminal updates the PTY window size.
func (a *App) ResizeTerminal(id string, cols, rows int) error {
	return a.Terminal.Resize(id, uint16(cols), uint16(rows))
}

// GetTerminalScrollback returns the ring buffer contents as a string.
// This allows the frontend to restore terminal history when re-attaching.
func (a *App) GetTerminalScrollback(id string) string {
	sess, ok := a.Terminal.Get(id)
	if !ok {
		return ""
	}
	return string(sess.Scrollback.Bytes())
}

// nullStr returns a valid sql.NullString for non-empty values, NULL otherwise.
func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
