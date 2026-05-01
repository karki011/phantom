// Package git provides GitHub CLI integration for PR and CI status queries.
//
// Author: Subash Karki
package git

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// IsGhAvailable returns true if the gh CLI is authenticated and available.
func IsGhAvailable(ctx context.Context) bool {
	log.Info("git/IsGhAvailable: called")
	cmd := exec.CommandContext(ctx, ghBin(), "auth", "status")
	err := cmd.Run()
	if err != nil {
		log.Info("git/IsGhAvailable: gh not available", "err", err)
		return false
	}
	log.Info("git/IsGhAvailable: success")
	return true
}

// GetRemoteURL returns the remote URL for origin in the given repo.
func GetRemoteURL(ctx context.Context, repoPath string) (string, error) {
	log.Info("git/GetRemoteURL: called", "repoPath", repoPath)
	out, err := runGit(ctx, repoPath, "remote", "get-url", "origin")
	if err != nil {
		log.Error("git/GetRemoteURL: failed", "repoPath", repoPath, "err", err)
		return "", err
	}
	log.Info("git/GetRemoteURL: success", "url", out)
	return out, nil
}

// ghPrJSON is the raw JSON shape returned by `gh pr view`.
type ghPrJSON struct {
	Number            int                   `json:"number"`
	Title             string                `json:"title"`
	State             string                `json:"state"`
	IsDraft           bool                  `json:"isDraft"`
	URL               string                `json:"url"`
	HeadRefName       string                `json:"headRefName"`
	BaseRefName       string                `json:"baseRefName"`
	Author            ghAuthorJSON          `json:"author"`
	CreatedAt         string                `json:"createdAt"`
	MergedAt          string                `json:"mergedAt"`
	StatusCheckRollup []ghCheckRunJSON      `json:"statusCheckRollup"`
	Mergeable         string                `json:"mergeable"`
	MergeStateStatus  string                `json:"mergeStateStatus"`
	ReviewDecision    string                `json:"reviewDecision"`
	AutoMergeRequest  *ghAutoMergeJSON      `json:"autoMergeRequest"`
	LatestReviews     []ghReviewJSON        `json:"latestReviews"`
	ReviewRequests    []ghReviewRequestJSON `json:"reviewRequests"`
}

type ghAuthorJSON struct {
	Login     string `json:"login"`
	AvatarUrl string `json:"avatarUrl"`
}

type ghAutoMergeJSON struct {
	MergeMethod string `json:"mergeMethod"`
}

type ghReviewJSON struct {
	State       string       `json:"state"`
	SubmittedAt string       `json:"submittedAt"`
	Author      ghAuthorJSON `json:"author"`
}

// ghReviewRequestJSON: gh CLI returns either a user (login + avatarUrl)
// or a team (name only, no login).
type ghReviewRequestJSON struct {
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarUrl string `json:"avatarUrl"`
}

type ghCheckRunJSON struct {
	Conclusion string `json:"conclusion"`
	Status     string `json:"status"`
}

func computeCheckSummary(checks []ghCheckRunJSON) (passed, failed, pending int) {
	for _, c := range checks {
		switch strings.ToUpper(c.Conclusion) {
		case "SUCCESS":
			passed++
		case "FAILURE":
			failed++
		case "SKIPPED", "CANCELLED", "NEUTRAL":
			// don't count
		default:
			if c.Status != "COMPLETED" {
				pending++
			}
		}
	}
	return
}

