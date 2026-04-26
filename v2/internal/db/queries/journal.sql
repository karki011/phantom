-- journal.sql - Activity Journal queries for sessions and daily stats
-- Author: Subash Karki

-- name: GetSessionJournal :one
SELECT * FROM sessions WHERE id = ?;

-- name: ListSessionsByDate :many
SELECT * FROM sessions WHERE date = ? ORDER BY started_at DESC;

-- name: ListSessionsByProject :many
SELECT * FROM sessions WHERE repo = ? ORDER BY started_at DESC LIMIT ?;

-- name: ListRecentSessions :many
SELECT * FROM sessions WHERE status IN ('completed', 'active') ORDER BY started_at DESC LIMIT ?;

-- name: UpdateSessionJournal :exec
UPDATE sessions SET
    date = ?,
    summary = ?,
    outcome = ?,
    files_touched = ?,
    git_commits = ?,
    git_lines_added = ?,
    git_lines_removed = ?,
    branch = ?,
    pr_url = ?,
    pr_status = ?
WHERE id = ?;

-- name: UpsertDailyStats :exec
INSERT INTO daily_stats (date, project_id, session_count, total_duration_secs, total_cost_micros, total_input_tokens, total_output_tokens, total_tool_calls, total_commits, pr_count, top_files)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (date, COALESCE(project_id, '__global__'))
DO UPDATE SET
    session_count = excluded.session_count,
    total_duration_secs = excluded.total_duration_secs,
    total_cost_micros = excluded.total_cost_micros,
    total_input_tokens = excluded.total_input_tokens,
    total_output_tokens = excluded.total_output_tokens,
    total_tool_calls = excluded.total_tool_calls,
    total_commits = excluded.total_commits,
    pr_count = excluded.pr_count,
    top_files = excluded.top_files;

-- name: GetDailyStats :one
SELECT * FROM daily_stats WHERE date = ? AND COALESCE(project_id, '__global__') = COALESCE(?, '__global__');

-- name: ListDailyStatsRange :many
SELECT * FROM daily_stats WHERE date BETWEEN ? AND ? AND project_id IS NULL ORDER BY date;

-- name: ListDailyStatsRangeByProject :many
SELECT * FROM daily_stats WHERE date BETWEEN ? AND ? AND project_id = ? ORDER BY date;

-- name: GetLastActiveSession :one
SELECT * FROM sessions WHERE status IN ('active', 'completed') ORDER BY started_at DESC LIMIT 1;
