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

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/perf"
)

const defaultTimeout = 30 * time.Second

const defaultBranchCacheTTL = 5 * time.Minute

var (
	ghOnce sync.Once
	ghPath string
)

// defaultBranchCache caches the resolved default branch per repo path.
// Default branch rarely changes, so a 5-minute TTL is safe.
// TODO: integrate with the file watcher to invalidate on ref changes.
var defaultBranchCache sync.Map // map[string]defaultBranchEntry

type defaultBranchEntry struct {
	branch    string
	expiresAt time.Time
}

// InvalidateDefaultBranchCache clears the cached default branch for a repo.
func InvalidateDefaultBranchCache(repoPath string) {
	defaultBranchCache.Delete(repoPath)
}

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

// runGitWithRetry wraps runGit with retry logic for lock contention errors.
// Git operations can fail transiently when another process holds index.lock or
// similar lock files. Only lock-related errors trigger retries; all other
// errors return immediately.
//
// Backoff is quadratic (attempt² × 50ms) but capped per attempt and to a small
// number of retries: this runs on the sidebar read path, so a stuck index must
// degrade to ~1s, not the ~14s that an uncapped 10-retry quadratic produced.
// Callers that hit the cap serve stale status from the cache, so failing fast
// is the right trade-off here.
func runGitWithRetry(ctx context.Context, repoPath string, args ...string) (string, error) {
	const (
		maxRetries = 5
		maxBackoff = 500 * time.Millisecond
	)
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		out, err := runGit(ctx, repoPath, args...)
		if err == nil {
			return out, nil
		}
		lastErr = err
		errStr := err.Error()
		if !isLockContention(errStr) {
			return out, err
		}
		backoff := time.Duration(attempt*attempt) * 50 * time.Millisecond
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
		log.Debug("git/runGitWithRetry: lock contention, retrying",
			"attempt", attempt+1, "backoff", backoff, "args", strings.Join(args, " "))
		time.Sleep(backoff)
	}
	return "", fmt.Errorf("runGitWithRetry: exhausted %d retries: %w", maxRetries, lastErr)
}

// isLockContention checks if the error string indicates a git lock file conflict.
func isLockContention(errStr string) bool {
	return strings.Contains(errStr, "index.lock") ||
		strings.Contains(errStr, ".lock': File exists") ||
		strings.Contains(errStr, "Unable to create")
}

// IsGitRepo checks whether the given path is inside a git repository.
func IsGitRepo(ctx context.Context, path string) bool {
	_, err := runGit(ctx, path, "rev-parse", "--git-dir")
	return err == nil
}

// HasCommits returns true if the repo has at least one commit.
func HasCommits(ctx context.Context, repoPath string) bool {
	_, err := runGit(ctx, repoPath, "rev-parse", "HEAD")
	return err == nil
}

// GetRepoName returns the base directory name of the repository path.
func GetRepoName(repoPath string) string {
	return filepath.Base(repoPath)
}

// GetDefaultBranch determines the default branch for the repository.
// It resolves origin/HEAD in one call, then falls back to scanning local
// refs for main/master with a single for-each-ref. Results are cached for
// defaultBranchCacheTTL since the default branch rarely changes.
func GetDefaultBranch(ctx context.Context, repoPath string) string {
	if v, ok := defaultBranchCache.Load(repoPath); ok {
		entry := v.(defaultBranchEntry)
		if time.Now().Before(entry.expiresAt) {
			return entry.branch
		}
	}

	branch := resolveDefaultBranch(ctx, repoPath)

	// Cache positive results and the empty-repo signal; never cache an arbitrary fallback
	// if we hit an unexpected state — but here both outcomes are deterministic.
	defaultBranchCache.Store(repoPath, defaultBranchEntry{
		branch:    branch,
		expiresAt: time.Now().Add(defaultBranchCacheTTL),
	})
	return branch
}

// resolveDefaultBranch performs the actual git calls without consulting the cache.
func resolveDefaultBranch(ctx context.Context, repoPath string) string {
	// One call: resolve origin/HEAD symbolically.
	if out, err := runGit(ctx, repoPath, "symbolic-ref", "refs/remotes/origin/HEAD"); err == nil {
		if b := strings.TrimPrefix(out, "refs/remotes/origin/"); b != "" {
			return b
		}
	}

	// One call: list local heads matching main/master.
	if out, err := runGit(ctx, repoPath,
		"for-each-ref", "--format=%(refname:short)",
		"refs/heads/main", "refs/heads/master",
	); err == nil && out != "" {
		for _, name := range strings.Split(out, "\n") {
			name = strings.TrimSpace(name)
			if name == "main" || name == "master" {
				return name
			}
		}
	}

	if !HasCommits(ctx, repoPath) {
		return ""
	}
	return "main"
}

// remoteTrackingBranchExists reports whether origin/<branch> exists locally (after fetch).
func remoteTrackingBranchExists(ctx context.Context, repoPath, branch string) bool {
	if branch == "" {
		return false
	}
	_, err := runGit(ctx, repoPath, "rev-parse", "--verify", "origin/"+branch)
	return err == nil
}

