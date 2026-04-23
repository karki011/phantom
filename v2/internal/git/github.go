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
)

// IsGhAvailable returns true if the gh CLI is authenticated and available.
func IsGhAvailable(ctx context.Context) bool {
	log.Info("git/IsGhAvailable: called")
	cmd := exec.CommandContext(ctx, "gh", "auth", "status")
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
	Number      int    `json:"number"`
	Title       string `json:"title"`
	State       string `json:"state"`
	IsDraft     bool   `json:"isDraft"`
	URL         string `json:"url"`
	HeadRefName string `json:"headRefName"`
	BaseRefName string `json:"baseRefName"`
}

// GetPrStatus returns the PR status for the given branch in repoPath.
// Returns nil, nil if no PR exists (non-zero exit from gh).
func GetPrStatus(ctx context.Context, repoPath, branch string) (*PrStatus, error) {
	log.Info("git/GetPrStatus: called", "repoPath", repoPath, "branch", branch)

	cmd := exec.CommandContext(ctx, "gh", "pr", "view", branch,
		"--json", "number,title,state,url,headRefName,baseRefName,isDraft",
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

	pr := &PrStatus{
		Number:      raw.Number,
		Title:       raw.Title,
		State:       raw.State,
		IsDraft:     raw.IsDraft,
		URL:         raw.URL,
		HeadRefName: raw.HeadRefName,
		BaseRefName: raw.BaseRefName,
	}
	log.Info("git/GetPrStatus: success", "number", pr.Number, "state", pr.State)
	return pr, nil
}

// ghCheckJSON is the raw JSON shape returned by `gh pr checks`.
type ghCheckJSON struct {
	Name     string `json:"name"`
	State    string `json:"state"`    // SUCCESS, FAILURE, SKIPPED, PENDING, etc.
	Bucket   string `json:"bucket"`   // pass, fail, pending, skipping
	Link     string `json:"link"`
	Workflow string `json:"workflow"`
}

// GetCiRuns returns CI check runs for the given branch's PR.
// Returns nil, nil if no PR exists or no checks are found.
func GetCiRuns(ctx context.Context, repoPath, branch string) ([]CiRun, error) {
	log.Info("git/GetCiRuns: called", "repoPath", repoPath, "branch", branch)

	cmd := exec.CommandContext(ctx, "gh", "pr", "checks", branch,
		"--json", "name,state,bucket,link,workflow",
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
			Name:       r.Name,
			Status:     mapBucketToStatus(r.Bucket),
			Conclusion: conclusion,
			URL:        r.Link,
			Bucket:     r.Bucket,
		})
	}
	log.Info("git/GetCiRuns: success", "count", len(runs))
	return runs, nil
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

// CreatePrWithAI creates a GitHub PR using an AI-generated title and body.
// It uses claude --print to generate the PR description from the diff and commits.
// Falls back to the first commit message if claude is unavailable.
// After creation, it fetches and returns the full PrStatus.
func CreatePrWithAI(ctx context.Context, repoPath, branch, baseBranch string) (*PrStatus, error) {
	log.Info("git/CreatePrWithAI: called", "repoPath", repoPath, "branch", branch, "baseBranch", baseBranch)

	// Step 1: Get diff, truncated to 8000 chars.
	diffOut, err := runGit(ctx, repoPath, "diff", baseBranch+"...HEAD")
	if err != nil {
		log.Error("git/CreatePrWithAI: diff failed", "err", err)
		diffOut = ""
	}
	if len(diffOut) > 8000 {
		diffOut = diffOut[:8000]
	}

	// Step 2: Get commit log.
	commitsOut, err := runGit(ctx, repoPath, "log", baseBranch+"..HEAD", "--oneline")
	if err != nil {
		log.Error("git/CreatePrWithAI: log failed", "err", err)
		commitsOut = ""
	}

	// Step 3: Generate PR content via claude.
	title, body := generatePRContent(ctx, commitsOut, diffOut)

	// Step 4: Create the PR via gh.
	log.Info("git/CreatePrWithAI: creating PR", "title", title, "baseBranch", baseBranch)
	createCmd := exec.CommandContext(ctx, "gh", "pr", "create",
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

	// Step 5: Fetch and return full PR info.
	pr, err := GetPrStatus(ctx, repoPath, branch)
	if err != nil {
		log.Error("git/CreatePrWithAI: GetPrStatus failed after create", "err", err)
		return nil, fmt.Errorf("CreatePrWithAI: GetPrStatus: %w", err)
	}
	log.Info("git/CreatePrWithAI: success", "number", pr.Number)
	return pr, nil
}

// generatePRContent uses claude --print to generate a PR title and body.
// Falls back to first commit + full log if claude is unavailable or fails.
func generatePRContent(ctx context.Context, commits, diff string) (title, body string) {
	prompt := "Given these git changes, generate a PR title on the first line and a markdown PR body below. Be concise.\n\nCommits:\n" +
		commits + "\n\nDiff (truncated):\n" + diff

	claudeCmd := exec.CommandContext(ctx, "claude", "--print", "-p", prompt)
	var out bytes.Buffer
	claudeCmd.Stdout = &out
	claudeCmd.Stderr = &bytes.Buffer{}

	if err := claudeCmd.Run(); err != nil {
		log.Info("git/generatePRContent: claude failed, using fallback", "err", err)
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
		log.Info("git/generatePRContent: empty claude output, using fallback")
		return fallbackPRContent(commits)
	}

	log.Info("git/generatePRContent: claude success", "title", title)
	return title, body
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
