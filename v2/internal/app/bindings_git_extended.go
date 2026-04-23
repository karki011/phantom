// Wails bindings for Phase A1 git operations (diff, branch, log, stash, blame, pool).
// Author: Subash Karki
package app

import (
	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
)

// GetRepoStatus returns the full working-tree status for repoPath.
func (a *App) GetRepoStatus(repoPath string) *git.RepoStatus {
	log.Info("app/GetRepoStatus: called", "repoPath", repoPath)
	rs, err := git.GetRepoStatus(a.ctx, repoPath)
	if err != nil {
		log.Error("app/GetRepoStatus: failed", "repoPath", repoPath, "err", err)
		return nil
	}
	log.Info("app/GetRepoStatus: success", "repoPath", repoPath, "branch", rs.Branch)
	return rs
}

// GetChangedFiles returns files changed between ref1 and ref2 (or working tree if ref2 is "").
func (a *App) GetChangedFiles(repoPath, ref1, ref2 string) []git.DiffFile {
	log.Info("app/GetChangedFiles: called", "repoPath", repoPath, "ref1", ref1, "ref2", ref2)
	files, err := git.ChangedFiles(a.ctx, repoPath, ref1, ref2)
	if err != nil {
		log.Error("app/GetChangedFiles: failed", "repoPath", repoPath, "ref1", ref1, "ref2", ref2, "err", err)
		return []git.DiffFile{}
	}
	if files == nil {
		return []git.DiffFile{}
	}
	log.Info("app/GetChangedFiles: success", "repoPath", repoPath, "count", len(files))
	return files
}

// GetFileDiff returns the full unified diff with hunks for filePath between ref1 and ref2.
func (a *App) GetFileDiff(repoPath, ref1, ref2, filePath string) *git.FileDiff {
	log.Info("app/GetFileDiff: called", "repoPath", repoPath, "ref1", ref1, "ref2", ref2, "filePath", filePath)
	fd, err := git.FileDiffDetail(a.ctx, repoPath, ref1, ref2, filePath)
	if err != nil {
		log.Error("app/GetFileDiff: failed", "filePath", filePath, "err", err)
		return nil
	}
	log.Info("app/GetFileDiff: success", "filePath", filePath)
	return fd
}

// GetBranches returns all local branches with tracking info.
func (a *App) GetBranches(repoPath string) []git.BranchInfo {
	log.Info("app/GetBranches: called", "repoPath", repoPath)
	branches, err := git.ListBranches(a.ctx, repoPath)
	if err != nil {
		log.Error("app/GetBranches: failed", "repoPath", repoPath, "err", err)
		return []git.BranchInfo{}
	}
	if branches == nil {
		return []git.BranchInfo{}
	}
	log.Info("app/GetBranches: success", "repoPath", repoPath, "count", len(branches))
	return branches
}

// GetCommitLog returns up to limit commits for repoPath.
func (a *App) GetCommitLog(repoPath string, limit int) []git.CommitInfo {
	log.Info("app/GetCommitLog: called", "repoPath", repoPath, "limit", limit)
	if limit <= 0 {
		limit = 50
	}
	commits, err := git.Log(a.ctx, repoPath, limit, 0)
	if err != nil {
		log.Error("app/GetCommitLog: failed", "repoPath", repoPath, "err", err)
		return []git.CommitInfo{}
	}
	if commits == nil {
		return []git.CommitInfo{}
	}
	log.Info("app/GetCommitLog: success", "repoPath", repoPath, "count", len(commits))
	return commits
}

// GetBranchGraph returns ASCII branch graph output for repoPath.
func (a *App) GetBranchGraph(repoPath string) string {
	log.Info("app/GetBranchGraph: called", "repoPath", repoPath)
	g, err := git.BranchGraph(a.ctx, repoPath, 100)
	if err != nil {
		log.Error("app/GetBranchGraph: failed", "repoPath", repoPath, "err", err)
		return ""
	}
	log.Info("app/GetBranchGraph: success", "repoPath", repoPath)
	return g
}

// MergeBranch merges source into the current branch of repoPath.
func (a *App) MergeBranch(repoPath, source string) error {
	log.Info("app/MergeBranch: called", "repoPath", repoPath, "source", source)
	if err := git.MergeBranch(a.ctx, repoPath, source); err != nil {
		log.Error("app/MergeBranch: failed", "repoPath", repoPath, "source", source, "err", err)
		return err
	}
	log.Info("app/MergeBranch: success", "repoPath", repoPath, "source", source)
	return nil
}

// RebaseBranch rebases the current branch of repoPath onto onto.
func (a *App) RebaseBranch(repoPath, onto string) error {
	log.Info("app/RebaseBranch: called", "repoPath", repoPath, "onto", onto)
	if err := git.RebaseBranch(a.ctx, repoPath, onto); err != nil {
		log.Error("app/RebaseBranch: failed", "repoPath", repoPath, "onto", onto, "err", err)
		return err
	}
	log.Info("app/RebaseBranch: success", "repoPath", repoPath, "onto", onto)
	return nil
}

// StashSave stashes current changes with an optional message.
func (a *App) StashSave(repoPath, message string) error {
	log.Info("app/StashSave: called", "repoPath", repoPath, "message", message)
	if err := git.StashSave(a.ctx, repoPath, message); err != nil {
		log.Error("app/StashSave: failed", "repoPath", repoPath, "err", err)
		return err
	}
	log.Info("app/StashSave: success", "repoPath", repoPath)
	return nil
}

