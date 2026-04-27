-- 005_recipes.up.sql — Custom recipes and recipe favorites
-- Author: Subash Karki

CREATE TABLE IF NOT EXISTS custom_recipes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    label TEXT NOT NULL,
    command TEXT NOT NULL,
    icon TEXT DEFAULT '⚡',
    category TEXT DEFAULT 'custom',
    description TEXT,
    favorite INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_recipes_project ON custom_recipes(project_id);

CREATE TABLE IF NOT EXISTS recipe_favorites (
    project_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, recipe_id)
);
