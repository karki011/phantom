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

// StreamEvent is emitted via Wails events during streaming responses.
// It matches the frontend's expected payload shape on the "chat:stream" event.
type StreamEvent struct {
	Type      string `json:"type"`                 // "delta" | "done" | "error" | "thinking" | "tool_use"
	Content   string `json:"content,omitempty"`     // text content for delta/thinking/error
	ToolName  string `json:"tool_name,omitempty"`   // tool name for tool_use events
	ToolInput string `json:"tool_input,omitempty"`  // tool input for tool_use events
}

// CompareEvent is emitted on the "chat:compare:event" channel during a
// Compare run. It wraps StreamEvent with the conversation/provider IDs so
// the frontend can route deltas to the correct provider column.
//
// A final aggregate event with ProviderID == "" and Type == "done" is
// emitted once every provider goroutine has completed.
type CompareEvent struct {
	ConversationID string `json:"conversation_id"`
	ProviderID     string `json:"provider_id,omitempty"` // "" for the final aggregate done event
	Type           string `json:"type"`                  // "delta" | "done" | "error" | "thinking" | "tool_use"
	Content        string `json:"content,omitempty"`
	ToolName       string `json:"tool_name,omitempty"`
	ToolInput      string `json:"tool_input,omitempty"`
}
