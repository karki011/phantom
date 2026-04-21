-- sessions.sql - CRUD operations for sessions table
-- Author: Subash Karki

-- name: GetSession :one
SELECT * FROM sessions WHERE id = ?;

-- name: ListSessions :many
SELECT * FROM sessions ORDER BY started_at DESC;

-- name: ListActiveSessions :many
SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC;

-- name: ListSessionsByStatus :many
SELECT * FROM sessions WHERE status = ? ORDER BY started_at DESC;

-- name: CreateSession :exec
INSERT INTO sessions (
    id, pid, cwd, repo, name, kind, model, entrypoint,
    started_at, ended_at, status, task_count, completed_tasks,
    xp_earned, input_tokens, output_tokens, cache_read_tokens,
    cache_write_tokens, estimated_cost_micros, message_count,
    tool_use_count, first_prompt, tool_breakdown,
    last_input_tokens, context_used_pct
) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?
);

-- name: UpdateSession :exec
UPDATE sessions SET
    pid = ?,
    cwd = ?,
    repo = ?,
    name = ?,
    kind = ?,
    model = ?,
    entrypoint = ?,
    ended_at = ?,
    status = ?,
    task_count = ?,
    completed_tasks = ?,
    xp_earned = ?,
    input_tokens = ?,
    output_tokens = ?,
    cache_read_tokens = ?,
    cache_write_tokens = ?,
    estimated_cost_micros = ?,
    message_count = ?,
    tool_use_count = ?,
    first_prompt = ?,
    tool_breakdown = ?,
    last_input_tokens = ?,
    context_used_pct = ?
WHERE id = ?;

-- name: UpdateSessionTokens :exec
UPDATE sessions SET
    input_tokens = ?,
    output_tokens = ?,
    cache_read_tokens = ?,
    cache_write_tokens = ?,
    estimated_cost_micros = ?,
    message_count = ?,
    tool_use_count = ?,
    last_input_tokens = ?,
    context_used_pct = ?
WHERE id = ?;

-- name: UpdateSessionStatus :exec
UPDATE sessions SET
    status = ?,
    ended_at = ?
WHERE id = ?;

-- name: UpdateSessionEnrichment :exec
UPDATE sessions SET
    model = ?,
    input_tokens = ?,
    output_tokens = ?,
    cache_read_tokens = ?,
    cache_write_tokens = ?,
    estimated_cost_micros = ?,
    message_count = ?,
    tool_use_count = ?,
    first_prompt = ?,
    tool_breakdown = ?,
    last_input_tokens = ?
WHERE id = ?;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE id = ?;
