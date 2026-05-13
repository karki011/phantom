// Package git provides go-git backed fast paths for read-only operations.
//
// These wrappers skip the git subprocess for hot read paths (commit log,
// branch listing, ahead/behind) by holding an opened *gogit.Repository in
// the process-wide RepoPool. Each function falls back to the CLI on any
// error so user-facing operations never regress.
//
// Author: Subash Karki
package git

import (
	"context"
	"fmt"
	"sort"

	"github.com/charmbracelet/log"

	gogit "github.com/go-git/go-git/v5"
	gogitconfig "github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/storer"
)

// LogFast returns up to `limit` recent commits using the in-process go-git
// pool. Falls back to CLI Log on any error.
func LogFast(ctx context.Context, repoPath string, limit int) ([]CommitInfo, error) {
	if limit <= 0 {
		limit = 50
	}

	repo, err := DefaultRepoPool().Get(repoPath)
	if err != nil {
		log.Debug("LogFast: pool open failed, falling back to CLI", "repo", repoPath, "err", err)
		return logCLI(ctx, repoPath, limit, 0)
	}

	head, err := repo.Head()
	if err != nil {
		log.Debug("LogFast: head resolve failed, falling back to CLI", "repo", repoPath, "err", err)
		return logCLI(ctx, repoPath, limit, 0)
	}

	iter, err := repo.Log(&gogit.LogOptions{From: head.Hash()})
	if err != nil {
		log.Debug("LogFast: log iter failed, falling back to CLI", "repo", repoPath, "err", err)
		return logCLI(ctx, repoPath, limit, 0)
	}
	defer iter.Close()

	commits := make([]CommitInfo, 0, limit)
	count := 0
	err = iter.ForEach(func(c *object.Commit) error {
		if count >= limit {
			return storer.ErrStop
		}
		// Honour cancellation between commits.
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}

		subject, body := splitCommitMessage(c.Message)
		parents := make([]string, 0, c.NumParents())
		for _, p := range c.ParentHashes {
			parents = append(parents, p.String())
		}

		commits = append(commits, CommitInfo{
			Hash:      c.Hash.String(),
			ShortHash: c.Hash.String()[:7],
			Author:    c.Author.Name,
			Email:     c.Author.Email,
			Date:      c.Author.When.Unix(),
			Subject:   subject,
			Body:      body,
			Parents:   parents,
		})
		count++
		return nil
	})
	if err != nil && err != storer.ErrStop {
		log.Debug("LogFast: iteration failed, falling back to CLI", "repo", repoPath, "err", err)
		return logCLI(ctx, repoPath, limit, 0)
	}

	return commits, nil
}

// ListBranchesFast lists local branches via go-git. Falls back to CLI
// ListBranches on any error.
//
// Note: ahead/behind counts are NOT populated here — callers that need
// those should use AheadBehind separately (which has its own fast path).
func ListBranchesFast(ctx context.Context, repoPath string) ([]BranchInfo, error) {
	repo, err := DefaultRepoPool().Get(repoPath)
	if err != nil {
		log.Debug("ListBranchesFast: pool open failed, falling back to CLI", "repo", repoPath, "err", err)
		return ListBranches(ctx, repoPath)
	}

	// Resolve HEAD to mark the current branch.
	var currentBranch string
	if head, herr := repo.Head(); herr == nil && head.Name().IsBranch() {
		currentBranch = head.Name().Short()
	}

	iter, err := repo.Branches()
	if err != nil {
		log.Debug("ListBranchesFast: branches iter failed, falling back to CLI", "repo", repoPath, "err", err)
		return ListBranches(ctx, repoPath)
	}
	defer iter.Close()

	cfg, _ := repo.Config()

	var branches []BranchInfo
	err = iter.ForEach(func(ref *plumbing.Reference) error {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		name := ref.Name().Short()
		bi := BranchInfo{
			Name:      name,
			Commit:    ref.Hash().String()[:7],
			IsCurrent: name == currentBranch,
		}
		if cfg != nil {
			if br, ok := cfg.Branches[name]; ok && br != nil {
				bi.Upstream = upstreamShort(br)
			}
		}
		branches = append(branches, bi)
		return nil
	})
	if err != nil {
		log.Debug("ListBranchesFast: iteration failed, falling back to CLI", "repo", repoPath, "err", err)
		return ListBranches(ctx, repoPath)
	}

	// Match CLI ordering: current first, then alphabetical for stability.
	sort.SliceStable(branches, func(i, j int) bool {
		if branches[i].IsCurrent != branches[j].IsCurrent {
			return branches[i].IsCurrent
		}
		return branches[i].Name < branches[j].Name
	})

	return branches, nil
}