// GetPrStatus returns the PR status for the given branch in repoPath.
// Returns nil, nil if no PR exists (non-zero exit from gh).
func GetPrStatus(ctx context.Context, repoPath, branch string) (*PrStatus, error) {
	log.Info("git/GetPrStatus: called", "repoPath", repoPath, "branch", branch)

	cmd := exec.CommandContext(ctx, ghBin(), "pr", "view", branch,
		"--json", "number,title,state,url,headRefName,baseRefName,isDraft,author,createdAt,mergedAt,statusCheckRollup,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest,latestReviews,reviewRequests",
	)
	cmd.Dir = repoPath
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Info("git/GetPrStatus: no PR found", "branch", branch, "stderr", stderr.String())
		return nil, nil
	}

	var raw ghPrJSON
	if err := json.Unmarshal(stdout.Bytes(), &raw); err != nil {
		log.Error("git/GetPrStatus: json parse failed", "err", err)
		return nil, fmt.Errorf("GetPrStatus: json: %w", err)
	}

	passed, failed, pending := computeCheckSummary(raw.StatusCheckRollup)
	approvers, changesRequested := classifyReviews(raw.LatestReviews)
	awaiting := mapReviewRequests(raw.ReviewRequests)

	autoMethod := ""
	if raw.AutoMergeRequest != nil {
		autoMethod = raw.AutoMergeRequest.MergeMethod
	}

	pr := &PrStatus{
		Number:             raw.Number,
		Title:              raw.Title,
		State:              raw.State,
		IsDraft:            raw.IsDraft,
		URL:                raw.URL,
		HeadRefName:        raw.HeadRefName,
		BaseRefName:        raw.BaseRefName,
		Author:             raw.Author.Login,
		CreatedAt:          raw.CreatedAt,
		MergedAt:           raw.MergedAt,
		ChecksPassed:       passed,
		ChecksFailed:       failed,
		ChecksPending:      pending,
		ChecksTotal:        len(raw.StatusCheckRollup),
		Mergeable:          raw.Mergeable,
		MergeStateStatus:   raw.MergeStateStatus,
		ReviewDecision:     raw.ReviewDecision,
		IsAutoMerging:      raw.AutoMergeRequest != nil,
		AutoMergeMethod:    autoMethod,
		Approvers:          approvers,
		ChangesRequestedBy: changesRequested,
		AwaitingReviewFrom: awaiting,
	}

	// Best-effort: fetch merge queue state via GraphQL.
	if state, position, eta, ok := getMergeQueueEntry(ctx, repoPath, raw.Number); ok {
		pr.MergeQueueState = state
		pr.MergeQueuePosition = position
		pr.MergeQueueEta = eta
	}

	log.Info("git/GetPrStatus: success",
		"number", pr.Number, "state", pr.State, "checks", pr.ChecksTotal,
		"mergeState", pr.MergeStateStatus, "reviewDecision", pr.ReviewDecision)
	return pr, nil
}

// classifyReviews returns the latest distinct approvers and reviewers who requested changes.
// `latestReviews` from gh contains the most recent review per reviewer, so we just bucket by state.
func classifyReviews(reviews []ghReviewJSON) (approvers, changesRequested []Reviewer) {
	for _, r := range reviews {
		if r.Author.Login == "" {
			continue
		}
		switch strings.ToUpper(r.State) {
		case "APPROVED":
			approvers = append(approvers, Reviewer{Login: r.Author.Login, AvatarUrl: r.Author.AvatarUrl})
		case "CHANGES_REQUESTED":
			changesRequested = append(changesRequested, Reviewer{Login: r.Author.Login, AvatarUrl: r.Author.AvatarUrl})
		}
	}
	return
}

// mapReviewRequests converts pending review requests (users + teams) into Reviewers.
// Teams have a Name but no Login; we synthesize a "team:<name>" login so the FE can distinguish them.
func mapReviewRequests(reqs []ghReviewRequestJSON) []Reviewer {
	out := make([]Reviewer, 0, len(reqs))
	for _, r := range reqs {
		if r.Login != "" {
			out = append(out, Reviewer{Login: r.Login, AvatarUrl: r.AvatarUrl})
		} else if r.Name != "" {
			out = append(out, Reviewer{Login: "team:" + r.Name})
		}
	}
	return out
}

