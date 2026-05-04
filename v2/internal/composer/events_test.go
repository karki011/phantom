// Author: Subash Karki
//
// events_test.go — table-driven tests for stream-JSON event decoder.
package composer

import (
	"encoding/json"
	"testing"
)

func TestDecodeEvent_AssistantMessageDelta(t *testing.T) {
	raw := `{
		"type": "assistant",
		"subtype": "message_delta",
		"content_block": {"type": "text", "text": "Hello world"}
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventAssistantMessageDelta {
		t.Errorf("kind = %q, want %q", ev.Kind, EventAssistantMessageDelta)
	}
	if ev.Text != "Hello world" {
		t.Errorf("text = %q, want %q", ev.Text, "Hello world")
	}
}

func TestDecodeEvent_ToolUseStart(t *testing.T) {
	raw := `{
		"type": "tool_use",
		"subtype": "start",
		"tool_use_id": "tu_abc123",
		"tool_name": "Read"
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventToolUseStart {
		t.Errorf("kind = %q, want %q", ev.Kind, EventToolUseStart)
	}
	if ev.ToolUseID != "tu_abc123" {
		t.Errorf("tool_use_id = %q, want %q", ev.ToolUseID, "tu_abc123")
	}
	if ev.ToolName != "Read" {
		t.Errorf("tool_name = %q, want %q", ev.ToolName, "Read")
	}
}

func TestDecodeEvent_PermissionRequest(t *testing.T) {
	raw := `{
		"type": "permission",
		"subtype": "request",
		"tool_name": "Bash",
		"description": "Run command: ls -la"
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventPermissionRequest {
		t.Errorf("kind = %q, want %q", ev.Kind, EventPermissionRequest)
	}
	if ev.ToolName != "Bash" {
		t.Errorf("tool_name = %q, want %q", ev.ToolName, "Bash")
	}
	if ev.Description != "Run command: ls -la" {
		t.Errorf("description = %q, want %q", ev.Description, "Run command: ls -la")
	}
}

func TestDecodeEvent_UnknownKind(t *testing.T) {
	raw := `{
		"type": "completely_new_type",
		"subtype": "never_seen_before",
		"some_field": 42
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unknown kinds must not error, got: %v", err)
	}
	if ev.Kind != EventUnknown {
		t.Errorf("kind = %q, want %q", ev.Kind, EventUnknown)
	}
	if ev.RawType != "completely_new_type" {
		t.Errorf("raw_type = %q, want %q", ev.RawType, "completely_new_type")
	}
	if ev.RawSubtype != "never_seen_before" {
		t.Errorf("raw_subtype = %q, want %q", ev.RawSubtype, "never_seen_before")
	}
	// Raw should still be preserved
	if ev.Raw == nil {
		t.Error("raw should be preserved for unknown events")
	}
}

func TestDecodeEvent_InvalidJSON(t *testing.T) {
	_, err := DecodeEvent([]byte(`{not valid json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

// TestDecodeEvent_KindClassification uses table-driven tests to verify all
// type+subtype pairs map to the correct EventKind.
func TestDecodeEvent_KindClassification(t *testing.T) {
	tests := []struct {
		name    string
		typ     string
		subtype string
		want    EventKind
	}{
		// Real Claude CLI protocol
		{"system init", "system", "init", EventSystemInit},
		{"system status", "system", "status", EventSystemStatus},
		{"assistant (no subtype)", "assistant", "", EventAssistant},
		{"result success", "result", "success", EventResultSuccess},
		{"result error", "result", "error", EventResultError},
		{"control_request", "control_request", "", EventControlRequest},
		{"control_response", "control_response", "", EventControlResponse},
		{"user replay", "user", "", EventUserReplay},
		{"stream_event", "stream_event", "", EventStreamEvent},
		// Legacy subtypes (backward compat)
		{"assistant message delta", "assistant", "message_delta", EventAssistantMessageDelta},
		{"assistant message complete", "assistant", "message_complete", EventAssistantMessageComplete},
		{"thinking delta", "assistant", "thinking_delta", EventThinkingDelta},
		{"thinking complete", "assistant", "thinking_complete", EventThinkingComplete},
		{"tool use start", "tool_use", "start", EventToolUseStart},
		{"tool use complete", "tool_use", "complete", EventToolUseComplete},
		{"tool result", "tool_result", "", EventToolResult},
		{"permission request", "permission", "request", EventPermissionRequest},
		{"permission response", "permission", "response", EventPermissionResponse},
		{"session resumed", "system", "session_resumed", EventSessionResumed},
		{"system info", "system", "info", EventSystemInfo},
		{"cancelled", "system", "cancelled", EventCancelled},
		{"error", "error", "", EventError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			obj := map[string]string{"type": tt.typ}
			if tt.subtype != "" {
				obj["subtype"] = tt.subtype
			}
			data, _ := json.Marshal(obj)

			ev, err := DecodeEvent(data)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ev.Kind != tt.want {
				t.Errorf("kind = %q, want %q", ev.Kind, tt.want)
			}
		})
	}
}

// TestDecodeEvent_ContentBlockExtraction verifies text is pulled from
// content_block.text for assistant message deltas.
func TestDecodeEvent_ContentBlockExtraction(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		wantText string
	}{
		{
			"text in content_block",
			`{"type":"assistant","subtype":"message_delta","content_block":{"type":"text","text":"chunk1"}}`,
			"chunk1",
		},
		{
			"no content_block uses top-level text",
			`{"type":"assistant","subtype":"message_delta","text":"fallback"}`,
			"fallback",
		},
		{
			"empty content_block text",
			`{"type":"assistant","subtype":"message_delta","content_block":{"type":"text","text":""}}`,
			"",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ev, err := DecodeEvent([]byte(tt.raw))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ev.Text != tt.wantText {
				t.Errorf("text = %q, want %q", ev.Text, tt.wantText)
			}
		})
	}
}

// TestDecodeEvent_ToolResultFields verifies tool_result events extract
// tool_use_id, output, and is_error.
func TestDecodeEvent_ToolResultFields(t *testing.T) {
	raw := `{
		"type": "tool_result",
		"tool_use_id": "tu_xyz",
		"output": "file contents here",
		"is_error": true
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventToolResult {
		t.Errorf("kind = %q, want %q", ev.Kind, EventToolResult)
	}
	if ev.ToolUseID != "tu_xyz" {
		t.Errorf("tool_use_id = %q, want %q", ev.ToolUseID, "tu_xyz")
	}
	if ev.ToolOutput != "file contents here" {
		t.Errorf("output = %q, want %q", ev.ToolOutput, "file contents here")
	}
	if !ev.IsError {
		t.Error("is_error should be true")
	}
}

// TestDecodeEvent_SessionFields verifies session_id and message_id extraction.
func TestDecodeEvent_SessionFields(t *testing.T) {
	raw := `{
		"type": "system",
		"subtype": "session_resumed",
		"session_id": "sess_abc",
		"message_id": "msg_123"
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.SessionID != "sess_abc" {
		t.Errorf("session_id = %q, want %q", ev.SessionID, "sess_abc")
	}
	if ev.MessageID != "msg_123" {
		t.Errorf("message_id = %q, want %q", ev.MessageID, "msg_123")
	}
}

// TestDecodeEvent_ToolInput verifies tool_input is preserved as json.RawMessage.
func TestDecodeEvent_ToolInput(t *testing.T) {
	raw := `{
		"type": "tool_use",
		"subtype": "start",
		"tool_name": "Edit",
		"tool_use_id": "tu_edit1",
		"tool_input": {"file_path": "/tmp/foo.go", "old_string": "a", "new_string": "b"}
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.ToolInput == nil {
		t.Fatal("tool_input should not be nil")
	}

	var input map[string]string
	if err := json.Unmarshal(ev.ToolInput, &input); err != nil {
		t.Fatalf("failed to unmarshal tool_input: %v", err)
	}
	if input["file_path"] != "/tmp/foo.go" {
		t.Errorf("file_path = %q, want %q", input["file_path"], "/tmp/foo.go")
	}
}

// ---------------------------------------------------------------------------
// Real Claude CLI protocol tests
// ---------------------------------------------------------------------------

// TestDecodeEvent_SystemInit verifies the system init message is decoded.
func TestDecodeEvent_SystemInit(t *testing.T) {
	raw := `{
		"type": "system",
		"subtype": "init",
		"session_id": "sess_abc123"
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventSystemInit {
		t.Errorf("kind = %q, want %q", ev.Kind, EventSystemInit)
	}
	if ev.SessionID != "sess_abc123" {
		t.Errorf("session_id = %q, want %q", ev.SessionID, "sess_abc123")
	}
}

// TestDecodeEvent_AssistantMessage verifies complete assistant message decoding.
func TestDecodeEvent_AssistantMessage(t *testing.T) {
	raw := `{
		"type": "assistant",
		"message": {
			"role": "assistant",
			"content": [
				{"type": "text", "text": "Hello!"},
				{"type": "tool_use", "id": "tu_123", "name": "Bash", "input": {"command": "ls"}}
			],
			"stop_reason": "end_turn"
		}
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventAssistant {
		t.Errorf("kind = %q, want %q", ev.Kind, EventAssistant)
	}
	if ev.Message == nil {
		t.Fatal("message should not be nil")
	}

	// Verify the message payload round-trips
	var msg struct {
		Role    string `json:"role"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
	}
	if err := json.Unmarshal(ev.Message, &msg); err != nil {
		t.Fatalf("failed to unmarshal message: %v", err)
	}
	if msg.Role != "assistant" {
		t.Errorf("role = %q, want %q", msg.Role, "assistant")
	}
	if len(msg.Content) != 2 {
		t.Fatalf("content length = %d, want 2", len(msg.Content))
	}
	if msg.Content[0].Text != "Hello!" {
		t.Errorf("content[0].text = %q, want %q", msg.Content[0].Text, "Hello!")
	}
	if msg.Content[1].Name != "Bash" {
		t.Errorf("content[1].name = %q, want %q", msg.Content[1].Name, "Bash")
	}
}

// TestDecodeEvent_ControlRequest verifies permission control_request decoding.
func TestDecodeEvent_ControlRequest(t *testing.T) {
	raw := `{
		"type": "control_request",
		"request_id": "req_abc123",
		"request": {
			"subtype": "can_use_tool",
			"tool_name": "Bash",
			"input": {"command": "rm -rf /tmp/test"},
			"description": "Delete test directory"
		}
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventControlRequest {
		t.Errorf("kind = %q, want %q", ev.Kind, EventControlRequest)
	}
	if ev.RequestID != "req_abc123" {
		t.Errorf("request_id = %q, want %q", ev.RequestID, "req_abc123")
	}
	// tool_name and description extracted from request payload
	if ev.ToolName != "Bash" {
		t.Errorf("tool_name = %q, want %q", ev.ToolName, "Bash")
	}
	if ev.Description != "Delete test directory" {
		t.Errorf("description = %q, want %q", ev.Description, "Delete test directory")
	}
	if ev.Request == nil {
		t.Fatal("request should not be nil")
	}
}

// TestDecodeEvent_ResultSuccess verifies result success event decoding.
func TestDecodeEvent_ResultSuccess(t *testing.T) {
	raw := `{
		"type": "result",
		"subtype": "success",
		"is_error": false,
		"duration_ms": 1234,
		"result": "Task completed successfully"
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventResultSuccess {
		t.Errorf("kind = %q, want %q", ev.Kind, EventResultSuccess)
	}
	if ev.Result != "Task completed successfully" {
		t.Errorf("result = %q, want %q", ev.Result, "Task completed successfully")
	}
	if ev.DurationMs != 1234 {
		t.Errorf("duration_ms = %d, want %d", ev.DurationMs, 1234)
	}
	if ev.IsError {
		t.Error("is_error should be false")
	}
}

// TestDecodeEvent_ResultError verifies result error event decoding.
func TestDecodeEvent_ResultError(t *testing.T) {
	raw := `{
		"type": "result",
		"subtype": "error",
		"is_error": true,
		"duration_ms": 500,
		"result": "Something went wrong"
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventResultError {
		t.Errorf("kind = %q, want %q", ev.Kind, EventResultError)
	}
	if !ev.IsError {
		t.Error("is_error should be true")
	}
}

// TestDecodeEvent_UserReplay verifies user replay message decoding.
func TestDecodeEvent_UserReplay(t *testing.T) {
	raw := `{
		"type": "user",
		"session_id": "",
		"message": {"role": "user", "content": [{"type": "text", "text": "hello"}]}
	}`

	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventUserReplay {
		t.Errorf("kind = %q, want %q", ev.Kind, EventUserReplay)
	}
	if ev.Message == nil {
		t.Fatal("message should not be nil")
	}
}
