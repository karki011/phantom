// Author: Subash Karki

// Wails bindings for workspace state persistence (tabs, pane layouts, split percentages).
// State is stored per worktree in the pane_states table.
package app

import (
	"database/sql"
	"log/slog"
	"time"
)

// SaveWorkspaceState persists the full workspace layout (tabs, panes, splits)
// for a worktree. Called by the frontend on tab/pane changes (debounced).
func (a *App) SaveWorkspaceState(worktreeID string, stateJSON string) error {
	_, err := a.DB.Writer.ExecContext(a.ctx,
		`INSERT OR REPLACE INTO pane_states (worktree_id, state, updated_at)
		 VALUES (?, ?, ?)`,
		worktreeID, stateJSON, time.Now().Unix())
	if err != nil {
		slog.Error("SaveWorkspaceState failed", "worktree_id", worktreeID, "err", err)
	}
	return err
}

// GetWorkspaceState retrieves the persisted workspace layout for a worktree.
// Returns empty string if no state is saved.
func (a *App) GetWorkspaceState(worktreeID string) (string, error) {
	var state string
	err := a.DB.Reader.QueryRowContext(a.ctx,
		`SELECT state FROM pane_states WHERE worktree_id = ?`,
		worktreeID).Scan(&state)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		slog.Error("GetWorkspaceState failed", "worktree_id", worktreeID, "err", err)
	}
	return state, err
}

// DeleteWorkspaceState removes persisted state for a worktree (called on worktree deletion).
func (a *App) DeleteWorkspaceState(worktreeID string) error {
	_, err := a.DB.Writer.ExecContext(a.ctx,
		`DELETE FROM pane_states WHERE worktree_id = ?`,
		worktreeID)
	if err != nil {
		slog.Error("DeleteWorkspaceState failed", "worktree_id", worktreeID, "err", err)
	}
	return err
}

// GetAllWorkspaceStates returns all saved workspace states keyed by worktree ID.
// Used for bulk restore on startup.
func (a *App) GetAllWorkspaceStates() (map[string]string, error) {
	rows, err := a.DB.Reader.QueryContext(a.ctx,
		`SELECT worktree_id, state FROM pane_states`)
	if err != nil {
		slog.Error("GetAllWorkspaceStates failed", "err", err)
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]string)
	for rows.Next() {
		var id, state string
		if err := rows.Scan(&id, &state); err != nil {
			slog.Warn("GetAllWorkspaceStates: scan failed", "err", err)
			continue
		}
		result[id] = state
	}
	return result, rows.Err()
}
