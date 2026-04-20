-- terminal.sql - CRUD operations for terminal_sessions table
-- Author: Subash Karki

-- name: GetTerminalSession :one
SELECT * FROM terminal_sessions WHERE pane_id = ?;

-- name: ListActiveTerminals :many
SELECT * FROM terminal_sessions WHERE status = 'active' ORDER BY started_at DESC;

-- name: CreateTerminalSession :exec
INSERT INTO terminal_sessions (
    pane_id, worktree_id, shell, cwd, env,
    cols, rows, scrollback, status,
    started_at, last_active_at, ended_at
) VALUES (
    ?, ?, ?, ?, ?,
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
