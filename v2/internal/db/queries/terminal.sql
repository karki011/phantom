-- terminal.sql - CRUD operations for terminal_sessions table
-- Author: Subash Karki

-- name: GetTerminalSession :one
SELECT * FROM terminal_sessions WHERE pane_id = ?;

-- name: ListActiveTerminals :many
SELECT * FROM terminal_sessions WHERE status = 'active' ORDER BY started_at DESC;

-- name: CreateTerminalSession :exec
INSERT INTO terminal_sessions (
    pane_id, worktree_id, project_id, session_id, shell, cwd, env,
    cols, rows, scrollback, status,
    started_at, last_active_at, ended_at
) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?
);

-- name: UpdateTerminalScrollback :exec
UPDATE terminal_sessions SET
    scrollback = ?,
    last_active_at = ?
WHERE pane_id = ?;

-- name: UpdateTerminalLastActive :exec
UPDATE terminal_sessions SET last_active_at = ? WHERE pane_id = ?;

-- name: EndTerminalSession :exec
UPDATE terminal_sessions SET
    status = 'ended',
    ended_at = ?
WHERE pane_id = ?;

-- name: LinkTerminalToSession :execresult
UPDATE terminal_sessions SET session_id = ? WHERE pane_id = ? AND session_id IS NULL;

-- name: UnlinkTerminal :exec
UPDATE terminal_sessions SET session_id = NULL WHERE pane_id = ?;

-- name: UnlinkAllTerminalsFromSession :exec
UPDATE terminal_sessions SET session_id = NULL WHERE session_id = ?;

-- name: ListUnlinkedActiveTerminals :many
SELECT * FROM terminal_sessions WHERE status = 'active' AND session_id IS NULL;

-- name: GetTerminalsBySessionId :many
SELECT * FROM terminal_sessions WHERE session_id = ?;

-- name: ListTerminalsByWorktree :many
SELECT * FROM terminal_sessions WHERE worktree_id = ? AND status = 'active' ORDER BY started_at DESC;

-- name: ListTerminalsByProject :many
SELECT * FROM terminal_sessions WHERE project_id = ? AND status = 'active' ORDER BY started_at DESC;

-- name: EndTerminalsByWorktree :exec
UPDATE terminal_sessions SET status = 'ended', ended_at = ?, session_id = NULL WHERE worktree_id = ? AND status = 'active';

-- name: GetTerminalForRestore :one
SELECT pane_id, worktree_id, project_id, shell, cwd, cols, rows, scrollback FROM terminal_sessions WHERE pane_id = ? AND status IN ('ended', 'active');

-- name: MarkOrphanedTerminalsEnded :exec
UPDATE terminal_sessions SET status = 'ended', ended_at = ?, session_id = NULL WHERE status = 'active';

-- name: ListUnlinkedActiveTerminalsByWorktree :many
SELECT * FROM terminal_sessions WHERE worktree_id = ? AND status = 'active' AND session_id IS NULL ORDER BY started_at DESC;

-- name: ListRecentlyEndedTerminals :many
SELECT * FROM terminal_sessions WHERE status = 'ended' AND ended_at >= ? ORDER BY ended_at DESC;

-- name: ReactivateTerminal :exec
UPDATE terminal_sessions SET status = 'active', ended_at = NULL, started_at = ?, last_active_at = ? WHERE pane_id = ?;
