-- 005_recipes.down.sql — Remove custom recipes and recipe favorites
-- Author: Subash Karki

DROP INDEX IF EXISTS idx_custom_recipes_project;
DROP TABLE IF EXISTS recipe_favorites;
DROP TABLE IF EXISTS custom_recipes;