// getMergeQueueEntry queries GraphQL for queue state. Best-effort; returns ok=false on any error.
// `gh pr view --json` does NOT expose mergeQueueEntry — graphql is the only path.
func getMergeQueueEntry(ctx context.Context, repoPath string, prNumber int) (state string, position, eta int, ok bool) {
	remote, err := GetRemoteURL(ctx, repoPath)
	if err != nil {
		return "", 0, 0, false
	}
	ownerRepo := parseOwnerRepo(remote)
	if ownerRepo == "" {
		return "", 0, 0, false
	}
	parts := strings.SplitN(ownerRepo, "/", 2)
	if len(parts) != 2 {
		return "", 0, 0, false
	}
	owner, name := parts[0], parts[1]

	query := `query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){pullRequest(number:$num){mergeQueueEntry{state position estimatedTimeToMerge}}}}`

	cmd := exec.CommandContext(ctx, ghBin(), "api", "graphql",
		"-f", "query="+query,
		"-F", "owner="+owner,
		"-F", "name="+name,
		"-F", fmt.Sprintf("num=%d", prNumber),
	)
	cmd.Dir = repoPath
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return "", 0, 0, false
	}
	var resp struct {
		Data struct {
			Repository struct {
				PullRequest struct {
					MergeQueueEntry *struct {
						State                string `json:"state"`
						Position             int    `json:"position"`
						EstimatedTimeToMerge int    `json:"estimatedTimeToMerge"`
					} `json:"mergeQueueEntry"`
				} `json:"pullRequest"`
			} `json:"repository"`
		} `json:"data"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &resp); err != nil {
		return "", 0, 0, false
	}
	entry := resp.Data.Repository.PullRequest.MergeQueueEntry
	if entry == nil {
		return "", 0, 0, false
	}
	return entry.State, entry.Position, entry.EstimatedTimeToMerge, true
}

// ListOpenPrsForBase returns open PRs targeting the given base branch.
func ListOpenPrsForBase(ctx context.Context, repoPath, baseBranch string, limit int) ([]PrStatus, error) {
	log.Info("git/ListOpenPrsForBase: called", "repoPath", repoPath, "base", baseBranch, "limit", limit)

	cmd := exec.CommandContext(ctx, ghBin(), "pr", "list",
		"--base", baseBranch,
		"--state", "open",
		"--limit", fmt.Sprintf("%d", limit),
		"--json", "number,title,state,url,headRefName,baseRefName,isDraft,author,createdAt,statusCheckRollup",
	)
	cmd.Dir = repoPath
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Info("git/ListOpenPrsForBase: failed", "err", err, "stderr", stderr.String())
		return nil, nil
	}

	var raw []ghPrJSON
	if err := json.Unmarshal(stdout.Bytes(), &raw); err != nil {
		log.Error("git/ListOpenPrsForBase: json parse failed", "err", err)
		return nil, fmt.Errorf("ListOpenPrsForBase: json: %w", err)
	}

	prs := make([]PrStatus, 0, len(raw))
	for _, r := range raw {
		passed, failed, pending := computeCheckSummary(r.StatusCheckRollup)
		approvers, changesRequested := classifyReviews(r.LatestReviews)
		awaiting := mapReviewRequests(r.ReviewRequests)
		autoMethod := ""
		if r.AutoMergeRequest != nil {
			autoMethod = r.AutoMergeRequest.MergeMethod
		}
		prs = append(prs, PrStatus{
			Number:             r.Number,
			Title:              r.Title,
			State:              r.State,
			IsDraft:            r.IsDraft,
			URL:                r.URL,
			HeadRefName:        r.HeadRefName,
			BaseRefName:        r.BaseRefName,
			Author:             r.Author.Login,
			CreatedAt:          r.CreatedAt,
			MergedAt:           r.MergedAt,
			ChecksPassed:       passed,
			ChecksFailed:       failed,
			ChecksPending:      pending,
			ChecksTotal:        len(r.StatusCheckRollup),
			Mergeable:          r.Mergeable,
			MergeStateStatus:   r.MergeStateStatus,
			ReviewDecision:     r.ReviewDecision,
			IsAutoMerging:      r.AutoMergeRequest != nil,
			AutoMergeMethod:    autoMethod,
			Approvers:          approvers,
			ChangesRequestedBy: changesRequested,
			AwaitingReviewFrom: awaiting,
		})
	}
	log.Info("git/ListOpenPrsForBase: success", "count", len(prs))
	return prs, nil
}

// ghCheckJSON is the raw JSON shape returned by `gh pr checks`.
type ghCheckJSON struct {
	Name        string `json:"name"`
	State       string `json:"state"`    // SUCCESS, FAILURE, SKIPPED, PENDING, etc.
	Bucket      string `json:"bucket"`   // pass, fail, pending, skipping
	Link        string `json:"link"`
	Workflow    string `json:"workflow"`
	Description string `json:"description"`
}

// GetCiRuns returns CI check runs for the given branch's PR.
// Returns nil, nil if no PR exists or no checks are found.
func GetCiRuns(ctx context.Context, repoPath, branch string) ([]CiRun, error) {
	log.Info("git/GetCiRuns: called", "repoPath", repoPath, "branch", branch)

	cmd := exec.CommandContext(ctx, ghBin(), "pr", "checks", branch,
		"--json", "name,state,bucket,link,workflow,description",
	)
	cmd.Dir = repoPath
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Info("git/GetCiRuns: no checks found", "branch", branch, "stderr", stderr.String())
		return nil, nil
	}

	var raw []ghCheckJSON
	if err := json.Unmarshal(stdout.Bytes(), &raw); err != nil {
		log.Error("git/GetCiRuns: json parse failed", "err", err)
		return nil, fmt.Errorf("GetCiRuns: json: %w", err)
	}

	if len(raw) == 0 {
		log.Info("git/GetCiRuns: no checks in response", "branch", branch)
		return []CiRun{}, nil
	}

	runs := make([]CiRun, 0, len(raw))
	for _, r := range raw {
		conclusion := mapStateToConclusion(r.State)
		runs = append(runs, CiRun{
			Name:        r.Name,
			Status:      mapBucketToStatus(r.Bucket),
			Conclusion:  conclusion,
			URL:         r.Link,
			Bucket:      r.Bucket,
			Workflow:    r.Workflow,
			Description: r.Description,
		})
	}
	log.Info("git/GetCiRuns: success", "count", len(runs))
	return runs, nil
}

// GetCheckAnnotations fetches GitHub check annotations for a named check on the current HEAD commit.
func GetCheckAnnotations(ctx context.Context, repoPath, branch, checkName string) ([]CheckAnnotation, error) {
	log.Info("git/GetCheckAnnotations: called", "repoPath", repoPath, "checkName", checkName)

	remote, err := GetRemoteURL(ctx, repoPath)
	if err != nil {
		return nil, fmt.Errorf("GetCheckAnnotations: remote: %w", err)
	}
	ownerRepo := parseOwnerRepo(remote)
	if ownerRepo == "" {
		return nil, fmt.Errorf("GetCheckAnnotations: cannot parse owner/repo from %s", remote)
	}

	sha, err := runGit(ctx, repoPath, "rev-parse", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("GetCheckAnnotations: rev-parse: %w", err)
	}

	apiPath := fmt.Sprintf("repos/%s/commits/%s/check-runs", ownerRepo, sha)
	cmd := exec.CommandContext(ctx, ghBin(), "api", apiPath, "--jq",
		fmt.Sprintf(".check_runs[] | select(.name == \"%s\") | .id", checkName))
	cmd.Dir = repoPath
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return nil, nil
	}

	checkRunID := strings.TrimSpace(stdout.String())
	if checkRunID == "" {
		return nil, nil
	}

	annotationsPath := fmt.Sprintf("repos/%s/check-runs/%s/annotations", ownerRepo, checkRunID)
	annoCmd := exec.CommandContext(ctx, ghBin(), "api", annotationsPath)
	annoCmd.Dir = repoPath
	var annoOut bytes.Buffer
	annoCmd.Stdout = &annoOut
	if err := annoCmd.Run(); err != nil {
		return nil, nil
	}

	var raw []CheckAnnotation
	if err := json.Unmarshal(annoOut.Bytes(), &raw); err != nil {
		return nil, fmt.Errorf("GetCheckAnnotations: json: %w", err)
	}

	log.Info("git/GetCheckAnnotations: success", "checkName", checkName, "count", len(raw))
	return raw, nil
}

// GetFailedSteps extracts the run ID from a check's URL and fetches the failed step names.
// URL format: https://github.com/{owner}/{repo}/actions/runs/{runId}/job/{jobId}
func GetFailedSteps(ctx context.Context, repoPath, checkURL string) ([]FailedStep, error) {
	log.Info("git/GetFailedSteps: called", "url", checkURL)

	remote, err := GetRemoteURL(ctx, repoPath)
	if err != nil {
		return nil, fmt.Errorf("GetFailedSteps: remote: %w", err)
	}
	ownerRepo := parseOwnerRepo(remote)
	if ownerRepo == "" {
		return nil, nil
	}

	// Extract run ID and job ID from URL
	// e.g., .../actions/runs/24844931140/job/72730063822
	runID, jobID := parseRunJobFromURL(checkURL)
	if runID == "" {
		return nil, nil
	}

	apiPath := fmt.Sprintf("repos/%s/actions/runs/%s/jobs?per_page=100&filter=latest", ownerRepo, runID)
	cmd := exec.CommandContext(ctx, ghBin(), "api", apiPath)
	cmd.Dir = repoPath
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		log.Error("git/GetFailedSteps: api call failed", "err", err)
		return nil, nil
	}

	var result struct {
		Jobs []struct {
			ID    int64 `json:"id"`
			Steps []struct {
				Name       string `json:"name"`
				Number     int    `json:"number"`
				Conclusion string `json:"conclusion"`
			} `json:"steps"`
		} `json:"jobs"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return nil, nil
	}

	var matchedJobID int64
	var steps []FailedStep
	for _, job := range result.Jobs {
		if jobID != "" && fmt.Sprintf("%d", job.ID) != jobID {
			continue
		}
		matchedJobID = job.ID
		for _, step := range job.Steps {
			if step.Conclusion == "failure" {
				steps = append(steps, FailedStep{Name: step.Name, Number: step.Number})
			}
		}
		if jobID != "" {
			break
		}
	}

	if matchedJobID != 0 && len(steps) > 0 {
		errors := fetchJobErrors(ctx, repoPath, ownerRepo, matchedJobID)
		if len(errors) > 0 {
			for i := range steps {
				steps[i].Errors = errors
			}
		}
	}

	log.Info("git/GetFailedSteps: success", "count", len(steps))
	return steps, nil
}

