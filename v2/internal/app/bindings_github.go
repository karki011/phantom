// Wails bindings for Phase 1 Activity Panel V2 — GitHub PR and CI status.
// Author: Subash Karki
package app

import (
	"errors"
	"fmt"
	"strings"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	"github.com/subashkarki/phantom-os-v2/internal/perf"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// WatchWorktree sets the worktree the GitHub poller should track.
// Called by the frontend whenever the active worktree changes.
func (a *App) WatchWorktree(worktreeId string) {
	a.watchedMu.Lock()
	old := a.watchedWorktree
	a.watchedWorktree = worktreeId
	a.watchedMu.Unlock()

	log.Info("app/WatchWorktree: watching", "worktreeId", worktreeId)

	var newPath string
	if a.gitWatcher != nil {
		if old != "" && old != worktreeId {
			if oldPath, err := a.resolveWorkspacePath(old); err == nil {
				a.gitWatcher.UnwatchRepo(oldPath)
			}
		}
		if worktreeId != "" {
			if p, err := a.resolveWorkspacePath(worktreeId); err == nil {
				newPath = p
				a.gitWatcher.WatchRepo(newPath)
				a.gitWatcher.SetActiveProject(newPath)
			}
		} else {
			a.gitWatcher.SetActiveProjects(nil)
		}
	}

	if newPath != "" && a.gitWarmCache != nil {
		a.gitWarmCache.Warm(a.ctx, newPath)
	}

	// Keep Persona in sync with the active project path.
	if a.Persona != nil {
		a.Persona.SetProjectPath(newPath)
	}
}

// SetActiveWorktree is the explicit project-switch entry point. It updates
// the watcher's active set and warms the cache so the UI receives stale data
// instantly while fresh data flows in via SSE. Returns the warm snapshot.
func (a *App) SetActiveWorktree(worktreeId string) *git.WarmSnapshot {
	defer perf.Time(perf.RecordProjectSwitch)()
	if worktreeId == "" {
		if a.gitWatcher != nil {
			a.gitWatcher.SetActiveProjects(nil)
		}
		// Clear Persona project path when no worktree is active.
		if a.Persona != nil {
			a.Persona.SetProjectPath("")
		}
		return nil
	}
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		log.Error("app/SetActiveWorktree: resolve failed", "worktreeId", worktreeId, "err", err)
		return nil
	}
	if a.gitWatcher != nil {
		a.gitWatcher.SetActiveProject(repoPath)
	}
	// Keep Persona in sync with the active project path.
	if a.Persona != nil {
		a.Persona.SetProjectPath(repoPath)
	}
	if a.gitWarmCache == nil {
		return nil
	}
	snap := a.gitWarmCache.Warm(a.ctx, repoPath)
	return &snap
}

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
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetPrStatusForWorkspace: workspace gone, returning nil", "worktreeId", worktreeId)
			return nil
		}
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
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetCiRunsForWorkspace: workspace gone, returning nil", "worktreeId", worktreeId)
			return nil
		}
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

func (a *App) GetCiRunsForBranch(worktreeId string, branch string) []git.CiRun {
	log.Info("app/GetCiRunsForBranch: called", "worktreeId", worktreeId, "branch", branch)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetCiRunsForBranch: workspace gone, returning nil", "worktreeId", worktreeId)
			return nil
		}
		log.Error("app/GetCiRunsForBranch: resolve failed", "err", err)
		return nil
	}
	runs, err := git.GetCiRuns(a.ctx, repoPath, branch)
	if err != nil {
		log.Error("app/GetCiRunsForBranch: failed", "branch", branch, "err", err)
		return nil
	}
	if runs == nil {
		return []git.CiRun{}
	}
	log.Info("app/GetCiRunsForBranch: success", "branch", branch, "count", len(runs))
	return runs
}

func (a *App) GetFailedSteps(worktreeId string, checkURL string) []git.FailedStep {
	log.Info("app/GetFailedSteps: called", "worktreeId", worktreeId)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetFailedSteps: workspace gone, returning empty", "worktreeId", worktreeId)
			return []git.FailedStep{}
		}
		log.Error("app/GetFailedSteps: resolve failed", "err", err)
		return []git.FailedStep{}
	}
	steps, err := git.GetFailedSteps(a.ctx, repoPath, checkURL)
	if err != nil {
		log.Error("app/GetFailedSteps: failed", "err", err)
		return []git.FailedStep{}
	}
	if steps == nil {
		return []git.FailedStep{}
	}
	log.Info("app/GetFailedSteps: success", "count", len(steps))
	return steps
}

