// Package git provides commit log operations.
//
// Author: Subash Karki
package git

import (
	"context"
	"strconv"
	"strings"
)

// CommitInfo holds metadata for a single commit.
type CommitInfo struct {
	Hash      string   `json:"hash"`
	ShortHash string   `json:"short_hash"`
	Author    string   `json:"author"`
	Email     string   `json:"email"`
	Date      int64    `json:"date"` // unix timestamp
	Subject   string   `json:"subject"`
	Body      string   `json:"body,omitempty"`
	Parents   []string `json:"parents"`
}

const logFormat = "%H|%h|%an|%ae|%at|%s|%P"
const logSeparator = "|"

// Log returns commit history for the repo with limit/offset pagination.
func Log(ctx context.Context, repoPath string, limit, offset int) ([]CommitInfo, error) {
	args := []string{
		"log",
		"--format=" + logFormat,
		"-n", strconv.Itoa(limit),
		"--skip", strconv.Itoa(offset),
	}
	out, err := runGit(ctx, repoPath, args...)
	if err != nil {
		return nil, err
	}
	return parseLogOutput(out), nil
}

// LogBranch returns commits reachable from branch but not from base.
func LogBranch(ctx context.Context, repoPath, branch, base string) ([]CommitInfo, error) {
	rangeArg := base + ".." + branch
	out, err := runGit(ctx, repoPath, "log", "--format="+logFormat, rangeArg)
	if err != nil {
		return nil, err
	}
	return parseLogOutput(out), nil
}

// BranchGraph returns ASCII branch topology output from `git log --graph`.
func BranchGraph(ctx context.Context, repoPath string, limit int) (string, error) {
	out, err := runGit(ctx, repoPath,
		"log", "--all", "--oneline", "--graph",
		"-n", strconv.Itoa(limit),
	)
	if err != nil {
		return "", err
	}
	return out, nil
}

// parseLogOutput splits multi-line log output into CommitInfo records.
// Each line: hash|shortHash|author|email|unixTime|subject|parents
func parseLogOutput(out string) []CommitInfo {
	if out == "" {
		return nil
	}

	var commits []CommitInfo
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, logSeparator, 7)
		if len(parts) < 7 {
			continue
		}

		ts, _ := strconv.ParseInt(parts[4], 10, 64)

		var parents []string
		if p := strings.TrimSpace(parts[6]); p != "" {
			parents = strings.Fields(p)
		}

		commits = append(commits, CommitInfo{
			Hash:      parts[0],
			ShortHash: parts[1],
			Author:    parts[2],
			Email:     parts[3],
			Date:      ts,
			Subject:   parts[5],
			Parents:   parents,
		})
	}
	return commits
}
