-- chat.sql - CRUD operations for chat_conversations and chat_messages tables
-- Author: Subash Karki

-- name: ListConversationsByWorkspace :many
SELECT * FROM chat_conversations
WHERE workspace_id = ?
ORDER BY updated_at DESC;

-- name: GetConversation :one
SELECT * FROM chat_conversations WHERE id = ?;

-- name: CreateConversation :exec
INSERT INTO chat_conversations (id, workspace_id, title, model, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?);

-- name: UpdateConversationTitle :exec
UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?;

-- name: UpdateConversationTimestamp :exec
UPDATE chat_conversations SET updated_at = ? WHERE id = ?;

-- name: DeleteConversation :exec
DELETE FROM chat_conversations WHERE id = ?;

-- name: ListMessagesByConversation :many
SELECT * FROM chat_messages
WHERE conversation_id = ?
ORDER BY created_at ASC;

-- name: CreateMessage :exec
INSERT INTO chat_messages (id, conversation_id, workspace_id, role, content, model, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: DeleteMessagesByConversation :exec
DELETE FROM chat_messages WHERE conversation_id = ?;
