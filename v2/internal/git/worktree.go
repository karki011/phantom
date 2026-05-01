// Package git provides worktree management for Phantom.
//
// Author: Subash Karki
package git

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

// worktreeRoot is the unexpanded base directory for worktrees.
const worktreeRoot = "~/.phantom-os/worktrees"

// WorktreeInfo describes a single git worktree.
type WorktreeInfo struct {
	Path       string `json:"path"`
	Branch     string `json:"branch"`
	Commit     string `json:"commit"`
	IsBare     bool   `json:"is_bare"`
	IsPrunable bool   `json:"is_prunable"`
}

// sanitizeName replaces slashes with dashes and strips non-alphanumeric characters
// (except dashes, underscores, and dots).
var sanitizeRe = regexp.MustCompile(`[^a-zA-Z0-9._-]`)

func sanitizeName(name string) string {
	name = strings.ReplaceAll(name, "/", "-")
	return sanitizeRe.ReplaceAllString(name, "")
}

// expandWorktreeRoot expands ~ to the user's home directory and returns
// the absolute worktree root path.
func expandWorktreeRoot() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	return filepath.Join(home, ".phantom-os", "worktrees"), nil
}

// GetWorktreeDir returns the directory path for a worktree, creating parent
// directories as needed. Names are sanitized to be filesystem-safe.
func GetWorktreeDir(projectName, branchName string) (string, error) {
	root, err := expandWorktreeRoot()
	if err != nil {
		return "", err
	}

	dir := filepath.Join(root, sanitizeName(projectName), sanitizeName(branchName))

	parentDir := filepath.Dir(dir)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return "", fmt.Errorf("cannot create worktree parent directory: %w", err)
	}

	return dir, nil
}

// Create adds a new git worktree. If the branch already exists, it checks it out
// into targetDir; otherwise, it creates a new branch from baseBranch.
// FetchOrigin is called first (offline-safe, errors ignored).
func Create(ctx context.Context, repoPath, branch, targetDir, baseBranch string) error {
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("cannot create target directory %s: %w", targetDir, err)
	}

	// Fetch latest (offline-safe)
	FetchOrigin(ctx, repoPath)

	// Check if branch already exists
	_, err := runGit(ctx, repoPath, "rev-parse", "--verify", branch)
	if err == nil {
		// Branch exists -- add worktree for existing branch
		_, err := runGit(ctx, repoPath, "worktree", "add", targetDir, branch)
		return err
	}

	// Branch does not exist -- create it.
	// If baseBranch is empty or unresolvable (e.g. empty repo with no commits),
	// create an orphan worktree instead of failing with "invalid reference".
	if baseBranch == "" {
		_, err = runGit(ctx, repoPath, "worktree", "add", "--orphan", "-b", branch, targetDir)
		return err
	}
	if _, verifyErr := runGit(ctx, repoPath, "rev-parse", "--verify", baseBranch); verifyErr != nil {
		_, err = runGit(ctx, repoPath, "worktree", "add", "--orphan", "-b", branch, targetDir)
		return err
	}

	// Normal case: baseBranch is a valid ref
	_, err = runGit(ctx, repoPath, "worktree", "add", "-b", branch, targetDir, baseBranch)
	return err
}

// Remove detaches a worktree. It finds the main repo via git-common-dir,
// then uses `worktree remove --force`. If that fails, it prunes and removes
// the directory manually.
func Remove(ctx context.Context, worktreePath string) error {
	// Find the main repository
	commonDir, err := runGit(ctx, worktreePath, "rev-parse", "--git-common-dir")
	if err != nil {
		return fmt.Errorf("cannot find main repository for worktree %s: %w", worktreePath, err)
	}

	// Resolve to absolute path and go up one directory (from .git to repo root)
	absCommonDir, err := filepath.Abs(filepath.Join(worktreePath, commonDir))
	if err != nil {
		return fmt.Errorf("cannot resolve common dir path: %w", err)
	}
	mainRepo := filepath.Dir(absCommonDir)

	// Try force remove
	_, removeErr := runGit(ctx, mainRepo, "worktree", "remove", worktreePath, "--force")
	if removeErr != nil {
		// Fallback: manual directory removal
		if err := os.RemoveAll(worktreePath); err != nil {
			return fmt.Errorf("failed to remove worktree directory %s: %w (original error: %v)", worktreePath, err, removeErr)
		}
	}

	// Always prune to clean up stale git worktree metadata
	_, _ = runGit(ctx, mainRepo, "worktree", "prune")

	return nil
}

