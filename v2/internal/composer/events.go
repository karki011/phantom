// Author: Subash Karki
package composer

import (
	"encoding/json"
	"fmt"
	"strings"
)

type EventKind string

const (
	// Real protocol kinds (Claude CLI stream-json)
	EventSystemInit               EventKind = "system_init"
	EventSystemStatus             EventKind = "system_status"
	EventStrategy                 EventKind = "strategy"            // AI engine strategy selection
	EventAssistant                EventKind = "assistant"           // complete assistant message
	EventStreamEvent              EventKind = "stream_event"       // partial message delta (--include-partial-messages)
	EventResultSuccess            EventKind = "result_success"
	EventResultError              EventKind = "result_error"
	EventControlRequest           EventKind = "control_request"    // permission requests from CLI
	EventControlResponse          EventKind = "control_response"   // permission responses echoed back
	EventUserReplay               EventKind = "user_replay"        // --replay-user-messages echo
	EventError                    EventKind = "error"
	EventSessionStatus            EventKind = "session_status_changed"
	EventCompactBoundary          EventKind = "compact_boundary"       // context compaction marker
	EventEnrichedPrompt           EventKind = "enriched_prompt"        // enriched prompt text for UI transparency
	EventKeepAlive                EventKind = "keep_alive"             // CLI keepalive ping — silently dropped
	EventUnknown                  EventKind = "unknown"

	// Legacy aliases — kept so old tests compile; map to new kinds internally.
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

	// New fields for real Claude CLI protocol
	Message    json.RawMessage `json:"message,omitempty"`      // full assistant message object
	Request    json.RawMessage `json:"request,omitempty"`      // control_request payload
	Response   json.RawMessage `json:"response,omitempty"`     // control_response payload
	RequestID  string          `json:"request_id,omitempty"`   // for control req/resp matching
	Result     string          `json:"result,omitempty"`       // final text from result message
	DurationMs int64           `json:"duration_ms,omitempty"`  // from result

	// Inner Anthropic streaming event for stream_event kind.
	// Passed through so the frontend can handle the full event lifecycle
	// (message_start, content_block_start/delta/stop, message_delta/stop).
	Event      json.RawMessage `json:"event,omitempty"`
	// Block index from the inner event (content_block_start/delta/stop).
	BlockIndex int             `json:"block_index,omitempty"`

	// Enriched prompt text, populated on kind=="enriched_prompt".
	// Sent to the frontend so the UI can display the injected context.
	EnrichedText string `json:"enriched_text,omitempty"`

	// Strategy-specific fields, populated on kind=="strategy".
	// Emitted once per turn after the AI engine selects a strategy,
	// before the CLI run starts.
	StrategyName       string  `json:"strategy_name,omitempty"`
	StrategyConfidence float64 `json:"strategy_confidence,omitempty"`
	TaskComplexity     string  `json:"task_complexity,omitempty"`
	TaskRisk           string  `json:"task_risk,omitempty"`
	BlastRadius        int     `json:"blast_radius,omitempty"`

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
	Content      json.RawMessage `json:"content"`    // tool_result content (string or array of blocks)
	IsError      bool            `json:"is_error"`
	Description  string          `json:"description"`
	SessionID    string          `json:"session_id"`
	MessageID    string          `json:"message_id"`
	Text         string          `json:"text"`
	Error        string          `json:"error"`

	// Real protocol fields
	Message    json.RawMessage `json:"message"`      // full assistant message
	Request    json.RawMessage `json:"request"`      // control_request payload
	Response   json.RawMessage `json:"response"`     // control_response payload
	RequestID  string          `json:"request_id"`   // for control req/resp matching
	Result     string          `json:"result"`       // final text from result
	DurationMs int64           `json:"duration_ms"`  // from result

	// stream_event envelope — wraps an inner Anthropic API streaming event.
	Event json.RawMessage `json:"event"` // inner event for type=="stream_event"
}

// streamEventInner extracts delta text from the inner event of a stream_event
// envelope. The CLI wraps raw Anthropic streaming events as:
//
//	{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
//	{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"..."}}}
//	{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","id":"...","name":"..."}}}
type streamEventInner struct {
	Type         string `json:"type"`
	ContentBlock struct {
		Type string `json:"type"`
		ID   string `json:"id"`
		Name string `json:"name"`
		Text string `json:"text"`
	} `json:"content_block"`
	Delta struct {
		Type        string `json:"type"`
		Text        string `json:"text"`
		Thinking    string `json:"thinking"`
		PartialJSON string `json:"partial_json"`
	} `json:"delta"`
	Index int `json:"index"`
}

type contentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func classifyKind(typ, sub string) EventKind {
	switch typ {
	// ── Real Claude CLI protocol ──────────────────────────────────────
	case "system":
		switch sub {
		case "init":
			return EventSystemInit
		case "status":
			return EventSystemStatus
		case "compact_boundary":
			return EventCompactBoundary
		// Legacy subtypes kept for backward compat
		case "session_resumed":
			return EventSessionResumed
		case "info":
			return EventSystemInfo
		case "cancelled":
			return EventCancelled
		}
	case "assistant":
		// Complete assistant message (no subtype in real protocol).
		// Also handle legacy subtypes for backward compat.
		switch sub {
		case "":
			return EventAssistant
		case "message_delta":
			return EventAssistantMessageDelta
		case "message_complete":
			return EventAssistantMessageComplete
		case "thinking_delta":
			return EventThinkingDelta
		case "thinking_complete":
			return EventThinkingComplete
		}
		return EventAssistant
	case "result":
		if sub == "success" {
			return EventResultSuccess
		}
		return EventResultError
	case "control_request":
		return EventControlRequest
	case "control_response":
		return EventControlResponse
	case "user":
		return EventUserReplay
	case "stream_event":
		return EventStreamEvent
	case "strategy":
		return EventStrategy
	case "keep_alive":
		return EventKeepAlive

	// ── Legacy types (pre-protocol) ──────────────────────────────────
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

		// Real protocol fields
		Message:    raw.Message,
		Request:    raw.Request,
		Response:   raw.Response,
		RequestID:  raw.RequestID,
		Result:     raw.Result,
		DurationMs: raw.DurationMs,

		// Pass through raw inner event for stream_event so frontend
		// can handle the full Anthropic event lifecycle.
		Event:      raw.Event,

		Raw:         line,
	}

	// Extract text from content_block (legacy delta events)
	if len(raw.ContentBlock) > 0 {
		var cb contentBlock
		if err := json.Unmarshal(raw.ContentBlock, &cb); err == nil && cb.Text != "" {
			ev.Text = cb.Text
		}
	}

	// Extract tool_result content — the CLI sends "content" (string or array of
	// blocks) but the rawEnvelope maps "output" separately. Populate ToolOutput
	// from whichever field has data so the frontend reducer can update the chip.
	if ev.Kind == EventToolResult && ev.ToolOutput == "" && len(raw.Content) > 0 {
		var contentStr string
		if json.Unmarshal(raw.Content, &contentStr) == nil {
			ev.ToolOutput = contentStr
		} else {
			var blocks []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			}
			if json.Unmarshal(raw.Content, &blocks) == nil {
				var parts []string
				for _, b := range blocks {
					if b.Type == "text" {
						parts = append(parts, b.Text)
					}
				}
				ev.ToolOutput = strings.Join(parts, "\n")
			}
		}
		if len(ev.ToolOutput) > 50000 {
			ev.ToolOutput = ev.ToolOutput[:50000] + "\n... (truncated)"
		}
	}

	// Unwrap stream_event inner event to extract delta text, tool info, etc.
	// The CLI wraps Anthropic API streaming events in a stream_event envelope.
	// Without this, ev.Text stays empty and the frontend can't show streaming content.
	// The raw Event JSON is also forwarded so the frontend can handle the full
	// Anthropic event lifecycle (message_start, content_block_start/delta/stop,
	// message_delta, message_stop).
	if ev.Kind == EventStreamEvent && len(raw.Event) > 0 {
		var inner streamEventInner
		if json.Unmarshal(raw.Event, &inner) == nil {
			ev.RawSubtype = inner.Type // e.g. "content_block_delta", "content_block_start"
			ev.BlockIndex = inner.Index
			switch inner.Type {
			case "content_block_delta":
				switch inner.Delta.Type {
				case "text_delta":
					ev.Text = inner.Delta.Text
				case "thinking_delta":
					ev.Text = inner.Delta.Thinking
					ev.RawSubtype = "thinking_delta"
				case "input_json_delta":
					ev.Text = inner.Delta.PartialJSON
					ev.RawSubtype = "input_json_delta"
				}
			case "content_block_start":
				switch inner.ContentBlock.Type {
				case "tool_use":
					ev.ToolUseID = inner.ContentBlock.ID
					ev.ToolName = inner.ContentBlock.Name
					ev.RawSubtype = "tool_use_start"
				case "text":
					ev.Text = inner.ContentBlock.Text
					ev.RawSubtype = "text_start"
				case "thinking":
					ev.RawSubtype = "thinking_start"
				}
			case "content_block_stop":
				ev.RawSubtype = "content_block_stop"
			case "message_start":
				ev.RawSubtype = "message_start"
			case "message_delta":
				ev.RawSubtype = "message_delta"
			case "message_stop":
				ev.RawSubtype = "message_stop"
			}
		}
	}

	if ev.Kind == EventError && ev.Text == "" {
		ev.Text = raw.Error
	}

	// For control_request, extract tool_name and description from request payload
	if ev.Kind == EventControlRequest && len(raw.Request) > 0 {
		var req struct {
			Subtype     string          `json:"subtype"`
			ToolName    string          `json:"tool_name"`
			Description string          `json:"description"`
			Input       json.RawMessage `json:"input"`
		}
		if err := json.Unmarshal(raw.Request, &req); err == nil {
			if req.ToolName != "" {
				ev.ToolName = req.ToolName
			}
			if req.Description != "" {
				ev.Description = req.Description
			}
			if len(req.Input) > 0 {
				ev.ToolInput = req.Input
			}
		}
	}

	// For control_response, the request_id lives inside the nested "response"
	// object, not at the top level. Extract it so readStdout can route the
	// event to the pending ControlRequest channel.
	if ev.Kind == EventControlResponse && ev.RequestID == "" && len(raw.Response) > 0 {
		var resp struct {
			RequestID string `json:"request_id"`
		}
		if json.Unmarshal(raw.Response, &resp) == nil && resp.RequestID != "" {
			ev.RequestID = resp.RequestID
		}
	}

	return ev, nil
}
