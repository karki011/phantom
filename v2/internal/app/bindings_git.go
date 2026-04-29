// Wails bindings for git worktree management.
// Author: Subash Karki
package app

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// journalWorktreeEvent logs a worktree lifecycle event to the daily work log.
func (a *App) journalWorktreeEvent(action, branch string) {
	if a.journal == nil {
		return
	}
	today := time.Now().Format("2006-01-02")
	ts := time.Now().Format("15:04")
	a.journal.AppendWorkLog(today, fmt.Sprintf("%s %s worktree: %s", ts, action, branch))
}

// CreateWorktree creates a git worktree for the given project and branch,
// then persists the workspace record in the database. ticketUrl is optional
// (empty string stores SQL NULL); only stored if it parses as http(s)://.
func (a *App) CreateWorktree(projectId, branch, baseBranch, ticketUrl string) (*db.Workspace, error) {
	log.Info("app/CreateWorktree: called", "projectId", projectId, "branch", branch, "baseBranch", baseBranch, "ticketUrl", ticketUrl)
	// Look up the project to get repoPath and name.
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/CreateWorktree: project not found", "projectId", projectId, "err", err)
		return nil, fmt.Errorf("CreateWorktree: project %s not found: %w", projectId, err)
	}

	// Compute target directory for the worktree.
	targetDir, err := git.GetWorktreeDir(proj.Name, branch)
	if err != nil {
		log.Error("app/CreateWorktree: GetWorktreeDir failed", "err", err)
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
		log.Error("app/CreateWorktree: git.Create failed", "err", err)
		return nil, fmt.Errorf("CreateWorktree: git.Create: %w", err)
	}

	// Persist workspace record.
	id := uuid.New().String()
	now := time.Now().Unix()

	// Only persist a ticket URL when it looks like an http(s) link — keeps
	// junk values (or accidental whitespace) out of the column.
	trimmedTicket := strings.TrimSpace(ticketUrl)
	ticket := sql.NullString{}
	if strings.HasPrefix(trimmedTicket, "http://") || strings.HasPrefix(trimmedTicket, "https://") {
		ticket = sql.NullString{String: trimmedTicket, Valid: true}
	}

	params := db.CreateWorkspaceParams{
		ID:           id,
		ProjectID:    projectId,
		Type:         "worktree",
		Name:         branch,
		Branch:       branch,
		WorktreePath: sql.NullString{String: targetDir, Valid: true},
		BaseBranch:   sql.NullString{String: baseBranch, Valid: true},
		IsActive:     sql.NullInt64{Int64: 1, Valid: true},
		TicketUrl:    ticket,
		CreatedAt:    now,
	}

	wq := db.New(a.DB.Writer)
	if err := wq.CreateWorkspace(a.ctx, params); err != nil {
		log.Error("app/CreateWorktree: CreateWorkspace failed", "err", err)
		return nil, fmt.Errorf("CreateWorktree: CreateWorkspace: %w", err)
	}

	// Read back the full record.
	rq := db.New(a.DB.Reader)
	ws, err := rq.GetWorkspace(a.ctx, id)
	if err != nil {
		log.Error("app/CreateWorktree: GetWorkspace after create failed", "err", err)
		return nil, fmt.Errorf("CreateWorktree: GetWorkspace after create: %w", err)
	}
	wailsRuntime.EventsEmit(a.ctx, EventWorktreeCreated)
	a.journalWorktreeEvent("Created", branch)
	log.Info("app/CreateWorktree: success", "id", ws.ID, "branch", ws.Branch, "path", ws.WorktreePath.String)
	return &ws, nil
}

// RemoveWorktree removes a worktree from disk and deletes the workspace record.
func (a *App) RemoveWorktree(worktreeId string) error {
	log.Info("app/RemoveWorktree: called", "worktreeId", worktreeId)
	// Get the workspace to find worktree path.
	q := db.New(a.DB.Reader)
	ws, err := q.GetWorkspace(a.ctx, worktreeId)
	if err != nil {
		log.Error("app/RemoveWorktree: workspace not found", "worktreeId", worktreeId, "err", err)
		return fmt.Errorf("RemoveWorktree: workspace %s not found: %w", worktreeId, err)
	}

	// Remove the git worktree from disk if path exists.
	if ws.WorktreePath.Valid && ws.WorktreePath.String != "" {
		if err := git.Remove(a.ctx, ws.WorktreePath.String); err != nil {
			log.Warn("app/RemoveWorktree: git.Remove warning (continuing)", "path", ws.WorktreePath.String, "err", err)
			// Continue to delete the DB record even if git removal fails.
		}
	}

	// Delete workspace record from database.
	wq := db.New(a.DB.Writer)
	if err := wq.DeleteWorkspace(a.ctx, worktreeId); err != nil {
		log.Error("app/RemoveWorktree: DeleteWorkspace failed", "worktreeId", worktreeId, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventWorktreeRemoved)
	a.journalWorktreeEvent("Removed", ws.Branch)
	log.Info("app/RemoveWorktree: success", "worktreeId", worktreeId)
	return nil
}

// ListWorktrees returns all workspaces for a given project.
func (a *App) ListWorktrees(projectId string) []db.Workspace {
	log.Info("app/ListWorktrees: called", "projectId", projectId)
	q := db.New(a.DB.Reader)
	workspaces, err := q.ListWorkspacesByProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/ListWorktrees: ListWorkspacesByProject failed", "projectId", projectId, "err", err)
		return []db.Workspace{}
	}
	log.Info("app/ListWorktrees: success", "count", len(workspaces))
	return workspaces
}

// GetDefaultBranch returns the default branch for the repository at repoPath.
func (a *App) GetDefaultBranch(repoPath string) string {
	log.Info("app/GetDefaultBranch: called", "repoPath", repoPath)
	result := git.GetDefaultBranch(a.ctx, repoPath)
	log.Info("app/GetDefaultBranch: success", "branch", result)
	return result
}

// GetProjectBranches returns all branch names (local + remote) for a project.
func (a *App) GetProjectBranches(projectId string) []string {
	log.Info("app/GetProjectBranches: called", "projectId", projectId)
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/GetProjectBranches: project not found", "projectId", projectId, "err", err)
		return []string{}
	}

	log.Info("app/GetProjectBranches: resolving branches", "projectId", projectId, "repoPath", proj.RepoPath)

	seen := make(map[string]bool)
	var names []string

	local, err := git.ListBranches(a.ctx, proj.RepoPath)
	if err != nil {
		log.Error("app/GetProjectBranches: ListBranches error", "err", err)
	}
	log.Info("app/GetProjectBranches: local branches", "count", len(local))
	for _, b := range local {
		if !seen[b.Name] {
			seen[b.Name] = true
			names = append(names, b.Name)
		}
	}

	remote, err := git.ListRemoteBranches(a.ctx, proj.RepoPath)
	if err != nil {
		log.Error("app/GetProjectBranches: ListRemoteBranches error", "err", err)
	}
	log.Info("app/GetProjectBranches: remote branches", "count", len(remote))
	for _, b := range remote {
		name := strings.TrimPrefix(b.Name, "origin/")
		if name == "HEAD" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}

	log.Info("app/GetProjectBranches: success", "total", len(names))
	return names
}
