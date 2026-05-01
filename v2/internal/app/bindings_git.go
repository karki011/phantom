// Wails bindings for git worktree management.
// Author: Subash Karki
package app

import (
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// canonPath normalizes a worktree path for cross-source matching (DB ⟷ git).
func canonPath(p string) string {
	if p == "" {
		return ""
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return filepath.Clean(p)
	}
	return filepath.Clean(abs)
}

// stableExternalID returns a deterministic Workspace ID for an externally-created
// worktree (one git knows about but the DB does not). Stable across launches so
// FE references like active_worktree_id keep working.
func stableExternalID(projectID, path string) string {
	h := sha1.Sum([]byte(projectID + "|" + path))
	return "ext-" + hex.EncodeToString(h[:10])
}

// journalWorktreeEvent logs a worktree lifecycle event to the daily work log.
func (a *App) journalWorktreeEvent(action, branch string) {
	if a.journal == nil {
		return
	}
	today := time.Now().Format("2006-01-02")
	ts := time.Now().Format("15:04")
	a.journal.AppendWorkLog(today, fmt.Sprintf("%s %s worktree: %s", ts, action, branch))
}

// CreateWorktree creates a git worktree for the given project and branch,
// then persists the workspace record in the database. ticketUrl is optional
// (empty string stores SQL NULL); only stored if it parses as http(s)://.
func (a *App) CreateWorktree(projectId, branch, baseBranch, ticketUrl string) (*db.Workspace, error) {
	log.Info("app/CreateWorktree: called", "projectId", projectId, "branch", branch, "baseBranch", baseBranch, "ticketUrl", ticketUrl)
	// Look up the project to get repoPath and name.
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/CreateWorktree: project not found", "projectId", projectId, "err", err)
		return nil, fmt.Errorf("CreateWorktree: project %s not found: %w", projectId, err)
	}

	// Compute target directory for the worktree.
	targetDir, err := git.GetWorktreeDir(proj.Name, branch)
	if err != nil {
		log.Error("app/CreateWorktree: GetWorktreeDir failed", "err", err)
		return nil, fmt.Errorf("CreateWorktree: GetWorktreeDir: %w", err)
	}

	// If no base branch specified, use the project's default.
	if baseBranch == "" {
		if proj.DefaultBranch.Valid && proj.DefaultBranch.String != "" {
			baseBranch = proj.DefaultBranch.String
		} else {
			baseBranch = git.GetDefaultBranch(a.ctx, proj.RepoPath)
		}
	}

	// Create the git worktree on disk.
	if err := git.Create(a.ctx, proj.RepoPath, branch, targetDir, baseBranch); err != nil {
		log.Error("app/CreateWorktree: git.Create failed", "err", err)
		return nil, fmt.Errorf("CreateWorktree: git.Create: %w", err)
	}

	// Persist workspace record.
	id := uuid.New().String()
	now := time.Now().Unix()

	// Only persist a ticket URL when it looks like an http(s) link — keeps
	// junk values (or accidental whitespace) out of the column.
	trimmedTicket := strings.TrimSpace(ticketUrl)
	ticket := sql.NullString{}
	if strings.HasPrefix(trimmedTicket, "http://") || strings.HasPrefix(trimmedTicket, "https://") {
		ticket = sql.NullString{String: trimmedTicket, Valid: true}
	}

	params := db.CreateWorkspaceParams{
		ID:           id,
		ProjectID:    projectId,
		Type:         "worktree",
		Name:         branch,
		Branch:       branch,
		WorktreePath: sql.NullString{String: targetDir, Valid: true},
		BaseBranch:   sql.NullString{String: baseBranch, Valid: true},
		IsActive:     sql.NullInt64{Int64: 1, Valid: true},
		TicketUrl:    ticket,
		CreatedAt:    now,
	}

	wq := db.New(a.DB.Writer)
	if err := wq.CreateWorkspace(a.ctx, params); err != nil {
		log.Error("app/CreateWorktree: CreateWorkspace failed", "err", err)
		return nil, fmt.Errorf("CreateWorktree: CreateWorkspace: %w", err)
	}

	// Read back the full record.
	rq := db.New(a.DB.Reader)
	ws, err := rq.GetWorkspace(a.ctx, id)
	if err != nil {
		log.Error("app/CreateWorktree: GetWorkspace after create failed", "err", err)
		return nil, fmt.Errorf("CreateWorktree: GetWorkspace after create: %w", err)
	}
	wailsRuntime.EventsEmit(a.ctx, EventWorktreeCreated)
	a.journalWorktreeEvent("Created", branch)
	log.Info("app/CreateWorktree: success", "id", ws.ID, "branch", ws.Branch, "path", ws.WorktreePath.String)
	return &ws, nil
}

// RemoveWorktree removes a worktree from disk and (if present) deletes the
// workspace record. Externally-created worktrees discovered via git.List have
// synthetic IDs not present in the DB — for those, the FE passes the path
// directly so we can still remove them from disk.
func (a *App) RemoveWorktree(worktreeId, worktreePath string) error {
	log.Info("app/RemoveWorktree: called", "worktreeId", worktreeId, "path", worktreePath)

	q := db.New(a.DB.Reader)
	ws, dbErr := q.GetWorkspace(a.ctx, worktreeId)

	// Effective path: DB wins (canonical), passed-in path is fallback.
	path := strings.TrimSpace(worktreePath)
	if dbErr == nil && ws.WorktreePath.Valid && ws.WorktreePath.String != "" {
		path = ws.WorktreePath.String
	}

	if path == "" {
		log.Error("app/RemoveWorktree: no path resolved", "worktreeId", worktreeId)
		return fmt.Errorf("RemoveWorktree: no path resolved for %s", worktreeId)
	}

	if err := git.Remove(a.ctx, path); err != nil {
		log.Warn("app/RemoveWorktree: git.Remove warning (continuing)", "path", path, "err", err)
		// Continue — for externals there's no DB row to delete, but we still
		// want to emit the event so the watcher-driven refresh picks it up.
	}

	if dbErr == nil {
		wq := db.New(a.DB.Writer)
		if err := wq.DeleteWorkspace(a.ctx, worktreeId); err != nil {
			log.Error("app/RemoveWorktree: DeleteWorkspace failed", "worktreeId", worktreeId, "err", err)
			return err
		}
		a.journalWorktreeEvent("Removed", ws.Branch)
	}

	wailsRuntime.EventsEmit(a.ctx, EventWorktreeRemoved)
	log.Info("app/RemoveWorktree: success", "worktreeId", worktreeId, "path", path)
	return nil
}

