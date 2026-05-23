// Author: Subash Karki
package persona

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// ContextDeps are the live data sources injected into the ContextEngine.
// All fields are optional; nil means unavailable (engine returns safe defaults).
type ContextDeps struct {
	// ClaudeSessionsFn returns active Claude sessions.
	ClaudeSessionsFn func(ctx context.Context) []ClaudeSessionStatus
	// TerminalSessionsFn returns open terminal sessions.
	TerminalSessionsFn func(ctx context.Context) []TerminalStatus
}

// ContextEngine provides read-only access to runtime state.
type ContextEngine struct {
	deps ContextDeps
}

// NewContextEngine constructs a ContextEngine with the given deps.
func NewContextEngine(deps ContextDeps) *ContextEngine {
	return &ContextEngine{deps: deps}
}

// ClaudeSessions returns active Claude sessions, or nil if unavailable.
func (e *ContextEngine) ClaudeSessions(ctx context.Context) []ClaudeSessionStatus {
	if e == nil || e.deps.ClaudeSessionsFn == nil {
		return nil
	}
	return e.deps.ClaudeSessionsFn(ctx)
}

// TerminalSessions returns open terminal sessions, or nil if unavailable.
func (e *ContextEngine) TerminalSessions(ctx context.Context) []TerminalStatus {
	if e == nil || e.deps.TerminalSessionsFn == nil {
		return nil
	}
	return e.deps.TerminalSessionsFn(ctx)
}

// GitSummary runs git commands against projectPath and returns a summary.
// Returns zero-value GitSummary on any error.
func (e *ContextEngine) GitSummary(ctx context.Context, projectPath string) GitSummary {
	if projectPath == "" {
		return GitSummary{}
	}

	// Branch
	branch := runGitCmd(ctx, projectPath, "rev-parse", "--abbrev-ref", "HEAD")

	// Status counts
	statusOut := runGitCmd(ctx, projectPath, "status", "--porcelain")
	var staged, unstaged, untracked int
	for _, line := range strings.Split(statusOut, "\n") {
		if len(line) < 2 {
			continue
		}
		x, y := line[0], line[1]
		if x == '?' && y == '?' {
			untracked++
			continue
		}
		if x != ' ' && x != '?' {
			staged++
		}
		if y != ' ' && y != '?' {
			unstaged++
		}
	}

	// Recent commits
	logOut := runGitCmd(ctx, projectPath, "log", "--oneline", "--format=%H\x1f%s\x1f%an\x1f%ci", "-10")
	var commits []CommitSummary
	for _, line := range strings.Split(logOut, "\n") {
		parts := strings.SplitN(line, "\x1f", 4)
		if len(parts) < 4 {
			continue
		}
		var t time.Time
		t, _ = time.Parse("2006-01-02 15:04:05 -0700", strings.TrimSpace(parts[3]))
		commits = append(commits, CommitSummary{
			Hash:    parts[0][:min(7, len(parts[0]))],
			Message: parts[1],
			Author:  parts[2],
			When:    t,
		})
	}

	return GitSummary{
		Branch:        branch,
		IsClean:       staged == 0 && unstaged == 0 && untracked == 0,
		Staged:        staged,
		Unstaged:      unstaged,
		Untracked:     untracked,
		RecentCommits: commits,
	}
}

// GraphSummary returns a stub graph summary (real implementation would query the graph engine).
func (e *ContextEngine) GraphSummary(ctx context.Context, projectPath string) GraphSummary {
	if projectPath == "" {
		return GraphSummary{}
	}
	// Approximate file count via find; ignore errors
	out := runShellCmd(ctx, projectPath, "find", ".", "-name", "*.go", "-o", "-name", "*.ts", "-o", "-name", "*.tsx")
	count := len(strings.Split(strings.TrimSpace(out), "\n"))
	if strings.TrimSpace(out) == "" {
		count = 0
	}
	return GraphSummary{FileCount: count}
}

// runGitCmd runs a git command in dir and returns trimmed stdout (empty on error).
func runGitCmd(ctx context.Context, dir string, args ...string) string {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// runShellCmd runs any command in dir and returns trimmed stdout (empty on error).
func runShellCmd(ctx context.Context, dir string, name string, args ...string) string {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ensure strconv is used (used indirectly via callers)
var _ = strconv.Itoa