func fetchJobErrors(ctx context.Context, repoPath, ownerRepo string, jobID int64) []string {
	logsPath := fmt.Sprintf("repos/%s/actions/jobs/%d/logs", ownerRepo, jobID)
	cmd := exec.CommandContext(ctx, ghBin(), "api", logsPath)
	cmd.Dir = repoPath
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return nil
	}

	var errors []string
	for _, line := range strings.Split(stdout.String(), "\n") {
		if strings.Contains(line, "##[error]") {
			msg := line[strings.Index(line, "##[error]")+9:]
			msg = strings.TrimSpace(msg)
			if msg != "" && !strings.HasPrefix(msg, "Process completed with exit code") {
				errors = append(errors, msg)
			}
		}
	}
	if len(errors) > 5 {
		errors = errors[:5]
	}
	return errors
}

func parseRunJobFromURL(checkURL string) (runID, jobID string) {
	// .../actions/runs/12345/job/67890
	idx := strings.Index(checkURL, "/actions/runs/")
	if idx < 0 {
		return "", ""
	}
	rest := checkURL[idx+len("/actions/runs/"):]
	parts := strings.SplitN(rest, "/", 3)
	runID = parts[0]
	if len(parts) >= 3 && parts[1] == "job" {
		jobID = parts[2]
	}
	return
}

