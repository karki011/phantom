-- Author: Subash Karki

-- name: ListProjectNotes :many
SELECT * FROM project_notes WHERE project_id = ? ORDER BY pinned DESC, position ASC, created_at DESC;

-- name: GetProjectNote :one
SELECT * FROM project_notes WHERE id = ?;

-- name: CreateProjectNote :exec
INSERT INTO project_notes (id, project_id, type, title, body, pinned, position, pos_x, pos_y, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: UpdateProjectNote :exec
UPDATE project_notes SET title = ?, body = ?, type = ?, pinned = ?, position = ?, pos_x = ?, pos_y = ?, updated_at = ? WHERE id = ?;

-- name: UpdateNotePosition :exec
UPDATE project_notes SET pos_x = ?, pos_y = ?, updated_at = ? WHERE id = ?;

-- name: DeleteProjectNote :exec
DELETE FROM project_notes WHERE id = ?;

-- name: CountProjectNotes :one
SELECT COUNT(*) FROM project_notes WHERE project_id = ?;