// List returns all worktrees for the given repository by parsing
// the porcelain output of `git worktree list`.
func List(ctx context.Context, repoPath string) ([]WorktreeInfo, error) {
	out, err := runGit(ctx, repoPath, "worktree", "list", "--porcelain")
	if err != nil {
		return nil, err
	}

	if out == "" {
		return nil, nil
	}

	var worktrees []WorktreeInfo
	var current WorktreeInfo

	scanner := bufio.NewScanner(strings.NewReader(out))
	for scanner.Scan() {
		line := scanner.Text()

		switch {
		case line == "":
			// End of a worktree block
			if current.Path != "" {
				worktrees = append(worktrees, current)
			}
			current = WorktreeInfo{}

		case strings.HasPrefix(line, "worktree "):
			current.Path = strings.TrimPrefix(line, "worktree ")

		case strings.HasPrefix(line, "HEAD "):
			current.Commit = strings.TrimPrefix(line, "HEAD ")

		case strings.HasPrefix(line, "branch "):
			branch := strings.TrimPrefix(line, "branch ")
			current.Branch = strings.TrimPrefix(branch, "refs/heads/")

		case line == "detached":
			current.Branch = "detached"

		case line == "bare":
			current.IsBare = true

		case line == "prunable" || strings.HasPrefix(line, "prunable "):
			current.IsPrunable = true
		}
	}

	// Don't forget the last block if output doesn't end with blank line
	if current.Path != "" {
		worktrees = append(worktrees, current)
	}

	// Filter prunable — these point to deleted dirs and clutter the sidebar.
	live := worktrees[:0]
	for _, w := range worktrees {
		if w.IsPrunable {
			continue
		}
		live = append(live, w)
	}
	return live, nil
}

// Move relocates a worktree from oldPath to newPath.
// It finds the main repo via git-common-dir and runs worktree move from there.
func Move(ctx context.Context, oldPath, newPath string) error {
	commonDir, err := runGit(ctx, oldPath, "rev-parse", "--git-common-dir")
	if err != nil {
		return fmt.Errorf("worktree move: cannot find main repo: %w", err)
	}

	absCommonDir, err := filepath.Abs(filepath.Join(oldPath, commonDir))
	if err != nil {
		return fmt.Errorf("worktree move: cannot resolve common dir: %w", err)
	}
	mainRepo := filepath.Dir(absCommonDir)

	cmd := exec.CommandContext(ctx, "git", "-C", mainRepo, "worktree", "move", oldPath, newPath)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git worktree move: %w: %s", err, stderr.String())
	}
	return nil
}

// Discover walks the worktree root directory (or a specified rootDir) to find
// git worktrees. It scans at most 2 levels deep (project/branch).
func Discover(rootDir string) ([]WorktreeInfo, error) {
	if rootDir == "" {
		var err error
		rootDir, err = expandWorktreeRoot()
		if err != nil {
			return nil, err
		}
	}

	var worktrees []WorktreeInfo

	// Walk project directories (level 1)
	projectEntries, err := os.ReadDir(rootDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("cannot read worktree root %s: %w", rootDir, err)
	}

	ctx := context.Background()

	for _, projectEntry := range projectEntries {
		if !projectEntry.IsDir() {
			continue
		}

		projectDir := filepath.Join(rootDir, projectEntry.Name())

		// Walk branch directories (level 2)
		branchEntries, err := os.ReadDir(projectDir)
		if err != nil {
			continue
		}

		for _, branchEntry := range branchEntries {
			if !branchEntry.IsDir() {
				continue
			}

			branchDir := filepath.Join(projectDir, branchEntry.Name())

			// Check if this is a worktree: has .git file (not directory)
			gitPath := filepath.Join(branchDir, ".git")
			info, err := os.Stat(gitPath)
			if err != nil || info.IsDir() {
				continue
			}

			// It's a worktree -- gather info
			branch := GetCurrentBranch(ctx, branchDir)
			commit, _ := runGit(ctx, branchDir, "rev-parse", "HEAD")

			worktrees = append(worktrees, WorktreeInfo{
				Path:   branchDir,
				Branch: branch,
				Commit: commit,
				IsBare: false,
			})
		}
	}

	return worktrees, nil
}
