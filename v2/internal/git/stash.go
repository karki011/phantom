// Package git provides stash operations.
//
// Author: Subash Karki
package git

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

// StashEntry describes one entry in the stash list.
type StashEntry struct {
	Index   int    `json:"index"`
	Message string `json:"message"`
	Branch  string `json:"branch"`
	Date    string `json:"date"`
}

// ListStash returns all stash entries for the repo.
// Uses: git stash list --format="%gd|%gs|%ci"
func ListStash(ctx context.Context, repoPath string) ([]StashEntry, error) {
	out, err := runGit(ctx, repoPath, "stash", "list", "--format=%gd|%gs|%ci")
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}

	var entries []StashEntry
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Format: "stash@{N}|WIP on branch: msg|date"
		parts := strings.SplitN(line, "|", 3)
		if len(parts) < 2 {
			continue
		}

		ref := parts[0] // "stash@{N}"
		msg := parts[1]
		date := ""
		if len(parts) == 3 {
			date = parts[2]
		}

		idx := parseStashIndex(ref)
		branch := extractStashBranch(msg)

		entries = append(entries, StashEntry{
			Index:   idx,
			Message: msg,
			Branch:  branch,
			Date:    date,
		})
	}
	return entries, nil
}

// StashSave stashes the current working tree with an optional message.
func StashSave(ctx context.Context, repoPath, message string) error {
	args := []string{"stash", "push"}
	if message != "" {
		args = append(args, "-m", message)
	}
	_, err := runGit(ctx, repoPath, args...)
	return err
}

// StashPop applies and removes the stash at index.
func StashPop(ctx context.Context, repoPath string, index int) error {
	_, err := runGit(ctx, repoPath, "stash", "pop", fmt.Sprintf("stash@{%d}", index))
	return err
}

// StashDrop removes the stash at index without applying it.
func StashDrop(ctx context.Context, repoPath string, index int) error {
	_, err := runGit(ctx, repoPath, "stash", "drop", fmt.Sprintf("stash@{%d}", index))
	return err
}

// parseStashIndex extracts N from "stash@{N}".
func parseStashIndex(ref string) int {
	start := strings.Index(ref, "{")
	end := strings.Index(ref, "}")
	if start < 0 || end <= start {
		return 0
	}
	n, _ := strconv.Atoi(ref[start+1 : end])
	return n
}

// extractStashBranch tries to extract the branch name from a stash message.
// git stash uses "WIP on <branch>: ..." format.
func extractStashBranch(msg string) string {
	const prefix = "WIP on "
	if strings.HasPrefix(msg, prefix) {
		rest := strings.TrimPrefix(msg, prefix)
		if idx := strings.Index(rest, ":"); idx >= 0 {
			return rest[:idx]
		}
		return rest
	}
	return ""
}