// CreatePrWithAIForWorkspace creates a GitHub PR for the workspace branch using AI-generated content.
// On success, emits EventPrCreated and returns the new PrStatus.
// Returns nil on error.
// When draft is true, creates a draft PR (`gh pr create --draft`) and guides Claude toward WIP-style title/body.
func (a *App) CreatePrWithAIForWorkspace(worktreeId string, draft bool) *git.PrStatus {
	log.Info("app/CreatePrWithAIForWorkspace: called", "worktreeId", worktreeId, "draft", draft)
	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/CreatePrWithAIForWorkspace: workspace gone, skipping", "worktreeId", worktreeId)
			return nil
		}
		log.Error("app/CreatePrWithAIForWorkspace: resolve failed", "err", err)
		return nil
	}
	preferred := resolveBaseBranch(a, worktreeId, repoPath)
	baseBranch := git.ResolvePrMergeBase(a.ctx, repoPath, preferred)

	pr, err := git.CreatePrWithAI(a.ctx, repoPath, branch, baseBranch, draft)
	if err != nil {
		log.Error("app/CreatePrWithAIForWorkspace: CreatePrWithAI failed", "worktreeId", worktreeId, "err", err)
		return nil
	}

	wailsRuntime.EventsEmit(a.ctx, EventPrCreated, pr)
	// Signal the poller to fetch immediately instead of waiting for the next tick.
	select {
	case a.prRefresh <- struct{}{}:
	default:
	}
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
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetBranchCommits: workspace gone, returning empty", "worktreeId", worktreeId)
			return []git.CommitInfo{}
		}
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

// ListOpenPrsForWorkspace returns open PRs targeting the workspace's current branch.
func (a *App) ListOpenPrsForWorkspace(worktreeId string, limit int) []git.PrStatus {
	log.Info("app/ListOpenPrsForWorkspace: called", "worktreeId", worktreeId, "limit", limit)
	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/ListOpenPrsForWorkspace: workspace gone, returning empty", "worktreeId", worktreeId)
			return []git.PrStatus{}
		}
		log.Error("app/ListOpenPrsForWorkspace: resolve failed", "err", err)
		return []git.PrStatus{}
	}
	prs, err := git.ListOpenPrsForBase(a.ctx, repoPath, branch, limit)
	if err != nil || prs == nil {
		log.Error("app/ListOpenPrsForWorkspace: failed", "err", err)
		return []git.PrStatus{}
	}
	log.Info("app/ListOpenPrsForWorkspace: success", "count", len(prs))
	return prs
}

// GetCheckAnnotations returns GitHub check annotations for a named check on the workspace's HEAD commit.
func (a *App) GetCheckAnnotations(worktreeId string, checkName string) []git.CheckAnnotation {
	log.Info("app/GetCheckAnnotations: called", "worktreeId", worktreeId, "checkName", checkName)
	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetCheckAnnotations: workspace gone, returning empty", "worktreeId", worktreeId)
			return []git.CheckAnnotation{}
		}
		log.Error("app/GetCheckAnnotations: resolve failed", "err", err)
		return []git.CheckAnnotation{}
	}
	annotations, err := git.GetCheckAnnotations(a.ctx, repoPath, branch, checkName)
	if err != nil {
		log.Error("app/GetCheckAnnotations: failed", "err", err)
		return []git.CheckAnnotation{}
	}
	if annotations == nil {
		return []git.CheckAnnotation{}
	}
	log.Info("app/GetCheckAnnotations: success", "count", len(annotations))
	return annotations
}

// GetRepoMergeConfigForWorkspace returns repo-level merge settings (squash/merge/rebase
// allowed, default method, queue presence) used to drive the Ship-It UI.
func (a *App) GetRepoMergeConfigForWorkspace(worktreeId string) *git.RepoMergeConfig {
	log.Info("app/GetRepoMergeConfigForWorkspace: called", "worktreeId", worktreeId)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetRepoMergeConfigForWorkspace: workspace gone, returning nil", "worktreeId", worktreeId)
			return nil
		}
		log.Error("app/GetRepoMergeConfigForWorkspace: resolve failed", "err", err)
		return nil
	}
	cfg := git.GetRepoMergeConfig(a.ctx, repoPath)
	return &cfg
}

