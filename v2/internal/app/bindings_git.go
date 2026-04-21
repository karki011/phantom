// Wails bindings for git worktree management.
// Author: Subash Karki
package app

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
)

// CreateWorktree creates a git worktree for the given project and branch,
// then persists the workspace record in the database.
func (a *App) CreateWorktree(projectId, branch, baseBranch string) (*db.Workspace, error) {
	// Look up the project to get repoPath and name.
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		return nil, fmt.Errorf("CreateWorktree: project %s not found: %w", projectId, err)
	}

	// Compute target directory for the worktree.
	targetDir, err := git.GetWorktreeDir(proj.Name, branch)
	if err != nil {
		return nil, fmt.Errorf("CreateWorktree: GetWorktreeDir: %w", err)
	}

	// If no base branch specified, use the project's default.
	if baseBranch == "" {
		if proj.DefaultBranch.Valid && proj.DefaultBranch.String != "" {
			baseBranch = proj.DefaultBranch.String
		} else {
			baseBranch = git.GetDefaultBranch(a.ctx, proj.RepoPath)
		}
	}

	// Create the git worktree on disk.
	if err := git.Create(a.ctx, proj.RepoPath, branch, targetDir, baseBranch); err != nil {
		return nil, fmt.Errorf("CreateWorktree: git.Create: %w", err)
	}

	// Persist workspace record.
	id := uuid.New().String()
	now := time.Now().Unix()

	params := db.CreateWorkspaceParams{
		ID:           id,
		ProjectID:    projectId,
		Type:         "worktree",
		Name:         branch,
		Branch:       branch,
		WorktreePath: sql.NullString{String: targetDir, Valid: true},
		BaseBranch:   sql.NullString{String: baseBranch, Valid: true},
		IsActive:     sql.NullInt64{Int64: 1, Valid: true},
		CreatedAt:    now,
	}

	wq := db.New(a.DB.Writer)
	if err := wq.CreateWorkspace(a.ctx, params); err != nil {
		return nil, fmt.Errorf("CreateWorktree: CreateWorkspace: %w", err)
	}

	// Read back the full record.
	rq := db.New(a.DB.Reader)
	ws, err := rq.GetWorkspace(a.ctx, id)
	if err != nil {
		return nil, fmt.Errorf("CreateWorktree: GetWorkspace after create: %w", err)
	}
	return &ws, nil
}

// RemoveWorktree removes a worktree from disk and deletes the workspace record.
func (a *App) RemoveWorktree(worktreeId string) error {
	// Get the workspace to find worktree path.
	q := db.New(a.DB.Reader)
	ws, err := q.GetWorkspace(a.ctx, worktreeId)
	if err != nil {
		return fmt.Errorf("RemoveWorktree: workspace %s not found: %w", worktreeId, err)
	}

	// Remove the git worktree from disk if path exists.
	if ws.WorktreePath.Valid && ws.WorktreePath.String != "" {
		if err := git.Remove(a.ctx, ws.WorktreePath.String); err != nil {
			log.Printf("app/bindings_git: git.Remove(%s) warning: %v", ws.WorktreePath.String, err)
			// Continue to delete the DB record even if git removal fails.
		}
	}

	// Delete workspace record from database.
	wq := db.New(a.DB.Writer)
	return wq.DeleteWorkspace(a.ctx, worktreeId)
}

// ListWorktrees returns all workspaces for a given project.
func (a *App) ListWorktrees(projectId string) []db.Workspace {
	q := db.New(a.DB.Reader)
	workspaces, err := q.ListWorkspacesByProject(a.ctx, projectId)
	if err != nil {
		log.Printf("app/bindings_git: ListWorkspacesByProject(%s) error: %v", projectId, err)
		return []db.Workspace{}
	}
	return workspaces
}

// GetDefaultBranch returns the default branch for the repository at repoPath.
func (a *App) GetDefaultBranch(repoPath string) string {
	return git.GetDefaultBranch(a.ctx, repoPath)
}

// GetProjectBranches returns all local branch names for a project.
func (a *App) GetProjectBranches(projectId string) []string {
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		log.Printf("app/bindings_git: GetProjectBranches(%s) error: %v", projectId, err)
		return []string{}
	}

	branches, err := git.ListBranches(a.ctx, proj.RepoPath)
	if err != nil {
		log.Printf("app/bindings_git: ListBranches(%s) error: %v", proj.RepoPath, err)
		return []string{}
	}

	names := make([]string, 0, len(branches))
	for _, b := range branches {
		names = append(names, b.Name)
	}
	return names
}
