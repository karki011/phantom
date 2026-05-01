// Package git provides utilities for interacting with git repositories
// using exec.CommandContext with configurable timeouts.
//
// Author: Subash Karki
package git

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const defaultTimeout = 30 * time.Second

var (
	ghOnce sync.Once
	ghPath string
)

// ghBin returns the absolute path to the gh binary.
// macOS GUI apps don't inherit the shell PATH, so Homebrew paths are checked explicitly.
func ghBin() string {
	ghOnce.Do(func() {
		if p, err := exec.LookPath("gh"); err == nil {
			ghPath = p
			return
		}
		for _, candidate := range []string{
			"/opt/homebrew/bin/gh", // Apple Silicon
			"/usr/local/bin/gh",    // Intel
		} {
			if _, err := os.Stat(candidate); err == nil {
				ghPath = candidate
				return
			}
		}
		ghPath = "gh" // last resort: let the OS error surface naturally
	})
	return ghPath
}

// runGit executes a git command in the given repo path with context-based timeout.
// It returns trimmed stdout on success, or an error containing stderr context.
func runGit(ctx context.Context, repoPath string, args ...string) (string, error) {
	// -c core.optionalLocks=false prevents read-only commands like `git status`
	// from rewriting .git/index to refresh stat cache. Without this, every
	// status call triggers fsnotify on .git/index, which re-emits git:status,
	// which re-runs status — an infinite refresh loop. Same flag VS Code and
	// JetBrains use for their git integrations.
	cmdArgs := append([]string{"-c", "core.optionalLocks=false", "-C", repoPath}, args...)

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

// Stage stages the specified paths for commit.
func Stage(ctx context.Context, repoPath string, paths ...string) error {
	args := append([]string{"add", "--"}, paths...)
	_, err := runGit(ctx, repoPath, args...)
	return err
}

// StageAll stages all changes including untracked files.
func StageAll(ctx context.Context, repoPath string) error {
	_, err := runGit(ctx, repoPath, "add", "-A")
	return err
}

// Unstage removes the specified paths from the staging area.
// Falls back to git rm --cached for repos with no commits (empty HEAD).
func Unstage(ctx context.Context, repoPath string, paths ...string) error {
	args := append([]string{"reset", "HEAD", "--"}, paths...)
	_, err := runGit(ctx, repoPath, args...)
	if err != nil && strings.Contains(err.Error(), "Failed to resolve 'HEAD'") {
		rmArgs := append([]string{"rm", "--cached", "--"}, paths...)
		_, err = runGit(ctx, repoPath, rmArgs...)
	}
	return err
}

// Commit creates a commit with the given message.
func Commit(ctx context.Context, repoPath, message string) error {
	_, err := runGit(ctx, repoPath, "commit", "-m", message)
	return err
}

// Push pushes the current branch to origin with a 60-second timeout.
// If no upstream is configured, it sets upstream automatically.
func Push(ctx context.Context, repoPath string) error {
	pushCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	_, err := runGit(pushCtx, repoPath, "push")
	if err != nil && strings.Contains(err.Error(), "no upstream branch") {
		branch := GetCurrentBranch(ctx, repoPath)
		if branch == "" {
			return err
		}
		pushCtx2, cancel2 := context.WithTimeout(ctx, 60*time.Second)
		defer cancel2()
		_, err = runGit(pushCtx2, repoPath, "push", "-u", "origin", branch)
	}
	return err
}

// Pull pulls from origin with a 60-second timeout.
func Pull(ctx context.Context, repoPath string) error {
	pullCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	_, err := runGit(pullCtx, repoPath, "pull")
	return err
}

// Discard discards working-tree changes for the specified paths.
func Discard(ctx context.Context, repoPath string, paths ...string) error {
	var tracked, untracked []string
	for _, p := range paths {
		_, err := runGit(ctx, repoPath, "ls-files", "--error-unmatch", p)
		if err != nil {
			untracked = append(untracked, p)
		} else {
			tracked = append(tracked, p)
		}
	}
	if len(tracked) > 0 {
		args := append([]string{"checkout", "--"}, tracked...)
		if _, err := runGit(ctx, repoPath, args...); err != nil {
			return err
		}
	}
	if len(untracked) > 0 {
		args := append([]string{"clean", "-f", "--"}, untracked...)
		if _, err := runGit(ctx, repoPath, args...); err != nil {
			return err
		}
	}
	return nil
}

// DiscardAll discards all working-tree changes in the repo.
func DiscardAll(ctx context.Context, repoPath string) error {
	_, err := runGit(ctx, repoPath, "checkout", "--", ".")
	return err
}

// LsFiles returns all tracked files in the repository using git ls-files.
func LsFiles(ctx context.Context, repoPath string) ([]string, error) {
	out, err := runGit(ctx, repoPath, "ls-files")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return []string{}, nil
	}
	return strings.Split(out, "\n"), nil
}