// MergePrForWorkspace runs `gh pr merge` for the workspace's branch.
// On success, emits EventPrMerging (autoMerge) or EventPrMerged (direct ship)
// and nudges the poller. Returns "" on success, error message on failure.
func (a *App) MergePrForWorkspace(worktreeId, method string, autoMerge, deleteBranch bool) string {
	log.Info("app/MergePrForWorkspace: called",
		"worktreeId", worktreeId, "method", method, "autoMerge", autoMerge, "deleteBranch", deleteBranch)

	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/MergePrForWorkspace: workspace gone, skipping", "worktreeId", worktreeId)
			return ""
		}
		return fmt.Sprintf("workspace not found: %v", err)
	}

	prNumber := 0
	if pr, _ := git.GetPrStatus(a.ctx, repoPath, branch); pr != nil {
		prNumber = pr.Number
	}

	if err := git.MergePr(a.ctx, repoPath, branch, method, autoMerge, deleteBranch); err != nil {
		a.EmitMergeFailed(worktreeId, prNumber, err.Error())
		log.Error("app/MergePrForWorkspace: merge failed", "err", err)
		return err.Error()
	}

	if autoMerge {
		a.EmitPrMerging(worktreeId, prNumber, true)
	} else {
		a.EmitPrMerged(worktreeId, prNumber)
	}

	// Nudge the poller so the FE sees the new state quickly.
	select {
	case a.prRefresh <- struct{}{}:
	default:
	}

	log.Info("app/MergePrForWorkspace: success", "worktreeId", worktreeId, "prNumber", prNumber)
	return ""
}

// DisableAutoMergeForWorkspace cancels a pending `--auto` merge on the workspace's branch.
// Returns "" on success, error message on failure.
func (a *App) DisableAutoMergeForWorkspace(worktreeId string) string {
	log.Info("app/DisableAutoMergeForWorkspace: called", "worktreeId", worktreeId)
	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/DisableAutoMergeForWorkspace: workspace gone, skipping", "worktreeId", worktreeId)
			return ""
		}
		return fmt.Sprintf("workspace not found: %v", err)
	}
	if err := git.DisableAutoMerge(a.ctx, repoPath, branch); err != nil {
		log.Error("app/DisableAutoMergeForWorkspace: failed", "err", err)
		return err.Error()
	}
	select {
	case a.prRefresh <- struct{}{}:
	default:
	}
	return ""
}

// PostMergeCleanupForWorkspace switches to the base branch, pulls, and deletes
// the local feature branch. Returns "" on success.
func (a *App) PostMergeCleanupForWorkspace(worktreeId string) string {
	log.Info("app/PostMergeCleanupForWorkspace: called", "worktreeId", worktreeId)
	repoPath, branch, err := a.resolveRepoBranch(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/PostMergeCleanupForWorkspace: workspace gone, skipping", "worktreeId", worktreeId)
			return ""
		}
		return fmt.Sprintf("workspace not found: %v", err)
	}
	baseBranch := resolveBaseBranch(a, worktreeId, repoPath)
	if err := git.PostMergeCleanup(a.ctx, repoPath, baseBranch, branch); err != nil {
		log.Error("app/PostMergeCleanupForWorkspace: failed", "err", err)
		return err.Error()
	}
	a.EmitGitStatus()
	return ""
}

// GetWorkflowsForWorkspace returns GitHub Actions workflow definitions for the workspace's repo.
func (a *App) GetWorkflowsForWorkspace(worktreeId string) []git.Workflow {
	log.Info("app/GetWorkflowsForWorkspace: called", "worktreeId", worktreeId)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetWorkflowsForWorkspace: workspace gone, returning nil", "worktreeId", worktreeId)
			return nil
		}
		log.Error("app/GetWorkflowsForWorkspace: resolve failed", "err", err)
		return nil
	}
	workflows, err := git.GetWorkflows(a.ctx, repoPath)
	if err != nil {
		log.Error("app/GetWorkflowsForWorkspace: failed", "err", err)
		return nil
	}
	log.Info("app/GetWorkflowsForWorkspace: success", "count", len(workflows))
	return workflows
}

// GetWorkflowRunsForWorkspace returns recent GitHub Actions workflow runs for the workspace's repo.
func (a *App) GetWorkflowRunsForWorkspace(worktreeId string) []git.WorkflowRun {
	log.Info("app/GetWorkflowRunsForWorkspace: called", "worktreeId", worktreeId)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			log.Debug("app/GetWorkflowRunsForWorkspace: workspace gone, returning nil", "worktreeId", worktreeId)
			return nil
		}
		log.Error("app/GetWorkflowRunsForWorkspace: resolve failed", "err", err)
		return nil
	}
	runs, err := git.GetRecentWorkflowRuns(a.ctx, repoPath, 10)
	if err != nil {
		log.Error("app/GetWorkflowRunsForWorkspace: failed", "err", err)
		return nil
	}
	log.Info("app/GetWorkflowRunsForWorkspace: success", "count", len(runs))
	return runs
}

