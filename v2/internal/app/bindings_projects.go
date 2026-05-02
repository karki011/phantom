// Wails bindings for project management.
// Author: Subash Karki
package app

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	"github.com/subashkarki/phantom-os-v2/internal/integration"
	"github.com/subashkarki/phantom-os-v2/internal/project"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// GetProjects returns all registered projects.
func (a *App) GetProjects() []db.Project {
	q := db.New(a.DB.Reader)
	projects, err := q.ListProjects(a.ctx)
	if err != nil {
		slog.Error("GetProjects: ListProjects failed", "err", err)
		return []db.Project{}
	}
	return projects
}

// AddProject detects the project type at repoPath, persists it to the DB,
// and returns the newly created project record.
func (a *App) AddProject(repoPath string) (*db.Project, error) {
	// Return existing project if already registered.
	rq := db.New(a.DB.Reader)
	if existing, err := rq.FindProjectByRepoPath(a.ctx, repoPath); err == nil {
		// Still ensure MCP is enabled for already-linked workspaces in case
		// the project was added before the per-project enablement existed.
		if err := integration.EnsureProjectHasMCP(repoPath); err != nil {
			slog.Warn("AddProject: ensure mcp for existing project failed", "err", err)
		}
		return &existing, nil
	}

	// Detect project profile.
	profile := project.Detect(repoPath)

	profileJSON, err := json.Marshal(profile)
	if err != nil {
		return nil, fmt.Errorf("AddProject: marshal profile: %w", err)
	}

	// Determine default branch.
	defaultBranch := git.GetDefaultBranch(a.ctx, repoPath)

	id := uuid.New().String()
	now := time.Now().Unix()

	params := db.CreateProjectParams{
		ID:            id,
		Name:          filepath.Base(repoPath),
		RepoPath:      repoPath,
		DefaultBranch: sql.NullString{String: defaultBranch, Valid: true},
		Profile:       sql.NullString{String: string(profileJSON), Valid: true},
		CreatedAt:     now,
	}

	q := db.New(a.DB.Writer)
	if err := q.CreateProject(a.ctx, params); err != nil {
		return nil, fmt.Errorf("AddProject: CreateProject: %w", err)
	}

	// Read back from reader to return the full record.
	rq = db.New(a.DB.Reader)
	proj, err := rq.GetProject(a.ctx, id)
	if err != nil {
		return nil, fmt.Errorf("AddProject: GetProject after create: %w", err)
	}

	// Auto-create a workspace for the default branch so the sidebar has something to show.
	wsID := uuid.New().String()
	wsParams := db.CreateWorkspaceParams{
		ID:           wsID,
		ProjectID:    id,
		Type:         "branch",
		Name:         defaultBranch,
		Branch:       defaultBranch,
		WorktreePath: sql.NullString{String: repoPath, Valid: true},
		IsActive:     sql.NullInt64{Int64: 1, Valid: true},
		CreatedAt:    now,
	}
	if err := q.CreateWorkspace(a.ctx, wsParams); err != nil {
		slog.Warn("AddProject: auto-create workspace failed", "err", err)
	}

	if err := integration.EnsureProjectHasMCP(repoPath); err != nil {
		slog.Warn("AddProject: ensure mcp project enablement failed", "err", err)
	}

	wailsRuntime.EventsEmit(a.ctx, "project:created", proj.ID)

	return &proj, nil
}

// RemoveProject deletes a project and all related data by ID.
func (a *App) RemoveProject(id string) error {
	rq := db.New(a.DB.Reader)
	workspaces, err := rq.ListWorkspacesByProject(a.ctx, id)
	if err != nil {
		slog.Warn("RemoveProject: list workspaces failed", "err", err)
	}
	wq := db.New(a.DB.Writer)
	for _, ws := range workspaces {
		if err := wq.DeleteWorkspace(a.ctx, ws.ID); err != nil {
			slog.Warn("RemoveProject: delete workspace failed", "workspaceID", ws.ID, "err", err)
		}
	}
	// Clean up graph data (code-review-graph FK references)
	for _, table := range []string{"graph_edges", "graph_nodes", "graph_meta", "workspace_sections"} {
		if _, err := a.DB.Writer.ExecContext(a.ctx, "DELETE FROM "+table+" WHERE project_id = ?", id); err != nil {
			slog.Warn("RemoveProject: clean table failed", "table", table, "err", err)
		}
	}
	// Clean up custom recipes and recipe favorites for this project.
	if err := wq.DeleteCustomRecipesByProject(a.ctx, id); err != nil {
		slog.Warn("RemoveProject: clean custom_recipes failed", "err", err)
	}
	if err := wq.DeleteRecipeFavoritesByProject(a.ctx, id); err != nil {
		slog.Warn("RemoveProject: clean recipe_favorites failed", "err", err)
	}
	return wq.DeleteProject(a.ctx, id)
}

// DetectProject runs project detection on the given repo path without persisting.
func (a *App) DetectProject(repoPath string) *project.Profile {
	profile := project.Detect(repoPath)
	return &profile
}

