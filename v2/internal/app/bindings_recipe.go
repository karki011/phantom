// Wails bindings for recipe management and execution.
// Author: Subash Karki
package app

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/project"
)

// EnrichedRecipe extends Recipe with favorite and custom status for the frontend.
type EnrichedRecipe struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Command     string `json:"command"`
	Icon        string `json:"icon"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Auto        bool   `json:"auto"`
	Favorite    bool   `json:"favorite"`
	Custom      bool   `json:"custom"`
}

// GetAllRecipes merges auto-detected recipes with custom recipes for a project
// and marks favorites. Returns an enriched list for the frontend.
func (a *App) GetAllRecipes(projectId string) []EnrichedRecipe {
	rq := db.New(a.DB.Reader)

	// 1. Load auto-detected recipes from the project profile.
	autoRecipes := a.getAutoDetectedRecipes(projectId)

	// 2. Load custom recipes from DB.
	customRows, err := rq.ListCustomRecipesByProject(a.ctx, projectId)
	if err != nil {
		slog.Error("GetAllRecipes: ListCustomRecipesByProject failed", "projectId", projectId, "err", err)
		customRows = []db.CustomRecipe{}
	}

	// 3. Load favorite set for quick lookup.
	favRows, err := rq.ListRecipeFavorites(a.ctx, projectId)
	if err != nil {
		slog.Error("GetAllRecipes: ListRecipeFavorites failed", "projectId", projectId, "err", err)
		favRows = []db.RecipeFavorite{}
	}
	favSet := make(map[string]bool, len(favRows))
	for _, f := range favRows {
		favSet[f.RecipeID] = true
	}

	// 4. Build enriched list: auto-detected first, then custom.
	result := make([]EnrichedRecipe, 0, len(autoRecipes)+len(customRows))

	for _, r := range autoRecipes {
		result = append(result, EnrichedRecipe{
			ID:          r.ID,
			Label:       r.Label,
			Command:     r.Command,
			Icon:        r.Icon,
			Description: r.Description,
			Category:    string(r.Category),
			Auto:        r.Auto,
			Favorite:    favSet[r.ID],
			Custom:      false,
		})
	}

	for _, r := range customRows {
		result = append(result, EnrichedRecipe{
			ID:          r.ID,
			Label:       r.Label,
			Command:     r.Command,
			Icon:        stringOrDefault(r.Icon, "⚡"),
			Description: stringOrDefault(r.Description, ""),
			Category:    stringOrDefault(r.Category, "custom"),
			Auto:        false,
			Favorite:    favSet[r.ID] || (r.Favorite.Valid && r.Favorite.Int64 == 1),
			Custom:      true,
		})
	}

	return result
}

// CreateCustomRecipe creates a new custom recipe for a project.
// Returns the ID of the newly created recipe.
func (a *App) CreateCustomRecipe(projectId, label, command, category string) (string, error) {
	if label == "" || command == "" {
		return "", fmt.Errorf("CreateCustomRecipe: label and command are required")
	}

	id := uuid.New().String()
	now := time.Now().Unix()

	cat := category
	if cat == "" {
		cat = "custom"
	}

	wq := db.New(a.DB.Writer)
	if err := wq.CreateCustomRecipe(a.ctx, db.CreateCustomRecipeParams{
		ID:        id,
		ProjectID: projectId,
		Label:     label,
		Command:   command,
		Icon:      sql.NullString{String: "⚡", Valid: true},
		Category:  sql.NullString{String: cat, Valid: true},
		Favorite:  sql.NullInt64{Int64: 1, Valid: true},
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		return "", fmt.Errorf("CreateCustomRecipe: %w", err)
	}

	return id, nil
}

// UpdateCustomRecipe updates an existing custom recipe's label, command, and category.
func (a *App) UpdateCustomRecipe(recipeId, label, command, category string) error {
	if label == "" || command == "" {
		return fmt.Errorf("UpdateCustomRecipe: label and command are required")
	}

	cat := category
	if cat == "" {
		cat = "custom"
	}

	wq := db.New(a.DB.Writer)
	return wq.UpdateCustomRecipe(a.ctx, db.UpdateCustomRecipeParams{
		Label:     label,
		Command:   command,
		Icon:      sql.NullString{String: "⚡", Valid: true},
		Category:  sql.NullString{String: cat, Valid: true},
		UpdatedAt: time.Now().Unix(),
		ID:        recipeId,
	})
}

// DeleteCustomRecipe removes a custom recipe and its favorite entry.
func (a *App) DeleteCustomRecipe(recipeId string) error {
	// Look up the recipe first to get its project_id for favorite cleanup.
	rq := db.New(a.DB.Reader)
	recipe, err := rq.GetCustomRecipe(a.ctx, recipeId)
	if err != nil {
		return fmt.Errorf("DeleteCustomRecipe: recipe %s not found: %w", recipeId, err)
	}

	wq := db.New(a.DB.Writer)

	// Remove from favorites if present.
	_ = wq.RemoveRecipeFavorite(a.ctx, db.RemoveRecipeFavoriteParams{
		ProjectID: recipe.ProjectID,
		RecipeID:  recipeId,
	})

	return wq.DeleteCustomRecipe(a.ctx, recipeId)
}

// ToggleRecipeFavorite adds or removes a recipe from the project's favorites.
// Returns the new favorite state.
func (a *App) ToggleRecipeFavorite(projectId, recipeId string) (bool, error) {
	rq := db.New(a.DB.Reader)

	// Check if already favorited.
	favs, err := rq.ListRecipeFavorites(a.ctx, projectId)
	if err != nil {
		return false, fmt.Errorf("ToggleRecipeFavorite: list favorites: %w", err)
	}

	isFav := false
	for _, f := range favs {
		if f.RecipeID == recipeId {
			isFav = true
			break
		}
	}

	wq := db.New(a.DB.Writer)

	if isFav {
		if err := wq.RemoveRecipeFavorite(a.ctx, db.RemoveRecipeFavoriteParams{
			ProjectID: projectId,
			RecipeID:  recipeId,
		}); err != nil {
			return false, fmt.Errorf("ToggleRecipeFavorite: remove: %w", err)
		}
		return false, nil
	}

	if err := wq.AddRecipeFavorite(a.ctx, db.AddRecipeFavoriteParams{
		ProjectID: projectId,
		RecipeID:  recipeId,
		CreatedAt: time.Now().Unix(),
	}); err != nil {
		return false, fmt.Errorf("ToggleRecipeFavorite: add: %w", err)
	}
	return true, nil
}

// GetFavoriteRecipes returns only the favorited recipes for a project (both auto and custom).
func (a *App) GetFavoriteRecipes(projectId string) []EnrichedRecipe {
	all := a.GetAllRecipes(projectId)
	var favs []EnrichedRecipe
	for _, r := range all {
		if r.Favorite {
			favs = append(favs, r)
		}
	}
	if favs == nil {
		return []EnrichedRecipe{}
	}
	return favs
}

// RunRecipe looks up a project recipe by ID (checking both auto-detected and custom),
// creates a terminal session in the project's repo directory, and runs the recipe
// command via the shell. Returns the session ID on success.
func (a *App) RunRecipe(projectId string, recipeId string) (string, error) {
	// 1. Fetch the project record to get its repo_path.
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		return "", fmt.Errorf("RunRecipe: GetProject(%s): %w", projectId, err)
	}

	// 2. Try auto-detected recipes first.
	var command string
	autoRecipes := a.getAutoDetectedRecipes(projectId)
	for _, r := range autoRecipes {
		if r.ID == recipeId {
			command = r.Command
			break
		}
	}

	// 3. If not found in auto-detected, try custom recipes.
	if command == "" {
		customRecipe, err := q.GetCustomRecipe(a.ctx, recipeId)
		if err != nil {
			return "", fmt.Errorf("RunRecipe: recipe %q not found in project %s", recipeId, projectId)
		}
		command = customRecipe.Command
	}

	// 4. Build a unique session ID and create the terminal.
	sessionID := fmt.Sprintf("recipe-%s-%s", recipeId, uuid.New().String())

	if err := a.CreateTerminal(sessionID, "", projectId, proj.RepoPath, 220, 50); err != nil {
		return "", fmt.Errorf("RunRecipe: CreateTerminal: %w", err)
	}

	// 5. Send the recipe command to the shell via PTY input.
	cmd := fmt.Sprintf("sh -c %q\n", command)
	if err := a.WriteTerminal(sessionID, cmd); err != nil {
		slog.Warn("RunRecipe: WriteTerminal failed", "sessionID", sessionID, "err", err)
	}

	return sessionID, nil
}

// getAutoDetectedRecipes parses auto-detected recipes from the project profile.
func (a *App) getAutoDetectedRecipes(projectId string) []project.Recipe {
	q := db.New(a.DB.Reader)
	proj, err := q.GetProject(a.ctx, projectId)
	if err != nil {
		slog.Error("getAutoDetectedRecipes: GetProject failed", "projectId", projectId, "err", err)
		return []project.Recipe{}
	}

	if !proj.Profile.Valid || proj.Profile.String == "" {
		return []project.Recipe{}
	}

	var profile project.Profile
	if err := json.Unmarshal([]byte(proj.Profile.String), &profile); err != nil {
		slog.Error("getAutoDetectedRecipes: unmarshal profile failed", "projectId", projectId, "err", err)
		return []project.Recipe{}
	}

	if profile.Recipes == nil {
		return []project.Recipe{}
	}
	return profile.Recipes
}

// stringOrDefault returns the sql.NullString value if valid, otherwise the default.
func stringOrDefault(s sql.NullString, def string) string {
	if s.Valid {
		return s.String
	}
	return def
}
