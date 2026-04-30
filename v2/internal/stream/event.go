// event.go defines the typed event model for the Phantom stream parser.
// Author: Subash Karki
package stream

// EventType classifies the kind of event parsed from a JSONL line.
type EventType string

const (
	EventThinking   EventType = "thinking"
	EventToolUse    EventType = "tool_use"
	EventToolResult EventType = "tool_result"
	EventAssistant  EventType = "assistant"
	EventUser       EventType = "user"
	EventError      EventType = "error"
	EventSystem     EventType = "system"
)

// Event is a fully parsed, typed representation of a single JSONL line.
type Event struct {
	ID        string    `json:"id"`
	SessionID string    `json:"session_id"`
	Type      EventType `json:"type"`
	Timestamp int64     `json:"timestamp"`

	// Tool call fields (populated when Type == EventToolUse)
	ToolName  string `json:"tool_name,omitempty"`
	ToolInput string `json:"tool_input,omitempty"` // raw JSON of the tool input object
	FilePath  string `json:"file_path,omitempty"` // extracted from tool input where applicable

	// Tool result fields (populated when Type == EventToolResult)
	ToolResultID string `json:"tool_result_id,omitempty"`
	IsError      bool   `json:"is_error,omitempty"`

	// Diff fields (populated for Edit/Write tool calls)
	DiffContent string `json:"diff_content,omitempty"` // unified diff format
	OldContent  string `json:"old_content,omitempty"`
	NewContent  string `json:"new_content,omitempty"`

	// Text content (for thinking, assistant, user, error, system)
	Content string `json:"content,omitempty"`

	// Token / cost tracking
	InputTokens  int64 `json:"input_tokens,omitempty"`
	OutputTokens int64 `json:"output_tokens,omitempty"`
	CacheRead    int64 `json:"cache_read,omitempty"`
	CacheWrite   int64 `json:"cache_write,omitempty"`
	CostMicros   int64 `json:"cost_micros,omitempty"`

	// Model used for this event (populated from assistant messages)
	Model string `json:"model,omitempty"`

	// SeqNum is the zero-based sequence number within the session (for timeline / rewind).
	SeqNum int `json:"seq_num"`
}

// Timeline is a condensed, ordered view of a session's key events.
type Timeline struct {
	SessionID   string          `json:"session_id"`
	Events      []TimelinePoint `json:"events"`
	TotalTokens int64           `json:"total_tokens"`
	TotalCost   int64           `json:"total_cost"`
}

// TimelinePoint is a lightweight summary of one event for timeline rendering.
type TimelinePoint struct {
	SeqNum    int       `json:"seq_num"`
	Type      EventType `json:"type"`
	ToolName  string    `json:"tool_name,omitempty"`
	FilePath  string    `json:"file_path,omitempty"`
	Timestamp int64     `json:"timestamp"`
	CostDelta int64     `json:"cost_delta"`
}
