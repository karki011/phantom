// Package git provides enriched working-tree status for git repositories.
//
// Author: Subash Karki
package git

import (
	"context"
	"strconv"
	"strings"
)

// FileStatus represents a single file's status in the working tree.
type FileStatus struct {
	Path   string `json:"path"`
	Status string `json:"status"` // "M", "A", "D", "R", "?", "U"
}

// RepoStatus is the full working-tree status for a repository.
type RepoStatus struct {
	Branch       string       `json:"branch"`
	AheadBy      int          `json:"ahead_by"`
	BehindBy     int          `json:"behind_by"`
	IsClean      bool         `json:"is_clean"`
	Staged       []FileStatus `json:"staged"`
	Unstaged     []FileStatus `json:"unstaged"`
	Untracked    []FileStatus `json:"untracked"`
	HasConflicts bool         `json:"has_conflicts"`
	Conflicts    []string     `json:"conflicts"`
}

// WorktreeStatus enriches WorktreeInfo with live repo status and optional session data.
type WorktreeStatus struct {
	WorktreeInfo
	RepoStatus
	ActiveSession string  `json:"active_session,omitempty"`
	PRNumber      int     `json:"pr_number,omitempty"`
	PRState       string  `json:"pr_state,omitempty"` // "open", "merged", "closed"
	TotalCost     float64 `json:"total_cost"`
}

// GetRepoStatus returns the full working-tree status using `git status --porcelain=v2 --branch`.
func GetRepoStatus(ctx context.Context, repoPath string) (*RepoStatus, error) {
	out, err := runGit(ctx, repoPath, "status", "--porcelain=v2", "--branch")
	if err != nil {
		return nil, err
	}

	rs := &RepoStatus{}
	parseStatusV2(out, rs)

	rs.IsClean = len(rs.Staged) == 0 &&
		len(rs.Unstaged) == 0 &&
		len(rs.Untracked) == 0 &&
		!rs.HasConflicts

	return rs, nil
}

// parseStatusV2 fills rs by parsing `git status --porcelain=v2` output.
//
// Branch header lines start with "# branch.".
// Changed-entry lines start with "1 " (ordinary), "2 " (rename/copy), "u " (unmerged), "? " (untracked).
func parseStatusV2(out string, rs *RepoStatus) {
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}

		switch {
		case strings.HasPrefix(line, "# branch.head "):
			rs.Branch = strings.TrimPrefix(line, "# branch.head ")

		case strings.HasPrefix(line, "# branch.ab "):
			// Format: +ahead -behind
			parts := strings.Fields(strings.TrimPrefix(line, "# branch.ab "))
			if len(parts) == 2 {
				rs.AheadBy, _ = strconv.Atoi(strings.TrimPrefix(parts[0], "+"))
				rs.BehindBy, _ = strconv.Atoi(strings.TrimPrefix(parts[1], "-"))
			}

		case strings.HasPrefix(line, "1 "):
			// Ordinary changed entry: "1 XY sub mH mI mW hH hI path"
			parseOrdinaryEntry(line[2:], rs)

		case strings.HasPrefix(line, "2 "):
			// Rename/copy entry: "2 XY sub mH mI mW hH hI X score path\torigPath"
			parseRenameEntry(line[2:], rs)

		case strings.HasPrefix(line, "u "):
			// Unmerged entry: XY sub m1 m2 m3 mW h1 h2 h3 path
			parts := strings.Fields(line[2:])
			if len(parts) >= 10 {
				path := parts[9]
				rs.HasConflicts = true
				rs.Conflicts = append(rs.Conflicts, path)
				rs.Unstaged = append(rs.Unstaged, FileStatus{Path: path, Status: "U"})
			}

		case strings.HasPrefix(line, "? "):
			// Untracked
			path := strings.TrimPrefix(line, "? ")
			rs.Untracked = append(rs.Untracked, FileStatus{Path: path, Status: "?"})
		}
	}
}

// parseOrdinaryEntry handles porcelain v2 "1 XY ..." lines.
// XY is two chars: index status (X) and working-tree status (Y).
func parseOrdinaryEntry(rest string, rs *RepoStatus) {
	parts := strings.Fields(rest)
	if len(parts) < 8 {
		return
	}
	xy := parts[0]
	path := parts[7]

	indexStatus := string(xy[0])
	wtStatus := string(xy[1])

	if indexStatus != "." {
		rs.Staged = append(rs.Staged, FileStatus{Path: path, Status: indexStatus})
	}
	if wtStatus != "." {
		rs.Unstaged = append(rs.Unstaged, FileStatus{Path: path, Status: wtStatus})
	}
}

// parseRenameEntry handles porcelain v2 "2 XY ..." lines.
// path\torigPath is at the end of the line.
func parseRenameEntry(rest string, rs *RepoStatus) {
	// Split on tab to get "fields origPath"
	tabIdx := strings.Index(rest, "\t")
	if tabIdx < 0 {
		return
	}
	origPath := rest[tabIdx+1:]
	fields := strings.Fields(rest[:tabIdx])
	if len(fields) < 9 {
		return
	}

	xy := fields[0]
	path := fields[8]
	_ = origPath

	indexStatus := string(xy[0])
	wtStatus := string(xy[1])

	if indexStatus != "." {
		rs.Staged = append(rs.Staged, FileStatus{Path: path, Status: "R"})
	}
	if wtStatus != "." {
		rs.Unstaged = append(rs.Unstaged, FileStatus{Path: path, Status: wtStatus})
	}
}

// GetWorktreeStatus returns an enriched WorktreeStatus for the given worktree path.
func GetWorktreeStatus(ctx context.Context, worktreePath string) (*WorktreeStatus, error) {
	// Get base WorktreeInfo by listing worktrees from the main repo (via common dir).
	branch := GetCurrentBranch(ctx, worktreePath)
	commit, _ := runGit(ctx, worktreePath, "rev-parse", "HEAD")

	wti := WorktreeInfo{
		Path:   worktreePath,
		Branch: branch,
		Commit: commit,
	}

	rs, err := GetRepoStatus(ctx, worktreePath)
	if err != nil {
		return nil, err
	}

	return &WorktreeStatus{
		WorktreeInfo: wti,
		RepoStatus:   *rs,
	}, nil
}
