-- preferences.sql - Operations for user_preferences table
-- Author: Subash Karki

-- name: GetPreference :one
SELECT value FROM user_preferences WHERE key = ?;

-- name: SetPreference :exec
INSERT INTO user_preferences (key, value, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at;

-- name: ListPreferences :many
SELECT * FROM user_preferences ORDER BY key ASC;
