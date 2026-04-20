// Wails bindings for Phase A1 git operations (diff, branch, log, stash, blame, pool).
// Author: Subash Karki
package app

import (
	"log"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
)

// GetRepoStatus returns the full working-tree status for repoPath.
func (a *App) GetRepoStatus(repoPath string) *git.RepoStatus {
	rs, err := git.GetRepoStatus(a.ctx, repoPath)
	if err != nil {
		log.Printf("app/GetRepoStatus(%s): %v", repoPath, err)
		return nil
	}
	return rs
}

// GetChangedFiles returns files changed between ref1 and ref2 (or working tree if ref2 is "").
func (a *App) GetChangedFiles(repoPath, ref1, ref2 string) []git.DiffFile {
	files, err := git.ChangedFiles(a.ctx, repoPath, ref1, ref2)
	if err != nil {
		log.Printf("app/GetChangedFiles(%s, %s, %s): %v", repoPath, ref1, ref2, err)
		return []git.DiffFile{}
	}
	if files == nil {
		return []git.DiffFile{}
	}
	return files
}

// GetFileDiff returns the full unified diff with hunks for filePath between ref1 and ref2.
func (a *App) GetFileDiff(repoPath, ref1, ref2, filePath string) *git.FileDiff {
	fd, err := git.FileDiffDetail(a.ctx, repoPath, ref1, ref2, filePath)
	if err != nil {
		log.Printf("app/GetFileDiff(%s): %v", filePath, err)
		return nil
	}
	return fd
}

// GetBranches returns all local branches with tracking info.
func (a *App) GetBranches(repoPath string) []git.BranchInfo {
	branches, err := git.ListBranches(a.ctx, repoPath)
	if err != nil {
		log.Printf("app/GetBranches(%s): %v", repoPath, err)
		return []git.BranchInfo{}
	}
	if branches == nil {
		return []git.BranchInfo{}
	}
	return branches
}

// GetCommitLog returns up to limit commits for repoPath.
func (a *App) GetCommitLog(repoPath string, limit int) []git.CommitInfo {
	if limit <= 0 {
		limit = 50
	}
	commits, err := git.Log(a.ctx, repoPath, limit, 0)
	if err != nil {
		log.Printf("app/GetCommitLog(%s): %v", repoPath, err)
		return []git.CommitInfo{}
	}
	if commits == nil {
		return []git.CommitInfo{}
	}
	return commits
}

// GetBranchGraph returns ASCII branch graph output for repoPath.
func (a *App) GetBranchGraph(repoPath string) string {
	g, err := git.BranchGraph(a.ctx, repoPath, 100)
	if err != nil {
		log.Printf("app/GetBranchGraph(%s): %v", repoPath, err)
		return ""
	}
	return g
}

// MergeBranch merges source into the current branch of repoPath.
func (a *App) MergeBranch(repoPath, source string) error {
	return git.MergeBranch(a.ctx, repoPath, source)
}

// RebaseBranch rebases the current branch of repoPath onto onto.
func (a *App) RebaseBranch(repoPath, onto string) error {
	return git.RebaseBranch(a.ctx, repoPath, onto)
}

// StashSave stashes current changes with an optional message.
func (a *App) StashSave(repoPath, message string) error {
	return git.StashSave(a.ctx, repoPath, message)
}

// StashPop applies and removes the stash at index.
func (a *App) StashPop(repoPath string, index int) error {
	return git.StashPop(a.ctx, repoPath, index)
}

// GetStash returns the stash list for repoPath.
func (a *App) GetStash(repoPath string) []git.StashEntry {
	entries, err := git.ListStash(a.ctx, repoPath)
	if err != nil {
		log.Printf("app/GetStash(%s): %v", repoPath, err)
		return []git.StashEntry{}
	}
	if entries == nil {
		return []git.StashEntry{}
	}
	return entries
}

// GetBlame returns per-line blame for filePath in repoPath.
func (a *App) GetBlame(repoPath, filePath string) []git.BlameLine {
	lines, err := git.Blame(a.ctx, repoPath, filePath)
	if err != nil {
		log.Printf("app/GetBlame(%s, %s): %v", repoPath, filePath, err)
		return []git.BlameLine{}
	}
	if lines == nil {
		return []git.BlameLine{}
	}
	return lines
}

// FetchAllProjects fetches origin for every project in the DB in parallel.
func (a *App) FetchAllProjects() error {
	q := db.New(a.DB.Reader)
	projects, err := q.ListProjects(a.ctx)
	if err != nil {
		return err
	}

	repoPaths := make([]string, 0, len(projects))
	for _, p := range projects {
		if p.RepoPath != "" {
			repoPaths = append(repoPaths, p.RepoPath)
		}
	}

	pool := git.NewPool(0)
	pool.FetchAll(a.ctx, repoPaths, func(done, total int, repoPath string) {
		log.Printf("app/FetchAllProjects: fetched %d/%d (%s)", done, total, repoPath)
	})
	return nil
}

// GetAllWorktreeStatus returns enriched status for all discovered worktrees in parallel.
func (a *App) GetAllWorktreeStatus() []git.WorktreeStatus {
	worktrees, err := git.Discover("")
	if err != nil {
		log.Printf("app/GetAllWorktreeStatus: Discover: %v", err)
		return []git.WorktreeStatus{}
	}

	repoPaths := make([]string, 0, len(worktrees))
	for _, wt := range worktrees {
		repoPaths = append(repoPaths, wt.Path)
	}

	pool := git.NewPool(0)
	results := pool.StatusAll(a.ctx, repoPaths)

	statuses := make([]git.WorktreeStatus, 0, len(results))
	for _, r := range results {
		if r.Err != nil {
			log.Printf("app/GetAllWorktreeStatus: %s: %v", r.RepoPath, r.Err)
			continue
		}
		rs, ok := r.Data.(*git.RepoStatus)
		if !ok || rs == nil {
			continue
		}
		// Match back to WorktreeInfo by path.
		var wti git.WorktreeInfo
		for _, wt := range worktrees {
			if wt.Path == r.RepoPath {
				wti = wt
				break
			}
		}
		statuses = append(statuses, git.WorktreeStatus{
			WorktreeInfo: wti,
			RepoStatus:   *rs,
		})
	}
	return statuses
}