func parseOwnerRepo(remoteURL string) string {
	remoteURL = strings.TrimSuffix(remoteURL, ".git")
	if strings.Contains(remoteURL, "github.com:") {
		parts := strings.SplitN(remoteURL, "github.com:", 2)
		if len(parts) == 2 {
			return parts[1]
		}
	}
	if strings.Contains(remoteURL, "github.com/") {
		parts := strings.SplitN(remoteURL, "github.com/", 2)
		if len(parts) == 2 {
			return parts[1]
		}
	}
	return ""
}

func mapStateToConclusion(state string) string {
	switch strings.ToUpper(state) {
	case "SUCCESS":
		return "success"
	case "FAILURE":
		return "failure"
	case "SKIPPED":
		return "skipped"
	case "CANCELLED":
		return "cancelled"
	default:
		return ""
	}
}

func mapBucketToStatus(bucket string) string {
	switch bucket {
	case "pass", "fail":
		return "completed"
	case "pending":
		return "in_progress"
	default:
		return "queued"
	}
}

// CreatePrWithAI stages uncommitted changes, commits with an AI message,
// pushes to remote, and creates a GitHub PR with AI-generated title and body.
func CreatePrWithAI(ctx context.Context, repoPath, branch, baseBranch string) (*PrStatus, error) {
	log.Info("git/CreatePrWithAI: called", "repoPath", repoPath, "branch", branch, "baseBranch", baseBranch)

	// Step 1: Stage and commit any uncommitted changes.
	status, _ := runGit(ctx, repoPath, "status", "--porcelain")
	if strings.TrimSpace(status) != "" {
		log.Info("git/CreatePrWithAI: staging uncommitted changes")
		if _, err := runGit(ctx, repoPath, "add", "-A"); err != nil {
			return nil, fmt.Errorf("CreatePrWithAI: git add: %w", err)
		}

		diffForCommit, _ := runGit(ctx, repoPath, "diff", "--cached", "--stat")
		commitMsg := GenerateCommitMessage(ctx, diffForCommit)
		if _, err := runGit(ctx, repoPath, "commit", "-m", commitMsg); err != nil {
			return nil, fmt.Errorf("CreatePrWithAI: git commit: %w", err)
		}
		log.Info("git/CreatePrWithAI: committed", "msg", commitMsg)
	}

	// Step 2: Push to remote (set upstream if needed).
	log.Info("git/CreatePrWithAI: pushing to remote")
	if _, err := runGit(ctx, repoPath, "push", "-u", "origin", branch); err != nil {
		return nil, fmt.Errorf("CreatePrWithAI: git push: %w", err)
	}

	// Step 3: Get diff and commits for PR content.
	diffOut, err := runGit(ctx, repoPath, "diff", baseBranch+"...HEAD")
	if err != nil {
		diffOut = ""
	}
	if len(diffOut) > 8000 {
		diffOut = diffOut[:8000]
	}

	commitsOut, _ := runGit(ctx, repoPath, "log", baseBranch+"..HEAD", "--oneline")

	// Step 4: Generate PR content via Claude.
	title, body := generatePRContent(ctx, commitsOut, diffOut)

	// Step 5: Create the PR.
	log.Info("git/CreatePrWithAI: creating PR", "title", title, "baseBranch", baseBranch)
	createCmd := exec.CommandContext(ctx, ghBin(), "pr", "create",
		"--title", title,
		"--body", body,
		"--base", baseBranch,
	)
	createCmd.Dir = repoPath
	var createStdout, createStderr bytes.Buffer
	createCmd.Stdout = &createStdout
	createCmd.Stderr = &createStderr

	if err := createCmd.Run(); err != nil {
		log.Error("git/CreatePrWithAI: gh pr create failed", "err", err, "stderr", createStderr.String())
		return nil, fmt.Errorf("CreatePrWithAI: gh pr create: %w: %s", err, strings.TrimSpace(createStderr.String()))
	}
	log.Info("git/CreatePrWithAI: PR created", "output", strings.TrimSpace(createStdout.String()))

	// Step 6: Fetch and return full PR info.
	pr, err := GetPrStatus(ctx, repoPath, branch)
	if err != nil {
		return nil, fmt.Errorf("CreatePrWithAI: GetPrStatus: %w", err)
	}
	log.Info("git/CreatePrWithAI: success", "number", pr.Number)
	return pr, nil
}

