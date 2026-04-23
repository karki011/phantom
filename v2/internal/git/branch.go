// Package git provides branch management operations.
//
// Author: Subash Karki
package git

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// BranchInfo describes a single git branch.
type BranchInfo struct {
	Name      string `json:"name"`
	Commit    string `json:"commit"`
	Upstream  string `json:"upstream,omitempty"`
	AheadBy   int    `json:"ahead_by"`
	BehindBy  int    `json:"behind_by"`
	IsCurrent bool   `json:"is_current"`
	IsRemote  bool   `json:"is_remote"`
}

// branchVVRe parses `git branch -vv` lines.
// Example: "* main  abc1234 [origin/main: ahead 1, behind 2] message"
// or:      "  feat   def5678 [origin/feat] message"
var branchVVRe = regexp.MustCompile(
	`^(\*?)\s+(\S+)\s+([0-9a-f]+)\s*(?:\[([^\]]+)\])?\s*(.*)$`,
)

// ListBranches returns all local branches with tracking info.
func ListBranches(ctx context.Context, repoPath string) ([]BranchInfo, error) {
	out, err := runGit(ctx, repoPath, "branch", "-vv", "--no-color", "--sort=-committerdate")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}

	var branches []BranchInfo
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimRight(line, " \t")
		if line == "" {
			continue
		}
		m := branchVVRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		bi := BranchInfo{
			IsCurrent: m[1] == "*",
			Name:      m[2],
			Commit:    m[3],
		}

		// Parse upstream tracking field: "origin/main: ahead 1, behind 2"
		if tracking := m[4]; tracking != "" {
			parts := strings.SplitN(tracking, ":", 2)
			bi.Upstream = strings.TrimSpace(parts[0])
			if len(parts) == 2 {
				detail := parts[1]
				if n, ok := extractInt(detail, "ahead"); ok {
					bi.AheadBy = n
				}
				if n, ok := extractInt(detail, "behind"); ok {
					bi.BehindBy = n
				}
			}
		}

		branches = append(branches, bi)
	}
	return branches, nil
}

// ListRemoteBranches returns all remote tracking branches.
func ListRemoteBranches(ctx context.Context, repoPath string) ([]BranchInfo, error) {
	out, err := runGit(ctx, repoPath, "branch", "-r", "--no-color", "--sort=-committerdate")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}

	var branches []BranchInfo
	for _, line := range strings.Split(out, "\n") {
		name := strings.TrimSpace(line)
		if name == "" || strings.Contains(name, "->") {
			continue
		}
		branches = append(branches, BranchInfo{
			Name:     name,
			IsRemote: true,
		})
	}
	return branches, nil
}

// AheadBehind returns how many commits branch is ahead/behind its upstream.
// It uses git rev-list --left-right --count branch...upstream.
func AheadBehind(ctx context.Context, repoPath, branch string) (ahead int, behind int, err error) {
	// Resolve upstream tracking ref.
	upstream, upErr := runGit(ctx, repoPath, "rev-parse", "--abbrev-ref", branch+"@{upstream}")
	if upErr != nil {
		return 0, 0, fmt.Errorf("no upstream for branch %s: %w", branch, upErr)
	}

	out, err := runGit(ctx, repoPath, "rev-list", "--left-right", "--count", branch+"..."+upstream)
	if err != nil {
		return 0, 0, err
	}

	parts := strings.Fields(out)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("unexpected rev-list output: %q", out)
	}

	ahead, _ = strconv.Atoi(parts[0])
	behind, _ = strconv.Atoi(parts[1])
	return ahead, behind, nil
}

// DeleteBranch deletes a local branch. Use force=true to force delete.
func DeleteBranch(ctx context.Context, repoPath, branch string, force bool) error {
	flag := "-d"
	if force {
		flag = "-D"
	}
	_, err := runGit(ctx, repoPath, "branch", flag, branch)
	return err
}

// MergeBranch merges source into the current branch.
func MergeBranch(ctx context.Context, repoPath, source string) error {
	_, err := runGit(ctx, repoPath, "merge", source)
	return err
}

// RebaseBranch rebases the current branch onto onto.
func RebaseBranch(ctx context.Context, repoPath, onto string) error {
	_, err := runGit(ctx, repoPath, "rebase", onto)
	return err
}

// CherryPick applies commitHash to the current branch.
func CherryPick(ctx context.Context, repoPath, commitHash string) error {
	_, err := runGit(ctx, repoPath, "cherry-pick", commitHash)
	return err
}

// RenameBranch renames a local branch from oldName to newName.
func RenameBranch(ctx context.Context, repoPath, oldName, newName string) error {
	_, err := runGit(ctx, repoPath, "branch", "-m", oldName, newName)
	return err
}

// extractInt finds a keyword followed by a number in s and returns the number.
// e.g. extractInt("ahead 2, behind 1", "ahead") -> (2, true)
func extractInt(s, keyword string) (int, bool) {
	idx := strings.Index(s, keyword)
	if idx < 0 {
		return 0, false
	}
	rest := strings.TrimSpace(s[idx+len(keyword):])
	// Strip leading comma/space
	rest = strings.TrimLeft(rest, " ,")
	fields := strings.Fields(rest)
	if len(fields) == 0 {
		return 0, false
	}
	n, err := strconv.Atoi(fields[0])
	if err != nil {
		return 0, false
	}
	return n, true
}
