// Wails bindings for Phase 1 Activity Panel V2 — GitHub PR and CI status.
// Author: Subash Karki
package app

import (
	"fmt"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// IsGhAvailable returns true if the gh CLI is authenticated on this machine.
func (a *App) IsGhAvailable() bool {
	log.Info("app/IsGhAvailable: called")
	ok := git.IsGhAvailable(a.ctx)
	log.Info("app/IsGhAvailable: success", "available", ok)
	return ok
}

func (a *App) resolveRepoBranch(worktreeId string) (repoPath, branch string, err error) {
	repoPath, err = a.resolveWorkspacePath(worktreeId)
	if err != nil {
		return "", "", err
	}
	branch = git.GetCurrentBranch(a.ctx, repoPath)
	if branch == "" {
		return "", "", fmt.Errorf("could not determine branch for workspace %s", worktreeId)
	}
	return repoPath, branch, nil
}

func (a *App) GetPrStatusForWorkspace(worktreeId string) *git.PrStatus {
	log.Info("app/GetPrStatusForWorkspace: called", "worktreeId", worktreeId)
	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		log.Error("app/GetPrStatusForWorkspace: resolve failed", "err", err)
		return nil
	}
	pr, err := git.GetPrStatus(a.ctx, repoPath, branch)
	if err != nil {
		log.Error("app/GetPrStatusForWorkspace: failed", "branch", branch, "err", err)
		return nil
	}
	log.Info("app/GetPrStatusForWorkspace: success", "hasPR", pr != nil)
	return pr
}

func (a *App) GetCiRunsForWorkspace(worktreeId string) []git.CiRun {
	log.Info("app/GetCiRunsForWorkspace: called", "worktreeId", worktreeId)
	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		log.Error("app/GetCiRunsForWorkspace: resolve failed", "err", err)
		return nil
	}
	runs, err := git.GetCiRuns(a.ctx, repoPath, branch)
	if err != nil {
		log.Error("app/GetCiRunsForWorkspace: GetCiRuns failed", "worktreeId", worktreeId, "branch", branch, "err", err)
		return nil
	}

	log.Info("app/GetCiRunsForWorkspace: success", "worktreeId", worktreeId, "count", len(runs))
	return runs
}

// CreatePrWithAIForWorkspace creates a GitHub PR for the workspace branch using AI-generated content.
// On success, emits EventPrCreated and returns the new PrStatus.
// Returns nil on error.
func (a *App) CreatePrWithAIForWorkspace(worktreeId string) *git.PrStatus {
	log.Info("app/CreatePrWithAIForWorkspace: called", "worktreeId", worktreeId)
	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		log.Error("app/CreatePrWithAIForWorkspace: resolve failed", "err", err)
		return nil
	}
	baseBranch := resolveBaseBranch(a, worktreeId, repoPath)

	pr, err := git.CreatePrWithAI(a.ctx, repoPath, branch, baseBranch)
	if err != nil {
		log.Error("app/CreatePrWithAIForWorkspace: CreatePrWithAI failed", "worktreeId", worktreeId, "err", err)
		return nil
	}

	wailsRuntime.EventsEmit(a.ctx, EventPrCreated, pr)
	log.Info("app/CreatePrWithAIForWorkspace: success", "worktreeId", worktreeId, "number", pr.Number)
	return pr
}

// GetBranchCommits returns commits for the workspace.
// If branchOnly is true, returns only commits unique to the branch (not on base).
// If branchOnly is false, returns the full log (up to 50 commits).
func (a *App) GetBranchCommits(worktreeId string, branchOnly bool) []git.CommitInfo {
	log.Info("app/GetBranchCommits: called", "worktreeId", worktreeId, "branchOnly", branchOnly)

	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		log.Error("app/GetBranchCommits: resolve failed", "worktreeId", worktreeId, "err", err)
		return []git.CommitInfo{}
	}

	if branchOnly {
		baseBranch := resolveBaseBranch(a, worktreeId, repoPath)
		commits, err := git.LogBranchOnly(a.ctx, repoPath, baseBranch, 50)
		if err != nil {
			log.Error("app/GetBranchCommits: LogBranchOnly failed", "worktreeId", worktreeId, "err", err)
			return []git.CommitInfo{}
		}
		if commits == nil {
			return []git.CommitInfo{}
		}
		log.Info("app/GetBranchCommits: success (branch-only)", "worktreeId", worktreeId, "count", len(commits))
		return commits
	}

	commits, err := git.Log(a.ctx, repoPath, 50, 0)
	if err != nil {
		log.Error("app/GetBranchCommits: Log failed", "worktreeId", worktreeId, "err", err)
		return []git.CommitInfo{}
	}
	if commits == nil {
		return []git.CommitInfo{}
	}
	log.Info("app/GetBranchCommits: success", "worktreeId", worktreeId, "count", len(commits))
	return commits
}

// resolveBaseBranch returns the base branch for a workspace by consulting the project's
// DefaultBranch field, falling back to git auto-detection.
func resolveBaseBranch(a *App, worktreeId, repoPath string) string {
	q := db.New(a.DB.Reader)
	ws, err := q.GetWorkspace(a.ctx, worktreeId)
	if err != nil {
		return git.GetDefaultBranch(a.ctx, repoPath)
	}
	if ws.BaseBranch.Valid && ws.BaseBranch.String != "" {
		return ws.BaseBranch.String
	}
	proj, err := q.GetProject(a.ctx, ws.ProjectID)
	if err != nil {
		return git.GetDefaultBranch(a.ctx, repoPath)
	}
	if proj.DefaultBranch.Valid && proj.DefaultBranch.String != "" {
		return proj.DefaultBranch.String
	}
	return git.GetDefaultBranch(a.ctx, repoPath)
}