// ResolvePrMergeBase chooses the GitHub PR base branch for gh pr create --base.
// preferred is typically the Phantom project/workspace default; it wins when origin/<preferred> exists.
// Otherwise origin/main, origin/master, then GetDefaultBranch are used so PRs target the real default (usually main).
func ResolvePrMergeBase(ctx context.Context, repoPath, preferred string) string {
	if preferred != "" && remoteTrackingBranchExists(ctx, repoPath, preferred) {
		return preferred
	}
	for _, candidate := range []string{"main", "master"} {
		if remoteTrackingBranchExists(ctx, repoPath, candidate) {
			return candidate
		}
	}
	return GetDefaultBranch(ctx, repoPath)
}

// HasUncommittedChanges checks whether the repo has uncommitted changes.
// It returns true if there are changes, along with the porcelain status output.
// Uses runGitWithRetry to handle transient lock contention.
func HasUncommittedChanges(ctx context.Context, repoPath string) (bool, string) {
	out, err := runGitWithRetry(ctx, repoPath, "status", "--porcelain")
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
		// Fallback for unborn branches (no commits yet)
		out, err2 := runGit(ctx, repoPath, "symbolic-ref", "--short", "HEAD")
		if err2 == nil {
			return out
		}
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
	// Fetch updates remote-tracking refs; drop the cached go-git handle so
	// subsequent fast reads see the new refs.
	DefaultRepoPool().Invalidate(repoPath)
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
	if err == nil {
		DefaultRepoPool().Invalidate(repoPath)
	}
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
	if err == nil {
		DefaultRepoPool().Invalidate(repoPath)
	}
	return err
}

// Pull pulls from origin with a 60-second timeout.
func Pull(ctx context.Context, repoPath string) error {
	pullCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	_, err := runGit(pullCtx, repoPath, "pull")
	if err == nil {
		DefaultRepoPool().Invalidate(repoPath)
	}
	return err
}

// Discard discards working-tree changes for the specified paths.
// Partitions tracked vs untracked in a single `git ls-files` call instead of N.
func Discard(ctx context.Context, repoPath string, paths ...string) error {
	if len(paths) == 0 {
		return nil
	}

	tracked, untracked := partitionTracked(ctx, repoPath, paths)

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

// partitionTracked splits paths into tracked vs untracked using a single
// `git ls-files -- p1 p2 ...` invocation. Output contains only tracked paths;
// anything in the input not in the output is treated as untracked.
func partitionTracked(ctx context.Context, repoPath string, paths []string) (tracked, untracked []string) {
	args := append([]string{"ls-files", "--"}, paths...)
	out, err := runGit(ctx, repoPath, args...)
	if err != nil {
		// On error, fall back to treating everything as untracked so `clean` can run.
		return nil, paths
	}

	trackedSet := make(map[string]struct{}, len(paths))
	if out != "" {
		for _, line := range strings.Split(out, "\n") {
			if line = strings.TrimSpace(line); line != "" {
				trackedSet[line] = struct{}{}
			}
		}
	}

	for _, p := range paths {
		if _, ok := trackedSet[p]; ok {
			tracked = append(tracked, p)
		} else {
			untracked = append(untracked, p)
		}
	}
	return tracked, untracked
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
// Directories receive a git status badge if any descendant file has a status,
// looked up via a pre-built parent-prefix map (O(1) per entry instead of O(n*m)).
func ListDirectory(ctx context.Context, repoPath, dirPath string) ([]FileEntry, error) {
	defer perf.Time(perf.RecordSidebarRefresh)()
	statusMap, dirStatusMap := getCachedStatusAndDirs(ctx, repoPath)

	relDir, _ := filepath.Rel(repoPath, dirPath)
	if relDir == "." {
		relDir = ""
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("ListDirectory: read dir %s: %w", dirPath, err)
	}

	gitignoreRules := getCachedGitignoreRules(repoPath)

	// With --untracked-files=normal, git collapses a fully-untracked directory
	// into a single entry instead of listing each child. If the directory we're
	// listing lives inside such an untracked subtree, every child is untracked
	// too — restore per-child badges that -uall used to provide. Computed once.
	dirUntracked := isWithinUntrackedDir(statusMap, relDir)

	ignoredSet := make(map[string]bool)
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
		if isIgnoredByRules(gitignoreRules, rel, entry.IsDir()) {
			ignoredSet[name] = true
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
		} else if dirUntracked {
			fe.GitStatus = "?"
		} else if !entry.IsDir() {
			if status, ok := statusMap[relPath]; ok {
				fe.GitStatus = normalizeStatus(status)
			}
		} else {
			if status, ok := dirStatusMap[relPath]; ok {
				fe.GitStatus = normalizeStatus(status)
			}
		}

		result = append(result, fe)
	}

	return result, nil
}

// isWithinUntrackedDir reports whether relDir is an untracked directory or sits
// inside one. With --untracked-files=normal, untracked directories appear in the
// status map as a single "dir/" key (trailing slash), so we walk relDir and its
// ancestors looking for such a marker. relDir is "" for the repo root, which is
// never itself untracked.
func isWithinUntrackedDir(statusMap map[string]string, relDir string) bool {
	for p := relDir; p != ""; {
		if statusMap[p+"/"] == "??" {
			return true
		}
		idx := strings.LastIndexByte(p, '/')
		if idx < 0 {
			break
		}
		p = p[:idx]
	}
	return false
}
