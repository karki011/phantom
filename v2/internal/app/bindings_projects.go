// Wails bindings for project management.
// Author: Subash Karki
package app

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	"github.com/subashkarki/phantom-os-v2/internal/project"
)

// GetProjects returns all registered projects.
func (a *App) GetProjects() []db.Project {
	q := db.New(a.DB.Reader)
	projects, err := q.ListProjects(a.ctx)
	if err != nil {
		log.Printf("app/bindings_projects: ListProjects error: %v", err)
		return []db.Project{}
	}
	return projects
}

// AddProject detects the project type at repoPath, persists it to the DB,
// and returns the newly created project record.
func (a *App) AddProject(repoPath string) (*db.Project, error) {
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
	rq := db.New(a.DB.Reader)
	proj, err := rq.GetProject(a.ctx, id)
	if err != nil {
		return nil, fmt.Errorf("AddProject: GetProject after create: %w", err)
	}
	return &proj, nil
}

// RemoveProject deletes a project by ID.
func (a *App) RemoveProject(id string) error {
	q := db.New(a.DB.Writer)
	return q.DeleteProject(a.ctx, id)
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
		log.Printf("app/bindings_projects: GetProject(%s) error: %v", projectId, err)
		return []project.Recipe{}
	}

	if !proj.Profile.Valid || proj.Profile.String == "" {
		return []project.Recipe{}
	}

	var profile project.Profile
	if err := json.Unmarshal([]byte(proj.Profile.String), &profile); err != nil {
		log.Printf("app/bindings_projects: unmarshal profile for project %s: %v", projectId, err)
		return []project.Recipe{}
	}

	if profile.Recipes == nil {
		return []project.Recipe{}
	}
	return profile.Recipes
}