// DispatchWorkflowForWorkspace triggers a workflow_dispatch event.
// Returns "" on success, error message on failure.
func (a *App) DispatchWorkflowForWorkspace(worktreeId string, workflowID int64, ref string) string {
	log.Info("app/DispatchWorkflowForWorkspace: called", "worktreeId", worktreeId, "workflowID", workflowID, "ref", ref)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			return ""
		}
		return fmt.Sprintf("workspace not found: %v", err)
	}
	if err := git.DispatchWorkflow(a.ctx, repoPath, workflowID, ref); err != nil {
		log.Error("app/DispatchWorkflowForWorkspace: failed", "err", err)
		return err.Error()
	}
	// Nudge the poller for immediate re-fetch
	select {
	case a.workflowRefresh <- struct{}{}:
	default:
	}
	log.Info("app/DispatchWorkflowForWorkspace: success", "worktreeId", worktreeId)
	return ""
}

// RerunWorkflowForWorkspace re-runs all jobs in a workflow run.
// Returns "" on success, error message on failure.
func (a *App) RerunWorkflowForWorkspace(worktreeId string, runID int64) string {
	log.Info("app/RerunWorkflowForWorkspace: called", "worktreeId", worktreeId, "runID", runID)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			return ""
		}
		return fmt.Sprintf("workspace not found: %v", err)
	}
	if err := git.RerunWorkflow(a.ctx, repoPath, runID); err != nil {
		log.Error("app/RerunWorkflowForWorkspace: failed", "err", err)
		return err.Error()
	}
	select {
	case a.workflowRefresh <- struct{}{}:
	default:
	}
	log.Info("app/RerunWorkflowForWorkspace: success", "worktreeId", worktreeId)
	return ""
}

// CancelWorkflowRunForWorkspace cancels an in-progress workflow run.
// Returns "" on success, error message on failure.
func (a *App) CancelWorkflowRunForWorkspace(worktreeId string, runID int64) string {
	log.Info("app/CancelWorkflowRunForWorkspace: called", "worktreeId", worktreeId, "runID", runID)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		if errors.Is(err, ErrWorkspaceGone) {
			return ""
		}
		return fmt.Sprintf("workspace not found: %v", err)
	}
	if err := git.CancelWorkflowRun(a.ctx, repoPath, runID); err != nil {
		log.Error("app/CancelWorkflowRunForWorkspace: failed", "err", err)
		return err.Error()
	}
	select {
	case a.workflowRefresh <- struct{}{}:
	default:
	}
	log.Info("app/CancelWorkflowRunForWorkspace: success", "worktreeId", worktreeId)
	return ""
}

// RubberStampPrForWorkspace approves a PR with a rubber stamp after verifying greptile score and ownership.
func (a *App) RubberStampPrForWorkspace(worktreeId string, prNumber int) string {
	log.Info("app/RubberStampPr: called", "worktreeId", worktreeId, "prNumber", prNumber)
	repoPath, err := a.resolveWorkspacePath(worktreeId)
	if err != nil {
		return "failed to resolve workspace"
	}

	pr, err := git.GetPrStatus(a.ctx, repoPath, fmt.Sprintf("%d", prNumber))
	if err != nil || pr == nil {
		return "could not fetch PR status"
	}

	if pr.GreptileScore == "" || !strings.HasPrefix(pr.GreptileScore, "5") {
		return "greptile score must be 5/5"
	}

	login := git.GetGitHubLogin(a.ctx)
	if login != "" && strings.EqualFold(login, pr.Author) {
		return "cannot approve your own PR"
	}

	if err := git.ApprovePr(a.ctx, repoPath, prNumber); err != nil {
		return err.Error()
	}

	wailsRuntime.EventsEmit(a.ctx, EventPrApproved, map[string]interface{}{
		"worktreeId": worktreeId,
		"prNumber":   prNumber,
	})
	select {
	case a.prRefresh <- struct{}{}:
	default:
	}
	log.Info("app/RubberStampPr: success", "worktreeId", worktreeId, "prNumber", prNumber)
	return ""
}

// GetGitHubLoginForWorkspace returns the authenticated GitHub user's login.
func (a *App) GetGitHubLoginForWorkspace() string {
	return git.GetGitHubLogin(a.ctx)
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