// GenerateCommitMessage generates a commit message using the hardcoded
// `claude --print -p` invocation. Kept for backward compatibility.
func GenerateCommitMessage(ctx context.Context, diffStat string) string {
	return GenerateCommitMessageWithRunner(ctx, diffStat, nil)
}

// GenerateCommitMessageWithRunner generates a commit message using the provided
// CommandRunner when non-nil, falling back to the hardcoded `claude --print -p`
// invocation when cmdRunner is nil.
func GenerateCommitMessageWithRunner(ctx context.Context, diffStat string, cmdRunner provider.CommandRunner) string {
	prompt := `Write a git commit message for the following changes. Format:

Line 1: conventional commit type and short summary (under 72 chars)
Line 2: blank
Lines 3+: bullet points describing what changed and why (2-6 bullets)

Types: feat, fix, refactor, chore, docs, style, test, perf
No quotes around the message. No preamble like "Here's". Just the commit message directly.

Changes:
` + diffStat

	var cmd *exec.Cmd
	if cmdRunner != nil {
		cmdStr := cmdRunner.AIGenerateCommand(prompt)
		args := splitCommandString(cmdStr)
		if len(args) > 0 {
			cmd = exec.CommandContext(ctx, args[0], args[1:]...)
		}
	}
	// Fallback: hardcoded Claude CLI
	if cmd == nil {
		cmd = exec.CommandContext(ctx, "claude", "--print", "-p", prompt)
	}

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &bytes.Buffer{}

	if err := cmd.Run(); err != nil {
		return "chore: update"
	}
	msg := strings.TrimSpace(out.String())
	if msg == "" {
		return "chore: update"
	}
	return msg
}

