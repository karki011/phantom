// Package git provides utilities for interacting with git repositories
// using exec.CommandContext with configurable timeouts.
//
// Author: Subash Karki
package git

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const defaultTimeout = 30 * time.Second

// runGit executes a git command in the given repo path with context-based timeout.
// It returns trimmed stdout on success, or an error containing stderr context.
func runGit(ctx context.Context, repoPath string, args ...string) (string, error) {
	cmdArgs := append([]string{"-C", repoPath}, args...)

	// Apply default timeout if the context has no deadline
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, defaultTimeout)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, "git", cmdArgs...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		stderrStr := strings.TrimSpace(stderr.String())
		if stderrStr != "" {
			return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, stderrStr)
		}
		return "", fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}

	return strings.TrimSpace(stdout.String()), nil
}

// IsGitRepo checks whether the given path is inside a git repository.
func IsGitRepo(ctx context.Context, path string) bool {
	_, err := runGit(ctx, path, "rev-parse", "--git-dir")
	return err == nil
}

// GetRepoName returns the base directory name of the repository path.
func GetRepoName(repoPath string) string {
	return filepath.Base(repoPath)
}

// GetDefaultBranch determines the default branch for the repository.
// It tries origin/HEAD first, then checks for "main", then "master",
// falling back to "main" if nothing else works.
func GetDefaultBranch(ctx context.Context, repoPath string) string {
	// Try symbolic-ref of origin/HEAD
	out, err := runGit(ctx, repoPath, "symbolic-ref", "refs/remotes/origin/HEAD")
	if err == nil {
		branch := strings.TrimPrefix(out, "refs/remotes/origin/")
		if branch != "" {
			return branch
		}
	}

	// Check if "main" branch exists
	if _, err := runGit(ctx, repoPath, "rev-parse", "--verify", "main"); err == nil {
		return "main"
	}

	// Check if "master" branch exists
	if _, err := runGit(ctx, repoPath, "rev-parse", "--verify", "master"); err == nil {
		return "master"
	}

	// Ultimate fallback
	return "main"
}

// HasUncommittedChanges checks whether the repo has uncommitted changes.
// It returns true if there are changes, along with the porcelain status output.
func HasUncommittedChanges(ctx context.Context, repoPath string) (bool, string) {
	out, err := runGit(ctx, repoPath, "status", "--porcelain")
	if err != nil {
		return false, ""
	}
	return len(out) > 0, out
}

// CheckoutBranch switches to the specified branch.
func CheckoutBranch(ctx context.Context, repoPath, branch string) error {
	_, err := runGit(ctx, repoPath, "checkout", branch)
	return err
}

// CreateAndCheckoutBranch creates a new branch from baseBranch and checks it out.
func CreateAndCheckoutBranch(ctx context.Context, repoPath, branch, baseBranch string) error {
	_, err := runGit(ctx, repoPath, "checkout", "-b", branch, baseBranch)
	return err
}

// GetCurrentBranch returns the name of the currently checked-out branch.
func GetCurrentBranch(ctx context.Context, repoPath string) string {
	out, err := runGit(ctx, repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return ""
	}
	return out
}

// FetchOrigin fetches from origin with a 15-second timeout.
// It is offline-safe: errors and timeouts are silently ignored.
func FetchOrigin(ctx context.Context, repoPath string) error {
	fetchCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	_, _ = runGit(fetchCtx, repoPath, "fetch", "origin")
	return nil
}
