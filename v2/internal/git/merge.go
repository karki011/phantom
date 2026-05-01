// Package git — `gh pr merge` wrapper for Ship-It.
//
// Author: Subash Karki
package git

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"

	"github.com/charmbracelet/log"
)

// MergeMethod is the merge strategy passed to `gh pr merge`.
type MergeMethod string

const (
	MergeMethodSquash MergeMethod = "squash"
	MergeMethodMerge  MergeMethod = "merge"
	MergeMethodRebase MergeMethod = "rebase"
)

// normalizeMergeMethod accepts FE-supplied strings (case-insensitive, github
// constants like "SQUASH" or shell flags like "squash") and returns the
// flag we'll pass to `gh pr merge`. Defaults to squash.
func normalizeMergeMethod(s string) MergeMethod {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "merge", "merge_commit":
		return MergeMethodMerge
	case "rebase":
		return MergeMethodRebase
	case "squash", "":
		return MergeMethodSquash
	default:
		return MergeMethodSquash
	}
}

// MergePr shells out to `gh pr merge`. When autoMerge is true the merge is
// queued via `--auto`; gh auto-detects merge queues when configured on the base.
// Returns nil on success; the error message is gh's stderr (truncated).
func MergePr(ctx context.Context, repoPath, branch, method string, autoMerge, deleteBranch bool) error {
	log.Info("git/MergePr: called",
		"branch", branch, "method", method, "autoMerge", autoMerge, "deleteBranch", deleteBranch)

	args := []string{"pr", "merge", branch, "--" + string(normalizeMergeMethod(method))}
	if autoMerge {
		args = append(args, "--auto")
	}
	if deleteBranch {
		args = append(args, "-d")
	}

	cmd := exec.CommandContext(ctx, ghBin(), args...)
	cmd.Dir = repoPath
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		if len(msg) > 400 {
			msg = msg[:400] + "..."
		}
		log.Error("git/MergePr: failed", "branch", branch, "stderr", msg)
		return fmt.Errorf("gh pr merge: %s", msg)
	}

	log.Info("git/MergePr: success", "branch", branch, "out", strings.TrimSpace(stdout.String()))
	return nil
}

// DisableAutoMerge cancels a pending --auto merge.
func DisableAutoMerge(ctx context.Context, repoPath, branch string) error {
	log.Info("git/DisableAutoMerge: called", "branch", branch)
	cmd := exec.CommandContext(ctx, ghBin(), "pr", "merge", branch, "--disable-auto")
	cmd.Dir = repoPath
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		log.Error("git/DisableAutoMerge: failed", "branch", branch, "stderr", msg)
		return fmt.Errorf("gh pr merge --disable-auto: %s", msg)
	}
	log.Info("git/DisableAutoMerge: success", "branch", branch)
	return nil
}

// PostMergeCleanup runs `git switch <base> && git pull && git branch -D <feature>`
// in repoPath. Best-effort: returns the first error encountered, but lets later
// steps run so a stale local branch doesn't block the pull.
func PostMergeCleanup(ctx context.Context, repoPath, baseBranch, featureBranch string) error {
	log.Info("git/PostMergeCleanup: called", "base", baseBranch, "feature", featureBranch)

	if _, err := runGit(ctx, repoPath, "switch", baseBranch); err != nil {
		log.Error("git/PostMergeCleanup: switch failed", "err", err)
		return fmt.Errorf("switch to %s: %w", baseBranch, err)
	}
	if _, err := runGit(ctx, repoPath, "pull", "--ff-only"); err != nil {
		log.Error("git/PostMergeCleanup: pull failed", "err", err)
		// Continue — best-effort.
	}
	if featureBranch != "" && featureBranch != baseBranch {
		if _, err := runGit(ctx, repoPath, "branch", "-D", featureBranch); err != nil {
			log.Info("git/PostMergeCleanup: branch -D failed (likely already gone)", "err", err)
		}
	}
	log.Info("git/PostMergeCleanup: success")
	return nil
}