// StashPop applies and removes the stash at index.
func (a *App) StashPop(repoPath string, index int) error {
	log.Info("app/StashPop: called", "repoPath", repoPath, "index", index)
	if err := git.StashPop(a.ctx, repoPath, index); err != nil {
		log.Error("app/StashPop: failed", "repoPath", repoPath, "index", index, "err", err)
		return err
	}
	log.Info("app/StashPop: success", "repoPath", repoPath, "index", index)
	return nil
}

// GetStash returns the stash list for repoPath.
func (a *App) GetStash(repoPath string) []git.StashEntry {
	log.Info("app/GetStash: called", "repoPath", repoPath)
	entries, err := git.ListStash(a.ctx, repoPath)
	if err != nil {
		log.Error("app/GetStash: failed", "repoPath", repoPath, "err", err)
		return []git.StashEntry{}
	}
	if entries == nil {
		return []git.StashEntry{}
	}
	log.Info("app/GetStash: success", "repoPath", repoPath, "count", len(entries))
	return entries
}

// GetBlame returns per-line blame for filePath in repoPath.
func (a *App) GetBlame(repoPath, filePath string) []git.BlameLine {
	log.Info("app/GetBlame: called", "repoPath", repoPath, "filePath", filePath)
	lines, err := git.Blame(a.ctx, repoPath, filePath)
	if err != nil {
		log.Error("app/GetBlame: failed", "repoPath", repoPath, "filePath", filePath, "err", err)
		return []git.BlameLine{}
	}
	if lines == nil {
		return []git.BlameLine{}
	}
	log.Info("app/GetBlame: success", "filePath", filePath, "lines", len(lines))
	return lines
}

// FetchAllProjects fetches origin for every project in the DB in parallel.
func (a *App) FetchAllProjects() error {
	log.Info("app/FetchAllProjects: called")
	q := db.New(a.DB.Reader)
	projects, err := q.ListProjects(a.ctx)
	if err != nil {
		log.Error("app/FetchAllProjects: ListProjects failed", "err", err)
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
		log.Info("app/FetchAllProjects: progress", "done", done, "total", total, "repoPath", repoPath)
	})
	log.Info("app/FetchAllProjects: success", "count", len(repoPaths))
	return nil
}

// GetStagedChanges returns files staged for commit in repoPath.
func (a *App) GetStagedChanges(repoPath string) []git.DiffFile {
	log.Info("app/GetStagedChanges: called", "repoPath", repoPath)
	files, err := git.StagedChanges(a.ctx, repoPath)
	if err != nil {
		log.Error("app/GetStagedChanges: failed", "repoPath", repoPath, "err", err)
		return []git.DiffFile{}
	}
	if files == nil {
		return []git.DiffFile{}
	}
	log.Info("app/GetStagedChanges: success", "repoPath", repoPath, "count", len(files))
	return files
}

// GetWorkingTreeChanges returns unstaged working-tree changes for repoPath.
func (a *App) GetWorkingTreeChanges(repoPath string) []git.DiffFile {
	log.Info("app/GetWorkingTreeChanges: called", "repoPath", repoPath)
	files, err := git.WorkingTreeChanges(a.ctx, repoPath)
	if err != nil {
		log.Error("app/GetWorkingTreeChanges: failed", "repoPath", repoPath, "err", err)
		return []git.DiffFile{}
	}
	if files == nil {
		return []git.DiffFile{}
	}
	log.Info("app/GetWorkingTreeChanges: success", "repoPath", repoPath, "count", len(files))
	return files
}

// GitDeleteBranch deletes a local branch; use force=true to force delete.
func (a *App) GitDeleteBranch(repoPath, branch string, force bool) error {
	log.Info("app/GitDeleteBranch: called", "repoPath", repoPath, "branch", branch, "force", force)
	if err := git.DeleteBranch(a.ctx, repoPath, branch, force); err != nil {
		log.Error("app/GitDeleteBranch: failed", "repoPath", repoPath, "branch", branch, "err", err)
		return err
	}
	log.Info("app/GitDeleteBranch: success", "repoPath", repoPath, "branch", branch)
	return nil
}

// GitCherryPick applies commitHash to the current branch of repoPath.
func (a *App) GitCherryPick(repoPath, commitHash string) error {
	log.Info("app/GitCherryPick: called", "repoPath", repoPath, "commitHash", commitHash)
	if err := git.CherryPick(a.ctx, repoPath, commitHash); err != nil {
		log.Error("app/GitCherryPick: failed", "repoPath", repoPath, "commitHash", commitHash, "err", err)
		return err
	}
	log.Info("app/GitCherryPick: success", "repoPath", repoPath, "commitHash", commitHash)
	return nil
}

// GitStashDrop removes the stash at index without applying it.
func (a *App) GitStashDrop(repoPath string, index int) error {
	log.Info("app/GitStashDrop: called", "repoPath", repoPath, "index", index)
	if err := git.StashDrop(a.ctx, repoPath, index); err != nil {
		log.Error("app/GitStashDrop: failed", "repoPath", repoPath, "index", index, "err", err)
		return err
	}
	log.Info("app/GitStashDrop: success", "repoPath", repoPath, "index", index)
	return nil
}

// GetAllWorktreeStatus returns enriched status for all discovered worktrees in parallel.
func (a *App) GetAllWorktreeStatus() []git.WorktreeStatus {
	log.Info("app/GetAllWorktreeStatus: called")
	worktrees, err := git.Discover("")
	if err != nil {
		log.Error("app/GetAllWorktreeStatus: Discover failed", "err", err)
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
			log.Error("app/GetAllWorktreeStatus: status error", "repoPath", r.RepoPath, "err", r.Err)
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
	log.Info("app/GetAllWorktreeStatus: success", "count", len(statuses))
	return statuses
}