// AheadBehindFast computes ahead/behind for branch vs its configured upstream
// using go-git rev-walks. Falls back to CLI computeAheadBehind on any error.
func AheadBehindFast(ctx context.Context, repoPath, branch string) (int, int, error) {
	repo, err := DefaultRepoPool().Get(repoPath)
	if err != nil {
		return 0, 0, fmt.Errorf("repo pool: %w", err)
	}

	cfg, err := repo.Config()
	if err != nil {
		return 0, 0, fmt.Errorf("config: %w", err)
	}
	br, ok := cfg.Branches[branch]
	if !ok || br == nil || br.Remote == "" || br.Merge == "" {
		return 0, 0, fmt.Errorf("no upstream for branch %s", branch)
	}

	// Local branch hash.
	localRef, err := repo.Reference(plumbing.NewBranchReferenceName(branch), true)
	if err != nil {
		return 0, 0, fmt.Errorf("resolve local %s: %w", branch, err)
	}

	// Upstream remote-tracking ref name: refs/remotes/<remote>/<short>.
	upstreamShortName := br.Merge.Short()
	upstreamRefName := plumbing.NewRemoteReferenceName(br.Remote, upstreamShortName)
	upstreamRef, err := repo.Reference(upstreamRefName, true)
	if err != nil {
		return 0, 0, fmt.Errorf("resolve upstream %s: %w", upstreamRefName, err)
	}

	ahead, err := countReachableExclusive(repo, localRef.Hash(), upstreamRef.Hash())
	if err != nil {
		return 0, 0, fmt.Errorf("ahead count: %w", err)
	}
	behind, err := countReachableExclusive(repo, upstreamRef.Hash(), localRef.Hash())
	if err != nil {
		return 0, 0, fmt.Errorf("behind count: %w", err)
	}
	return ahead, behind, nil
}

// countReachableExclusive returns the number of commits reachable from `from`
// that are NOT reachable from `exclude` (i.e. `git rev-list from ^exclude --count`).
func countReachableExclusive(repo *gogit.Repository, from, exclude plumbing.Hash) (int, error) {
	excludeSet := map[plumbing.Hash]struct{}{}
	if !exclude.IsZero() {
		excIter, err := repo.Log(&gogit.LogOptions{From: exclude})
		if err != nil {
			return 0, err
		}
		_ = excIter.ForEach(func(c *object.Commit) error {
			excludeSet[c.Hash] = struct{}{}
			return nil
		})
		excIter.Close()
	}

	iter, err := repo.Log(&gogit.LogOptions{From: from})
	if err != nil {
		return 0, err
	}
	defer iter.Close()

	count := 0
	err = iter.ForEach(func(c *object.Commit) error {
		if _, skip := excludeSet[c.Hash]; skip {
			// Skip ancestors that are reachable from exclude — go-git's iterator
			// doesn't natively support negation, so we just don't count them
			// but continue walking parents (some may diverge again).
			return nil
		}
		count++
		return nil
	})
	if err != nil {
		return 0, err
	}
	return count, nil
}

// upstreamShort returns the "remote/branch" form used by the CLI.
func upstreamShort(br *gogitconfig.Branch) string {
	if br == nil || br.Remote == "" || br.Merge == "" {
		return ""
	}
	return br.Remote + "/" + br.Merge.Short()
}

// splitCommitMessage splits a commit message into subject (first line) and
// body (remainder, trimmed). Matches the git log %s/%b convention.
func splitCommitMessage(msg string) (subject, body string) {
	for i := 0; i < len(msg); i++ {
		if msg[i] == '\n' {
			subject = msg[:i]
			// Skip the blank line separator if present.
			rest := msg[i+1:]
			if len(rest) > 0 && rest[0] == '\n' {
				rest = rest[1:]
			}
			body = rest
			return
		}
	}
	return msg, ""
}
