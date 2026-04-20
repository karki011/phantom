-- tasks.sql - CRUD operations for tasks table
-- Author: Subash Karki

-- name: GetTask :one
SELECT * FROM tasks WHERE id = ?;

-- name: ListTasksBySession :many
SELECT * FROM tasks WHERE session_id = ? ORDER BY task_num ASC;

-- name: CreateTask :exec
INSERT INTO tasks (
    id, session_id, task_num, subject, description, crew,
    status, active_form, blocks, blocked_by,
    created_at, updated_at, duration_ms
) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?
);

-- name: UpdateTask :exec
UPDATE tasks SET
    subject = ?,
    description = ?,
    crew = ?,
    status = ?,
    active_form = ?,
    blocks = ?,
    blocked_by = ?,
    updated_at = ?,
    duration_ms = ?
WHERE id = ?;

-- name: UpdateTaskStatus :exec
UPDATE tasks SET
    status = ?,
    updated_at = ?
WHERE id = ?;

-- name: IncrementSessionTaskCount :exec
UPDATE sessions SET task_count = task_count + 1 WHERE id = ?;

-- name: IncrementSessionCompletedTasks :exec
UPDATE sessions SET completed_tasks = completed_tasks + 1 WHERE id = ?;