// normalizeStatus converts two-char porcelain status to a single display char.
func normalizeStatus(s string) string {
	switch s {
	case "??":
		return "?"
	case "!!":
		return "!"
	}
	// For XY codes like "M ", " M", "A ", " D", take the non-space char
	if len(s) >= 2 {
		if s[0] != ' ' {
			return string(s[0])
		}
		return string(s[1])
	}
	return s
}

// FileEntry represents a filesystem entry with its git status.
type FileEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsDir     bool   `json:"is_dir"`
	GitStatus string `json:"git_status"`
}

// ListDirectory returns one-level directory listing with git status applied.
// It skips .git and gitignored entries, and is not recursive — the frontend handles lazy loading.
// Directories receive a git status badge if any child file has a status.
func ListDirectory(ctx context.Context, repoPath, dirPath string) ([]FileEntry, error) {
	// Build status map from porcelain output.
	statusMap := make(map[string]string)
	out, err := runGit(ctx, repoPath, "status", "--porcelain")
	if err == nil && out != "" {
		for _, line := range strings.Split(out, "\n") {
			if len(line) < 4 {
				continue
			}
			xy := strings.TrimSpace(line[:2])
			filePath := strings.TrimSpace(line[3:])
			// Rename format: "oldpath -> newpath"
			if idx := strings.Index(filePath, " -> "); idx >= 0 {
				filePath = filePath[idx+4:]
			}
			if xy != "" {
				statusMap[filePath] = xy
			}
		}
	}

	// Compute relative directory path for building relative entry paths.
	relDir, _ := filepath.Rel(repoPath, dirPath)
	if relDir == "." {
		relDir = ""
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("ListDirectory: read dir %s: %w", dirPath, err)
	}

	// Build the list of relative paths to check for gitignore.
	pathsToCheck := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if name == ".git" {
			continue
		}
		var rel string
		if relDir == "" {
			rel = name
		} else {
			rel = relDir + "/" + name
		}
		pathsToCheck = append(pathsToCheck, rel)
	}

	// Use git check-ignore to build the set of ignored entries in this directory.
	ignoredSet := make(map[string]bool)
	if len(pathsToCheck) > 0 {
		args := append([]string{"check-ignore"}, pathsToCheck...)
		ignoredOut, _ := runGit(ctx, repoPath, args...)
		if ignoredOut != "" {
			for _, line := range strings.Split(ignoredOut, "\n") {
				line = strings.TrimSpace(line)
				if line != "" {
					ignoredSet[filepath.Base(line)] = true
				}
			}
		}
	}

	result := make([]FileEntry, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if name == ".git" {
			continue
		}

		var relPath string
		if relDir == "" {
			relPath = name
		} else {
			relPath = relDir + "/" + name
		}

		fe := FileEntry{
			Name:  name,
			Path:  relPath,
			IsDir: entry.IsDir(),
		}

		if ignoredSet[name] {
			fe.GitStatus = "!"
		} else if !entry.IsDir() {
			if status, ok := statusMap[relPath]; ok {
				fe.GitStatus = normalizeStatus(status)
			}
		} else {
			prefix := relPath + "/"
			for filePath, status := range statusMap {
				if strings.HasPrefix(filePath, prefix) {
					fe.GitStatus = normalizeStatus(status)
					break
				}
			}
		}

		result = append(result, fe)
	}

	return result, nil
}
