// Package chat provides the chat service for Phantom OS v2.
// It manages conversations and messages with AI providers.
// Author: Subash Karki
package chat

// Conversation is the view model returned to the frontend.
type Conversation struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	Title       string `json:"title"`
	Model       string `json:"model"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

// Message is the view model returned to the frontend.
type Message struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	Role           string `json:"role"`
	Content        string `json:"content"`
	Model          string `json:"model"`
	CreatedAt      int64  `json:"created_at"`
}

// SendRequest is the payload for sending a chat message.
type SendRequest struct {
	ConversationID string `json:"conversation_id"`
	Content        string `json:"content"`
	Model          string `json:"model"`
}

// StreamChunk is emitted via Wails events during streaming responses.
type StreamChunk struct {
	ConversationID string `json:"conversation_id"`
	MessageID      string `json:"message_id"`
	Delta          string `json:"delta"`
	Done           bool   `json:"done"`
	Error          string `json:"error,omitempty"`
}
