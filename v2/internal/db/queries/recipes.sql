-- recipes.sql - CRUD operations for custom_recipes and recipe_favorites tables
-- Author: Subash Karki

-- name: ListCustomRecipesByProject :many
SELECT * FROM custom_recipes WHERE project_id = ? ORDER BY created_at ASC;

-- name: GetCustomRecipe :one
SELECT * FROM custom_recipes WHERE id = ?;

-- name: CreateCustomRecipe :exec
INSERT INTO custom_recipes (
    id, project_id, label, command, icon, category,
    description, favorite, created_at, updated_at
) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?
);

-- name: UpdateCustomRecipe :exec
UPDATE custom_recipes SET
    label = ?,
    command = ?,
    icon = ?,
    category = ?,
    description = ?,
    updated_at = ?
WHERE id = ?;

-- name: DeleteCustomRecipe :exec
DELETE FROM custom_recipes WHERE id = ?;

-- name: DeleteCustomRecipesByProject :exec
DELETE FROM custom_recipes WHERE project_id = ?;

-- name: ListRecipeFavorites :many
SELECT * FROM recipe_favorites WHERE project_id = ? ORDER BY created_at ASC;

-- name: AddRecipeFavorite :exec
INSERT OR IGNORE INTO recipe_favorites (project_id, recipe_id, created_at)
VALUES (?, ?, ?);

-- name: RemoveRecipeFavorite :exec
DELETE FROM recipe_favorites WHERE project_id = ? AND recipe_id = ?;

-- name: DeleteRecipeFavoritesByProject :exec
DELETE FROM recipe_favorites WHERE project_id = ?;
