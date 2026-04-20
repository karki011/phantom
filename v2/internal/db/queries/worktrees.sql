-- worktrees.sql - CRUD operations for workspaces table
-- Author: Subash Karki

-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = ?;

-- name: ListWorkspacesByProject :many
SELECT * FROM workspaces WHERE project_id = ? ORDER BY tab_order ASC;

-- name: CreateWorkspace :exec
INSERT INTO workspaces (
    id, project_id, type, name, branch, worktree_path,
    port_base, section_id, base_branch, tab_order,
    is_active, ticket_url, created_at
) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?
);

-- name: UpdateWorkspace :exec
UPDATE workspaces SET
    type = ?,
    name = ?,
    branch = ?,
    worktree_path = ?,
    port_base = ?,
    section_id = ?,
    base_branch = ?,
    tab_order = ?,
    is_active = ?,
    ticket_url = ?
WHERE id = ?;

-- name: SetWorkspaceActive :exec
UPDATE workspaces SET is_active = ? WHERE id = ?;

-- name: DeleteWorkspace :exec
DELETE FROM workspaces WHERE id = ?;
