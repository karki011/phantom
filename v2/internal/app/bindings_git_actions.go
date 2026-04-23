// Wails bindings for Phase 2 git write operations.
// Author: Subash Karki
package app

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// resolveWorkspacePath returns the filesystem repo path for a workspace.
// Branch-type workspaces use the project's RepoPath; worktree-type use WorktreePath.
func (a *App) resolveWorkspacePath(workspaceId string) (string, error) {
	q := db.New(a.DB.Reader)
	ws, err := q.GetWorkspace(a.ctx, workspaceId)
	if err != nil {
		return "", fmt.Errorf("workspace %s not found: %w", workspaceId, err)
	}
	if ws.Type == "branch" {
		proj, err := q.GetProject(a.ctx, ws.ProjectID)
		if err != nil {
			return "", fmt.Errorf("project %s not found: %w", ws.ProjectID, err)
		}
		return proj.RepoPath, nil
	}
	if !ws.WorktreePath.Valid || ws.WorktreePath.String == "" {
		return "", fmt.Errorf("workspace %s has no worktree path", workspaceId)
	}
	return ws.WorktreePath.String, nil
}

// GitFetch fetches origin for the given project.
func (a *App) GitFetch(projectId string) error {
	log.Info("app/GitFetch: called", "projectId", projectId)
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/GitFetch: project not found", "projectId", projectId, "err", err)
		return err
	}
	if err := git.FetchOrigin(a.ctx, proj.RepoPath); err != nil {
		log.Error("app/GitFetch: FetchOrigin failed", "repoPath", proj.RepoPath, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitFetch: success", "projectId", projectId)
	return nil
}

// GitPull pulls from origin for the workspace's repo path.
func (a *App) GitPull(workspaceId string) error {
	log.Info("app/GitPull: called", "workspaceId", workspaceId)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GitPull: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}
	if err := git.Pull(a.ctx, repoPath); err != nil {
		log.Error("app/GitPull: Pull failed", "repoPath", repoPath, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitPull: success", "workspaceId", workspaceId)
	return nil
}

// GitPush pushes the current branch to origin for the workspace's repo path.
func (a *App) GitPush(workspaceId string) error {
	log.Info("app/GitPush: called", "workspaceId", workspaceId)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GitPush: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}
	if err := git.Push(a.ctx, repoPath); err != nil {
		log.Error("app/GitPush: Push failed", "repoPath", repoPath, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitPush: success", "workspaceId", workspaceId)
	return nil
}

// GitCheckoutBranch checks out the specified branch in the project's repo.
// Returns an error if there are uncommitted changes that would conflict.
func (a *App) GitCheckoutBranch(projectId, branch string) error {
	log.Info("app/GitCheckoutBranch: called", "projectId", projectId, "branch", branch)
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/GitCheckoutBranch: project not found", "projectId", projectId, "err", err)
		return err
	}
	dirty, _ := git.HasUncommittedChanges(a.ctx, proj.RepoPath)
	if dirty {
		return fmt.Errorf("uncommitted changes — commit or stash before switching branches")
	}
	if err := git.CheckoutBranch(a.ctx, proj.RepoPath, branch); err != nil {
		log.Error("app/GitCheckoutBranch: CheckoutBranch failed", "branch", branch, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitCheckoutBranch: success", "projectId", projectId, "branch", branch)
	return nil
}

// GitStage stages the specified paths in the workspace's repo.
func (a *App) GitStage(workspaceId string, paths []string) error {
	log.Info("app/GitStage: called", "workspaceId", workspaceId, "count", len(paths))
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GitStage: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}
	if err := git.Stage(a.ctx, repoPath, paths...); err != nil {
		log.Error("app/GitStage: Stage failed", "repoPath", repoPath, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitStage: success", "workspaceId", workspaceId, "count", len(paths))
	return nil
}

// GitStageAll stages all changes in the workspace's repo.
func (a *App) GitStageAll(workspaceId string) error {
	log.Info("app/GitStageAll: called", "workspaceId", workspaceId)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GitStageAll: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}
	if err := git.StageAll(a.ctx, repoPath); err != nil {
		log.Error("app/GitStageAll: StageAll failed", "repoPath", repoPath, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitStageAll: success", "workspaceId", workspaceId)
	return nil
}

// GitUnstage removes the specified paths from the staging area.
func (a *App) GitUnstage(workspaceId string, paths []string) error {
	log.Info("app/GitUnstage: called", "workspaceId", workspaceId, "count", len(paths))
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GitUnstage: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}
	if err := git.Unstage(a.ctx, repoPath, paths...); err != nil {
		log.Error("app/GitUnstage: Unstage failed", "repoPath", repoPath, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitUnstage: success", "workspaceId", workspaceId, "count", len(paths))
	return nil
}

// GitCommit commits staged changes with the given message.
func (a *App) GitCommit(workspaceId, message string) error {
	log.Info("app/GitCommit: called", "workspaceId", workspaceId, "message", message)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GitCommit: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}
	if err := git.Commit(a.ctx, repoPath, message); err != nil {
		log.Error("app/GitCommit: Commit failed", "repoPath", repoPath, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitCommit: success", "workspaceId", workspaceId)
	return nil
}

// GitDiscard discards working-tree changes for the specified paths.
func (a *App) GitDiscard(workspaceId string, paths []string) error {
	log.Info("app/GitDiscard: called", "workspaceId", workspaceId, "count", len(paths))
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GitDiscard: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}
	if err := git.Discard(a.ctx, repoPath, paths...); err != nil {
		log.Error("app/GitDiscard: Discard failed", "repoPath", repoPath, "err", err)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
	log.Info("app/GitDiscard: success", "workspaceId", workspaceId, "count", len(paths))
	return nil
}

// RenameWorktree moves the worktree to a new path derived from newName and updates the DB.
func (a *App) RenameWorktree(worktreeId, newName string) error {
	log.Info("app/RenameWorktree: called", "worktreeId", worktreeId, "newName", newName)
	q := db.New(a.DB.Reader)
	ws, err := q.GetWorkspace(a.ctx, worktreeId)
	if err != nil {
		log.Error("app/RenameWorktree: workspace not found", "worktreeId", worktreeId, "err", err)
		return fmt.Errorf("workspace %s not found: %w", worktreeId, err)
	}

	if !ws.WorktreePath.Valid || ws.WorktreePath.String == "" {
		return fmt.Errorf("workspace %s has no worktree path", worktreeId)
	}

	proj, err := q.GetProject(a.ctx, ws.ProjectID)
	if err != nil {
		log.Error("app/RenameWorktree: project not found", "projectId", ws.ProjectID, "err", err)
		return err
	}

	newPath, err := git.GetWorktreeDir(proj.Name, newName)
	if err != nil {
		log.Error("app/RenameWorktree: GetWorktreeDir failed", "err", err)
		return err
	}

	if err := git.Move(a.ctx, ws.WorktreePath.String, newPath); err != nil {
		log.Error("app/RenameWorktree: Move failed", "from", ws.WorktreePath.String, "to", newPath, "err", err)
		return err
	}

	wq := db.New(a.DB.Writer)
	updateParams := db.UpdateWorkspaceParams{
		ID:           worktreeId,
		Type:         ws.Type,
		Name:         newName,
		Branch:       ws.Branch,
		WorktreePath: sql.NullString{String: newPath, Valid: true},
		PortBase:     ws.PortBase,
		SectionID:    ws.SectionID,
		BaseBranch:   ws.BaseBranch,
		TabOrder:     ws.TabOrder,
		IsActive:     ws.IsActive,
		TicketUrl:    ws.TicketUrl,
	}
	if err := wq.UpdateWorkspace(a.ctx, updateParams); err != nil {
		log.Error("app/RenameWorktree: UpdateWorkspace failed", "worktreeId", worktreeId, "err", err)
		return err
	}

	wailsRuntime.EventsEmit(a.ctx, EventWorktreeUpdated)
	log.Info("app/RenameWorktree: success", "worktreeId", worktreeId, "newName", newName, "newPath", newPath)
	return nil
}

// GetWorkspaceStatus returns the full working-tree status for the workspace.
func (a *App) GetWorkspaceStatus(workspaceId string) *git.RepoStatus {
	log.Info("app/GetWorkspaceStatus: called", "workspaceId", workspaceId)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GetWorkspaceStatus: resolve error", "workspaceId", workspaceId, "err", err)
		return nil
	}
	log.Info("app/GetWorkspaceStatus: resolved path", "repoPath", repoPath)
	rs, err := git.GetRepoStatus(a.ctx, repoPath)
	if err != nil {
		log.Error("app/GetWorkspaceStatus: GetRepoStatus error", "repoPath", repoPath, "err", err)
		return nil
	}
	log.Info("app/GetWorkspaceStatus: success", "branch", rs.Branch, "staged", len(rs.Staged), "unstaged", len(rs.Unstaged), "untracked", len(rs.Untracked))
	return rs
}

// RefreshWorkspaceStatus fetches from origin then returns the full status.
// Use this for the Refresh button so ahead/behind counts reflect remote state.
func (a *App) RefreshWorkspaceStatus(workspaceId string) *git.RepoStatus {
	log.Info("app/RefreshWorkspaceStatus: called", "workspaceId", workspaceId)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/RefreshWorkspaceStatus: resolve error", "workspaceId", workspaceId, "err", err)
		return nil
	}
	if err := git.FetchOrigin(a.ctx, repoPath); err != nil {
		log.Warn("app/RefreshWorkspaceStatus: fetch error (continuing)", "repoPath", repoPath, "err", err)
	}
	rs, err := git.GetRepoStatus(a.ctx, repoPath)
	if err != nil {
		log.Error("app/RefreshWorkspaceStatus: status error", "repoPath", repoPath, "err", err)
		return nil
	}
	log.Info("app/RefreshWorkspaceStatus: success", "branch", rs.Branch, "aheadBy", rs.AheadBy, "behindBy", rs.BehindBy)
	return rs
}

// GetWorkspaceChanges returns a flat list of all staged + unstaged + untracked files.
func (a *App) GetWorkspaceChanges(workspaceId string) []git.FileStatus {
	log.Info("app/GetWorkspaceChanges: called", "workspaceId", workspaceId)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GetWorkspaceChanges: resolve failed", "workspaceId", workspaceId, "err", err)
		return []git.FileStatus{}
	}
	rs, err := git.GetRepoStatus(a.ctx, repoPath)
	if err != nil {
		log.Error("app/GetWorkspaceChanges: GetRepoStatus failed", "repoPath", repoPath, "err", err)
		return []git.FileStatus{}
	}

	seen := make(map[string]bool)
	result := make([]git.FileStatus, 0)

	for _, f := range rs.Staged {
		if !seen[f.Path] {
			seen[f.Path] = true
			result = append(result, f)
		}
	}
	for _, f := range rs.Unstaged {
		if !seen[f.Path] {
			seen[f.Path] = true
			result = append(result, f)
		}
	}
	for _, f := range rs.Untracked {
		if !seen[f.Path] {
			seen[f.Path] = true
			result = append(result, f)
		}
	}
	log.Info("app/GetWorkspaceChanges: success", "workspaceId", workspaceId, "count", len(result))
	return result
}

// GetWorkspaceCommitLog returns commit history for the workspace.
// For the default branch it returns full history (up to limit).
// For feature branches it returns only commits unique to that branch (branch..base).
func (a *App) GetWorkspaceCommitLog(workspaceId string, limit int) []git.CommitInfo {
	log.Info("app/GetWorkspaceCommitLog: called", "workspaceId", workspaceId, "limit", limit)
	q := db.New(a.DB.Reader)
	ws, err := q.GetWorkspace(a.ctx, workspaceId)
	if err != nil {
		log.Error("app/GetWorkspaceCommitLog: workspace not found", "workspaceId", workspaceId, "err", err)
		return []git.CommitInfo{}
	}

	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GetWorkspaceCommitLog: resolve failed", "workspaceId", workspaceId, "err", err)
		return []git.CommitInfo{}
	}
	if limit <= 0 {
		limit = 50
	}

	proj, err := q.GetProject(a.ctx, ws.ProjectID)
	if err != nil {
		log.Error("app/GetWorkspaceCommitLog: project not found", "projectId", ws.ProjectID, "err", err)
		return []git.CommitInfo{}
	}

	defaultBranch := "main"
	if proj.DefaultBranch.Valid && proj.DefaultBranch.String != "" {
		defaultBranch = proj.DefaultBranch.String
	}

	isDefault := ws.Branch == defaultBranch || ws.Type == "branch"

	if !isDefault {
		base := defaultBranch
		if ws.BaseBranch.Valid && ws.BaseBranch.String != "" {
			base = ws.BaseBranch.String
		}
		commits, err := git.LogBranch(a.ctx, repoPath, ws.Branch, base)
		if err != nil {
			log.Error("app/GetWorkspaceCommitLog: LogBranch error", "branch", ws.Branch, "base", base, "err", err)
		} else if len(commits) > 0 {
			if len(commits) > limit {
				commits = commits[:limit]
			}
			log.Info("app/GetWorkspaceCommitLog: success (branch-only)", "workspaceId", workspaceId, "count", len(commits))
			return commits
		}
	}

	commits, err := git.Log(a.ctx, repoPath, limit, 0)
	if err != nil {
		log.Error("app/GetWorkspaceCommitLog: Log failed", "repoPath", repoPath, "err", err)
		return []git.CommitInfo{}
	}
	if commits == nil {
		return []git.CommitInfo{}
	}
	log.Info("app/GetWorkspaceCommitLog: success", "workspaceId", workspaceId, "count", len(commits))
	return commits
}

// ListWorkspaceFiles returns a one-level directory listing with git status for the workspace root.
func (a *App) ListWorkspaceFiles(workspaceId string) []git.FileEntry {
	log.Info("app/ListWorkspaceFiles: called", "workspaceId", workspaceId)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/ListWorkspaceFiles: resolve failed", "workspaceId", workspaceId, "err", err)
		return []git.FileEntry{}
	}
	entries, err := git.ListDirectory(a.ctx, repoPath, repoPath)
	if err != nil {
		log.Error("app/ListWorkspaceFiles: ListDirectory failed", "repoPath", repoPath, "err", err)
		return []git.FileEntry{}
	}
	if entries == nil {
		return []git.FileEntry{}
	}
	log.Info("app/ListWorkspaceFiles: success", "workspaceId", workspaceId, "count", len(entries))
	return entries
}

// SearchWorkspaceFiles searches for files matching a query in the workspace.
// Uses git ls-files for fast indexed search, filtered by case-insensitive substring match.
// Returns at most 50 results. Empty query returns an empty slice.
func (a *App) SearchWorkspaceFiles(workspaceId string, query string) []git.FileEntry {
	query = strings.TrimSpace(query)
	if query == "" {
		return []git.FileEntry{}
	}

	log.Info("app/SearchWorkspaceFiles: called", "workspaceId", workspaceId, "query", query)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/SearchWorkspaceFiles: resolve failed", "workspaceId", workspaceId, "err", err)
		return []git.FileEntry{}
	}

	files, err := git.LsFiles(a.ctx, repoPath)
	if err != nil {
		log.Error("app/SearchWorkspaceFiles: LsFiles failed", "repoPath", repoPath, "err", err)
		return []git.FileEntry{}
	}

	lowerQuery := strings.ToLower(query)
	result := make([]git.FileEntry, 0)
	for _, f := range files {
		if f == "" {
			continue
		}
		if strings.Contains(strings.ToLower(f), lowerQuery) {
			name := filepath.Base(f)
			result = append(result, git.FileEntry{
				Name:      name,
				Path:      f,
				IsDir:     false,
				GitStatus: "",
			})
			if len(result) >= 50 {
				break
			}
		}
	}
	log.Info("app/SearchWorkspaceFiles: success", "workspaceId", workspaceId, "query", query, "count", len(result))
	return result
}

// ListWorkspaceDir returns a directory listing for a specific subdirectory within the workspace.
func (a *App) ListWorkspaceDir(workspaceId, relativePath string) []git.FileEntry {
	log.Info("app/ListWorkspaceDir: called", "workspaceId", workspaceId, "relativePath", relativePath)
	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/ListWorkspaceDir: resolve failed", "workspaceId", workspaceId, "err", err)
		return []git.FileEntry{}
	}
	// Resolve full path and sanitize to prevent directory traversal.
	dirPath := filepath.Join(repoPath, filepath.Clean(relativePath))
	if !strings.HasPrefix(dirPath, repoPath) {
		log.Warn("app/ListWorkspaceDir: path traversal attempt", "relativePath", relativePath)
		return []git.FileEntry{}
	}
	entries, err := git.ListDirectory(a.ctx, repoPath, dirPath)
	if err != nil {
		log.Error("app/ListWorkspaceDir: ListDirectory failed", "dirPath", dirPath, "err", err)
		return []git.FileEntry{}
	}
	if entries == nil {
		return []git.FileEntry{}
	}
	log.Info("app/ListWorkspaceDir: success", "workspaceId", workspaceId, "relativePath", relativePath, "count", len(entries))
	return entries
}
