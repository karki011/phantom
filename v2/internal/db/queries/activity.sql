-- activity.sql - Operations for activity_log table
-- Author: Subash Karki

-- name: InsertActivity :exec
INSERT INTO activity_log (
    timestamp, type, session_id, metadata, xp_earned
) VALUES (
    ?, ?, ?, ?, ?
);

-- name: ListRecentActivity :many
SELECT * FROM activity_log
WHERE (session_id = ? OR ? IS NULL)
ORDER BY timestamp DESC
LIMIT ?;
