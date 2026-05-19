// Author: Subash Karki
package git

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/charmbracelet/log"
)

// ghWorkflowsResponse is the GitHub API response for listing workflows.
type ghWorkflowsResponse struct {
	TotalCount int `json:"total_count"`
	Workflows  []struct {
		ID    int64  `json:"id"`
		Name  string `json:"name"`
		Path  string `json:"path"`
		State string `json:"state"`
	} `json:"workflows"`
}

// ghWorkflowRunsResponse is the GitHub API response for listing workflow runs.
type ghWorkflowRunsResponse struct {
	TotalCount   int `json:"total_count"`
	WorkflowRuns []struct {
		ID         int64  `json:"id"`
		Name       string `json:"name"`
		Status     string `json:"status"`
		Conclusion string `json:"conclusion"`
		HeadBranch string `json:"head_branch"`
		Event      string `json:"event"`
		RunNumber  int    `json:"run_number"`
		HTMLURL    string `json:"html_url"`
		CreatedAt  string `json:"created_at"`
		UpdatedAt  string `json:"updated_at"`
		WorkflowID int64  `json:"workflow_id"`
		Actor      struct {
			Login string `json:"login"`
		} `json:"actor"`
	} `json:"workflow_runs"`
}

// GetWorkflows returns the list of GitHub Actions workflow definitions for the repo.
func GetWorkflows(ctx context.Context, repoPath string) ([]Workflow, error) {
	owner, repo, err := resolveOwnerRepo(ctx, repoPath)
	if err != nil {
		log.Error("GetWorkflows: cannot resolve owner/repo", "path", repoPath, "err", err)
		return nil, nil
	}

	data, err := ghAPIGet(ctx, owner, repo, "actions/workflows?per_page=30")
	if err != nil {
		log.Error("GetWorkflows: API call failed", "err", err)
		return nil, nil
	}

	var resp ghWorkflowsResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("GetWorkflows: parse response: %w", err)
	}

	workflows := make([]Workflow, 0, len(resp.Workflows))
	for _, w := range resp.Workflows {
		workflows = append(workflows, Workflow{
			ID:    w.ID,
			Name:  w.Name,
			Path:  w.Path,
			State: w.State,
		})
	}

	log.Info("GetWorkflows", "repo", owner+"/"+repo, "count", len(workflows))
	return workflows, nil
}

// GetRecentWorkflowRuns returns recent workflow runs for the repo.
func GetRecentWorkflowRuns(ctx context.Context, repoPath string, limit int) ([]WorkflowRun, error) {
	owner, repo, err := resolveOwnerRepo(ctx, repoPath)
	if err != nil {
		log.Error("GetRecentWorkflowRuns: cannot resolve owner/repo", "path", repoPath, "err", err)
		return nil, nil
	}

	path := fmt.Sprintf("actions/runs?per_page=%d&exclude_pull_requests=true", limit)
	data, err := ghAPIGet(ctx, owner, repo, path)
	if err != nil {
		log.Error("GetRecentWorkflowRuns: API call failed", "err", err)
		return nil, nil
	}

	var resp ghWorkflowRunsResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("GetRecentWorkflowRuns: parse response: %w", err)
	}

	runs := make([]WorkflowRun, 0, len(resp.WorkflowRuns))
	for _, r := range resp.WorkflowRuns {
		runs = append(runs, WorkflowRun{
			ID:         r.ID,
			Name:       r.Name,
			Status:     r.Status,
			Conclusion: r.Conclusion,
			HeadBranch: r.HeadBranch,
			Event:      r.Event,
			RunNumber:  r.RunNumber,
			HTMLURL:    r.HTMLURL,
			CreatedAt:  r.CreatedAt,
			UpdatedAt:  r.UpdatedAt,
			WorkflowID: r.WorkflowID,
			ActorLogin: r.Actor.Login,
		})
	}

	log.Info("GetRecentWorkflowRuns", "repo", owner+"/"+repo, "count", len(runs))
	return runs, nil
}

// DispatchWorkflow triggers a workflow_dispatch event for the given workflow.
func DispatchWorkflow(ctx context.Context, repoPath string, workflowID int64, ref string) error {
	owner, repo, err := resolveOwnerRepo(ctx, repoPath)
	if err != nil {
		return fmt.Errorf("DispatchWorkflow: %w", err)
	}

	body, _ := json.Marshal(map[string]string{"ref": ref})
	path := fmt.Sprintf("actions/workflows/%d/dispatches", workflowID)

	status, err := ghAPIPost(ctx, owner, repo, path, body)
	if err != nil {
		return fmt.Errorf("DispatchWorkflow: %w", err)
	}
	if status != 204 {
		return fmt.Errorf("DispatchWorkflow: expected 204, got %d", status)
	}

	log.Info("DispatchWorkflow", "repo", owner+"/"+repo, "workflowID", workflowID, "ref", ref)
	return nil
}

// RerunWorkflow re-runs all jobs in a workflow run.
func RerunWorkflow(ctx context.Context, repoPath string, runID int64) error {
	owner, repo, err := resolveOwnerRepo(ctx, repoPath)
	if err != nil {
		return fmt.Errorf("RerunWorkflow: %w", err)
	}

	path := fmt.Sprintf("actions/runs/%d/rerun", runID)
	status, err := ghAPIPost(ctx, owner, repo, path, []byte("{}"))
	if err != nil {
		return fmt.Errorf("RerunWorkflow: %w", err)
	}
	if status != 201 {
		return fmt.Errorf("RerunWorkflow: expected 201, got %d", status)
	}

	log.Info("RerunWorkflow", "repo", owner+"/"+repo, "runID", runID)
	return nil
}

// CancelWorkflowRun cancels an in-progress workflow run.
func CancelWorkflowRun(ctx context.Context, repoPath string, runID int64) error {
	owner, repo, err := resolveOwnerRepo(ctx, repoPath)
	if err != nil {
		return fmt.Errorf("CancelWorkflowRun: %w", err)
	}

	path := fmt.Sprintf("actions/runs/%d/cancel", runID)
	status, err := ghAPIPost(ctx, owner, repo, path, []byte("{}"))
	if err != nil {
		return fmt.Errorf("CancelWorkflowRun: %w", err)
	}
	if status != 202 {
		return fmt.Errorf("CancelWorkflowRun: expected 202, got %d", status)
	}

	log.Info("CancelWorkflowRun", "repo", owner+"/"+repo, "runID", runID)
	return nil
}