// GetProjectRecipes returns the build/test/lint recipes for a project
// by parsing the stored profile JSON.
func (a *App) GetProjectRecipes(projectId string) []project.Recipe {
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		slog.Error("GetProjectRecipes: GetProject failed", "projectId", projectId, "err", err)
		return []project.Recipe{}
	}

	if !proj.Profile.Valid || proj.Profile.String == "" {
		return []project.Recipe{}
	}

	var profile project.Profile
	if err := json.Unmarshal([]byte(proj.Profile.String), &profile); err != nil {
		slog.Error("GetProjectRecipes: unmarshal profile failed", "projectId", projectId, "err", err)
		return []project.Recipe{}
	}

	if profile.Recipes == nil {
		return []project.Recipe{}
	}
	return profile.Recipes
}

// ToggleStarProject flips the starred state of a project. Returns the new starred value.
// Enforces a max of 10 starred projects.
func (a *App) ToggleStarProject(id string) (bool, error) {
	rq := db.New(a.DB.Reader)
	proj, err := rq.GetProject(a.ctx, id)
	if err != nil {
		return false, fmt.Errorf("ToggleStarProject: GetProject: %w", err)
	}

	isCurrentlyStarred := proj.Starred.Valid && proj.Starred.Int64 == 1
	if !isCurrentlyStarred {
		count, err := rq.CountStarredProjects(a.ctx)
		if err != nil {
			return false, fmt.Errorf("ToggleStarProject: CountStarred: %w", err)
		}
		if count >= 10 {
			return false, fmt.Errorf("maximum of 10 starred projects reached")
		}
	}

	wq := db.New(a.DB.Writer)
	if err := wq.ToggleStarProject(a.ctx, id); err != nil {
		return false, fmt.Errorf("ToggleStarProject: %w", err)
	}
	return !isCurrentlyStarred, nil
}

// IsGitRepo checks whether the given path contains a git repository.
func (a *App) IsGitRepo(path string) bool {
	return git.IsGitRepo(a.ctx, path)
}

// InitGitRepo runs `git init` at the given path.
func (a *App) InitGitRepo(path string) error {
	return git.InitRepo(a.ctx, path)
}

// ScanDirectory walks parentPath recursively (max 3 levels) and returns paths
// containing a .git directory. Skips node_modules, .git, vendor, and other
// non-project directories.
func (a *App) ScanDirectory(parentPath string) []string {
	var repos []string
	skipDirs := map[string]bool{
		"node_modules": true, ".git": true, "vendor": true,
		".cache": true, "dist": true, "build": true, "__pycache__": true,
	}

	maxDepth := 3
	parentDepth := strings.Count(filepath.Clean(parentPath), string(filepath.Separator))

	filepath.WalkDir(parentPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}
		if !d.IsDir() {
			return nil
		}

		depth := strings.Count(filepath.Clean(path), string(filepath.Separator)) - parentDepth
		if depth > maxDepth {
			return fs.SkipDir
		}

		if skipDirs[d.Name()] {
			return fs.SkipDir
		}

		// Check if this directory contains a .git subdirectory.
		gitPath := filepath.Join(path, ".git")
		if info, err := os.Stat(gitPath); err == nil && info.IsDir() {
			repos = append(repos, path)
			return fs.SkipDir // don't recurse into git repos
		}

		return nil
	})

	return repos
}

// CloneRepository clones a git repo from url into destPath, then registers it as a project.
// The repo name is extracted from the URL and appended to destPath so that
// cloning into an existing non-empty directory (e.g. ~/Code) works correctly.
func (a *App) CloneRepository(url, destPath string) (*db.Project, error) {
	repoName := repoNameFromURL(url)
	if repoName == "" {
		return nil, fmt.Errorf("CloneRepository: cannot extract repo name from URL %q", url)
	}
	target := filepath.Join(destPath, repoName)
	if err := git.Clone(a.ctx, url, target); err != nil {
		return nil, fmt.Errorf("CloneRepository: %w", err)
	}
	return a.AddProject(target)
}

// repoNameFromURL extracts the repository name from a git URL.
// Examples:
//
//	"https://github.com/user/repo.git" → "repo"
//	"git@github.com:user/repo.git"     → "repo"
//	"https://github.com/user/repo"     → "repo"
func repoNameFromURL(rawURL string) string {
	u := strings.TrimRight(rawURL, "/")
	u = strings.TrimSuffix(u, ".git")

	// HTTPS / path-based URLs: last segment after "/"
	if idx := strings.LastIndex(u, "/"); idx >= 0 {
		return u[idx+1:]
	}
	// SSH format: git@host:user/repo
	if idx := strings.LastIndex(u, ":"); idx >= 0 {
		part := u[idx+1:]
		if slashIdx := strings.LastIndex(part, "/"); slashIdx >= 0 {
			return part[slashIdx+1:]
		}
		return part
	}
	return ""
}