// ListWorktrees returns all workspaces for a given project, with git as the
// source of truth for which worktrees exist.
//
// Strategy: list git worktrees, then merge with DB rows by path:
//   - git-known + DB-known   → return DB row (preserves metadata), refresh branch
//   - git-known + DB-unknown → synthesize a Workspace with stable ID
//   - DB-known + git-unknown → drop (orphan / removed externally)
//   - DB rows without a path (e.g. type="branch" entries for unchecked-out
//     local branches) → always included
//
// Falls back to plain DB read if git command fails (e.g. corrupt repo).
func (a *App) ListWorktrees(projectId string) []db.Workspace {
	log.Info("app/ListWorktrees: called", "projectId", projectId)
	q := db.New(a.DB.Reader)

	dbRows, err := q.ListWorkspacesByProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/ListWorktrees: ListWorkspacesByProject failed", "projectId", projectId, "err", err)
		return []db.Workspace{}
	}

	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/ListWorktrees: GetProject failed, returning DB only", "projectId", projectId, "err", err)
		return dbRows
	}

	gitWts, err := git.List(a.ctx, proj.RepoPath)
	if err != nil {
		log.Error("app/ListWorktrees: git.List failed, returning DB only", "repoPath", proj.RepoPath, "err", err)
		return dbRows
	}

	// Index DB rows by canonical worktree path.
	byPath := make(map[string]db.Workspace, len(dbRows))
	for _, w := range dbRows {
		if w.WorktreePath.Valid {
			byPath[canonPath(w.WorktreePath.String)] = w
		}
	}

	out := make([]db.Workspace, 0, len(gitWts)+len(dbRows))
	seenPaths := make(map[string]bool, len(gitWts))

	for _, gw := range gitWts {
		path := canonPath(gw.Path)
		seenPaths[path] = true
		if existing, ok := byPath[path]; ok {
			existing.Branch = gw.Branch
			out = append(out, existing)
			continue
		}
		// External worktree — synthesize with stable ID.
		out = append(out, db.Workspace{
			ID:           stableExternalID(projectId, path),
			ProjectID:    projectId,
			Type:         "worktree",
			Name:         filepath.Base(path),
			Branch:       gw.Branch,
			WorktreePath: sql.NullString{String: path, Valid: true},
			CreatedAt:    time.Now().Unix(),
		})
	}

	// Include DB rows that don't have a worktree_path (e.g. type="branch"
	// entries representing local branches that aren't checked out).
	for _, w := range dbRows {
		if !w.WorktreePath.Valid || w.WorktreePath.String == "" {
			out = append(out, w)
		}
	}

	log.Info("app/ListWorktrees: success", "git", len(gitWts), "db", len(dbRows), "merged", len(out))
	return out
}

// GetDefaultBranch returns the default branch for the repository at repoPath.
func (a *App) GetDefaultBranch(repoPath string) string {
	log.Info("app/GetDefaultBranch: called", "repoPath", repoPath)
	result := git.GetDefaultBranch(a.ctx, repoPath)
	log.Info("app/GetDefaultBranch: success", "branch", result)
	return result
}

// GetProjectBranches returns all branch names (local + remote) for a project.
func (a *App) GetProjectBranches(projectId string) []string {
	log.Info("app/GetProjectBranches: called", "projectId", projectId)
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		log.Error("app/GetProjectBranches: project not found", "projectId", projectId, "err", err)
		return []string{}
	}

	log.Info("app/GetProjectBranches: resolving branches", "projectId", projectId, "repoPath", proj.RepoPath)

	seen := make(map[string]bool)
	var names []string

	local, err := git.ListBranches(a.ctx, proj.RepoPath)
	if err != nil {
		log.Error("app/GetProjectBranches: ListBranches error", "err", err)
	}

	// Unborn branch: repo has been `git init`-ed but has no commits yet.
	// git branch -vv returns nothing, so synthesize an entry from HEAD.
	if len(local) == 0 && !git.HasCommits(a.ctx, proj.RepoPath) {
		unbornName := git.GetCurrentBranch(a.ctx, proj.RepoPath)
		if unbornName != "" {
			local = []git.BranchInfo{{Name: unbornName, IsCurrent: true}}
		}
	}

	log.Info("app/GetProjectBranches: local branches", "count", len(local))
	for _, b := range local {
		if !seen[b.Name] {
			seen[b.Name] = true
			names = append(names, b.Name)
		}
	}

	remote, err := git.ListRemoteBranches(a.ctx, proj.RepoPath)
	if err != nil {
		log.Error("app/GetProjectBranches: ListRemoteBranches error", "err", err)
	}
	log.Info("app/GetProjectBranches: remote branches", "count", len(remote))
	for _, b := range remote {
		name := strings.TrimPrefix(b.Name, "origin/")
		if name == "HEAD" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}

	log.Info("app/GetProjectBranches: success", "total", len(names))
	return names
}
