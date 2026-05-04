// Author: Subash Karki
package composer

import (
	"encoding/json"
	"fmt"
)

type EventKind string

const (
	EventAssistantMessageDelta    EventKind = "assistant_message_delta"
	EventAssistantMessageComplete EventKind = "assistant_message_complete"
	EventThinkingDelta            EventKind = "thinking_delta"
	EventThinkingComplete         EventKind = "thinking_complete"
	EventToolUseStart             EventKind = "tool_use_start"
	EventToolUseComplete          EventKind = "tool_use_complete"
	EventToolResult               EventKind = "tool_result"
	EventPermissionRequest        EventKind = "permission_request"
	EventPermissionResponse       EventKind = "permission_response"
	EventSessionResumed           EventKind = "session_resumed"
	EventSystemInfo               EventKind = "system_info"
	EventCancelled                EventKind = "cancelled"
	EventError                    EventKind = "error"
	EventUnknown                  EventKind = "unknown"
)

type StreamEvent struct {
	Kind       EventKind       `json:"kind"`
	RawType    string          `json:"raw_type"`
	RawSubtype string          `json:"raw_subtype"`
	Text       string          `json:"text,omitempty"`
	ToolUseID  string          `json:"tool_use_id,omitempty"`
	ToolName   string          `json:"tool_name,omitempty"`
	ToolInput  json.RawMessage `json:"tool_input,omitempty"`
	ToolOutput string          `json:"tool_output,omitempty"`
	IsError    bool            `json:"is_error,omitempty"`
	Description string         `json:"description,omitempty"`
	SessionID  string          `json:"session_id,omitempty"`
	MessageID  string          `json:"message_id,omitempty"`
	Raw        json.RawMessage `json:"-"`
}

type rawEnvelope struct {
	Type         string          `json:"type"`
	Subtype      string          `json:"subtype"`
	ContentBlock json.RawMessage `json:"content_block"`
	ToolUseID    string          `json:"tool_use_id"`
	ToolName     string          `json:"tool_name"`
	ToolInput    json.RawMessage `json:"tool_input"`
	Output       string          `json:"output"`
	IsError      bool            `json:"is_error"`
	Description  string          `json:"description"`
	SessionID    string          `json:"session_id"`
	MessageID    string          `json:"message_id"`
	Text         string          `json:"text"`
	Error        string          `json:"error"`
}

type contentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func classifyKind(typ, sub string) EventKind {
	switch typ {
	case "assistant":
		switch sub {
		case "message_delta":
			return EventAssistantMessageDelta
		case "message_complete":
			return EventAssistantMessageComplete
		case "thinking_delta":
			return EventThinkingDelta
		case "thinking_complete":
			return EventThinkingComplete
		}
	case "tool_use":
		switch sub {
		case "start":
			return EventToolUseStart
		case "complete":
			return EventToolUseComplete
		}
	case "tool_result":
		return EventToolResult
	case "permission":
		switch sub {
		case "request":
			return EventPermissionRequest
		case "response":
			return EventPermissionResponse
		}
	case "system":
		switch sub {
		case "session_resumed":
			return EventSessionResumed
		case "info":
			return EventSystemInfo
		case "cancelled":
			return EventCancelled
		}
	case "error":
		return EventError
	}
	return EventUnknown
}

// DecodeEvent parses a single line of stream-JSON from the claude CLI stdout.
// Unknown event kinds return EventUnknown — never an error.
// Only invalid JSON returns an error.
func DecodeEvent(line []byte) (StreamEvent, error) {
	var raw rawEnvelope
	if err := json.Unmarshal(line, &raw); err != nil {
		return StreamEvent{}, fmt.Errorf("decode stream event: %w", err)
	}

	ev := StreamEvent{
		Kind:        classifyKind(raw.Type, raw.Subtype),
		RawType:     raw.Type,
		RawSubtype:  raw.Subtype,
		ToolUseID:   raw.ToolUseID,
		ToolName:    raw.ToolName,
		ToolInput:   raw.ToolInput,
		ToolOutput:  raw.Output,
		IsError:     raw.IsError,
		Description: raw.Description,
		SessionID:   raw.SessionID,
		MessageID:   raw.MessageID,
		Text:        raw.Text,
		Raw:         line,
	}

	if len(raw.ContentBlock) > 0 {
		var cb contentBlock
		if err := json.Unmarshal(raw.ContentBlock, &cb); err == nil && cb.Text != "" {
			ev.Text = cb.Text
		}
	}

	if ev.Kind == EventError && ev.Text == "" {
		ev.Text = raw.Error
	}

	return ev, nil
}
