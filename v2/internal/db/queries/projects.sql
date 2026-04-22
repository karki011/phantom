-- projects.sql - CRUD operations for projects table
-- Author: Subash Karki

-- name: GetProject :one
SELECT * FROM projects WHERE id = ?;

-- name: ListProjects :many
SELECT * FROM projects ORDER BY starred DESC, name ASC;

-- name: FindProjectByRepoPath :one
SELECT * FROM projects WHERE repo_path = ?;

-- name: CreateProject :exec
INSERT INTO projects (
    id, name, repo_path, default_branch, worktree_base_dir,
    color, profile, starred, created_at
) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?
);

-- name: UpdateProject :exec
UPDATE projects SET
    name = ?,
    repo_path = ?,
    default_branch = ?,
    worktree_base_dir = ?,
    color = ?,
    profile = ?,
    starred = ?
WHERE id = ?;

-- name: ToggleStarProject :exec
UPDATE projects SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END WHERE id = ?;

-- name: CountStarredProjects :one
SELECT COUNT(*) FROM projects WHERE starred = 1;

-- name: DeleteProject :exec
DELETE FROM projects WHERE id = ?;
