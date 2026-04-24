// Wails bindings for recipe running.
// Author: Subash Karki
package app

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/project"
)

// RunRecipe looks up a project recipe by ID, creates a terminal session in the
// project's repo directory, and runs the recipe command via the shell. It
// auto-subscribes the session so the frontend receives output events immediately.
// Returns the session ID (format: "recipe-{recipeId}-{uuid}") on success.
func (a *App) RunRecipe(projectId string, recipeId string) (string, error) {
	// 1. Fetch the project record to get its repo_path and profile.
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		return "", fmt.Errorf("RunRecipe: GetProject(%s): %w", projectId, err)
	}

	// 2. Parse the project profile to locate the requested recipe.
	if !proj.Profile.Valid || proj.Profile.String == "" {
		return "", fmt.Errorf("RunRecipe: project %s has no profile", projectId)
	}

	var profile project.Profile
	if err := json.Unmarshal([]byte(proj.Profile.String), &profile); err != nil {
		return "", fmt.Errorf("RunRecipe: unmarshal profile for project %s: %w", projectId, err)
	}

	var recipe *project.Recipe
	for i := range profile.Recipes {
		if profile.Recipes[i].ID == recipeId {
			recipe = &profile.Recipes[i]
			break
		}
	}
	if recipe == nil {
		return "", fmt.Errorf("RunRecipe: recipe %q not found in project %s", recipeId, projectId)
	}

	// 3. Build a unique session ID and create the terminal.
	sessionID := fmt.Sprintf("recipe-%s-%s", recipeId, uuid.New().String())

	// Recipe terminals are project-scoped (no worktreeId).
	if err := a.CreateTerminal(sessionID, "", projectId, proj.RepoPath, 220, 50); err != nil {
		return "", fmt.Errorf("RunRecipe: CreateTerminal: %w", err)
	}

	// 4. Send the recipe command to the shell via PTY input.
	// Using "sh -c" ensures shell built-ins and compound commands work correctly.
	cmd := fmt.Sprintf("sh -c %q\n", recipe.Command)
	if err := a.WriteTerminal(sessionID, cmd); err != nil {
		// Non-fatal: log and continue — the terminal is already open.
		log.Printf("app/bindings_terminal: RunRecipe: WriteTerminal(%s): %v", sessionID, err)
	}

	return sessionID, nil
}