// generatePRContent generates PR title and body using the hardcoded
// `claude --print -p` invocation. Kept for backward compatibility.
func generatePRContent(ctx context.Context, commits, diff string) (title, body string) {
	return generatePRContentWithRunner(ctx, commits, diff, nil)
}

// generatePRContentWithRunner generates PR title and body using the provided
// CommandRunner when non-nil, falling back to the hardcoded `claude --print -p`
// invocation when cmdRunner is nil.
func generatePRContentWithRunner(ctx context.Context, commits, diff string, cmdRunner provider.CommandRunner) (title, body string) {
	prompt := `Output a GitHub PR title on line 1 and a markdown body starting on line 3. No preamble, no "Here's", no explanation — just the title and body directly.

Title rules: under 70 chars, conventional format (feat/fix/chore: description), no quotes.
Body rules: 2-5 bullet points summarizing what changed and why.

Commits:
` + commits + `

Diff (truncated):
` + diff

	var cmd *exec.Cmd
	if cmdRunner != nil {
		cmdStr := cmdRunner.AIGenerateCommand(prompt)
		args := splitCommandString(cmdStr)
		if len(args) > 0 {
			cmd = exec.CommandContext(ctx, args[0], args[1:]...)
		}
	}
	// Fallback: hardcoded Claude CLI
	if cmd == nil {
		cmd = exec.CommandContext(ctx, "claude", "--print", "-p", prompt)
	}

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &bytes.Buffer{}

	if err := cmd.Run(); err != nil {
		log.Info("git/generatePRContent: AI generation failed, using fallback", "err", err)
		return fallbackPRContent(commits)
	}

	output := strings.TrimSpace(out.String())
	lines := strings.SplitN(output, "\n", 2)
	if len(lines) > 0 {
		title = strings.TrimSpace(lines[0])
	}
	if len(lines) >= 2 {
		body = strings.TrimSpace(lines[1])
	}

	if title == "" {
		return fallbackPRContent(commits)
	}

	log.Info("git/generatePRContent: AI generation success", "title", title)
	return title, body
}

// splitCommandString splits a command string into executable and arguments.
// It handles simple quoting for the prompt argument. For commands where the
// prompt is passed as argv (e.g., "claude --print -p <prompt>"), this splits
// on the first few known flags and keeps the rest as a single argument.
func splitCommandString(cmdStr string) []string {
	if cmdStr == "" {
		return nil
	}
	// Simple split — works for most CLI commands. The provider's
	// AIGenerateCommand() already interpolated the prompt into the template,
	// so we split into at most the binary + flags + prompt.
	fields := strings.Fields(cmdStr)
	if len(fields) == 0 {
		return nil
	}
	return fields
}

// fallbackPRContent derives a PR title from the first commit and uses the full log as the body.
func fallbackPRContent(commits string) (title, body string) {
	lines := strings.Split(strings.TrimSpace(commits), "\n")
	if len(lines) == 0 || lines[0] == "" {
		return "chore: update", ""
	}
	// First line is "<hash> <message>" — drop the short hash prefix.
	firstLine := lines[0]
	if idx := strings.Index(firstLine, " "); idx >= 0 {
		firstLine = firstLine[idx+1:]
	}
	return strings.TrimSpace(firstLine), commits
}
