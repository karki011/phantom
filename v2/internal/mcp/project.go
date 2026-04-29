// Project auto-detection for the MCP stdio server.
// Walks up from the spawning shell's cwd checking the SQLite DB for a
// matching workspace worktree path or a project repo path.
//
// Mirrors v1 behaviour in packages/server/src/mcp/stdio-entry.ts.
//
// Author: Subash Karki
package mcp

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// DetectProjectID resolves a project ID using:
//  1. PHANTOM_PROJECT_ID env override (explicit, backward-compatible),
//  2. workspace.worktree_path matching cwd (or any parent),
//  3. project.repo_path matching cwd (or any parent).
//
// Returns "" when no match is found — the server still starts and tools that
// require a project ID will fail gracefully with a clear error.
func DetectProjectID(ctx context.Context, queries *db.Queries) string {
	if env := os.Getenv("PHANTOM_PROJECT_ID"); env != "" {
		return env
	}
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	return walkAndMatch(ctx, queries, cwd)
}

// walkAndMatch climbs the directory tree looking for a project / workspace
// whose path equals the current candidate. Stops at filesystem root.
func walkAndMatch(ctx context.Context, queries *db.Queries, start string) string {
	dir := start
	for {
		if id := matchWorkspace(ctx, queries, dir); id != "" {
			return id
		}
		if id := matchProject(ctx, queries, dir); id != "" {
			return id
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// matchWorkspace returns the project_id of any workspace whose worktree_path
// equals dir. There is no global ListWorkspaces query in v2 yet, so we
// iterate projects and check each project's workspaces.
func matchWorkspace(ctx context.Context, queries *db.Queries, dir string) string {
	projects, err := queries.ListProjects(ctx)
	if err != nil {
		return ""
	}
	for _, p := range projects {
		wss, err := queries.ListWorkspacesByProject(ctx, p.ID)
		if err != nil {
			continue
		}
		for _, w := range wss {
			if w.WorktreePath.Valid && w.WorktreePath.String == dir {
				return w.ProjectID
			}
		}
	}
	return ""
}

// matchProject returns the project ID whose repo_path equals dir.
func matchProject(ctx context.Context, queries *db.Queries, dir string) string {
	p, err := queries.FindProjectByRepoPath(ctx, dir)
	if err != nil {
		if err == sql.ErrNoRows {
			return ""
		}
		return ""
	}
	return p.ID
}
