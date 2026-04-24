// rule_test.go tests Rule matching logic.
// Author: Subash Karki
package safety

import (
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

func TestRule_MatchTool(t *testing.T) {
	r := Rule{ID: "t1", Tool: "Bash", Enabled: true}
	_ = r.Compile()

	bashEv := &stream.Event{ToolName: "Bash", ToolInput: "ls -la"}
	if !r.Match(bashEv) {
		t.Error("expected match for Bash event")
	}

	editEv := &stream.Event{ToolName: "Edit", ToolInput: "something"}
	if r.Match(editEv) {
		t.Error("expected no match for Edit event")
	}

	// Case-insensitive.
	lowerEv := &stream.Event{ToolName: "bash", ToolInput: "ls"}
	if !r.Match(lowerEv) {
		t.Error("expected case-insensitive match for 'bash'")
	}
}

func TestRule_MatchPattern(t *testing.T) {
	r := Rule{ID: "t2", Pattern: `rm\s+-rf`, Enabled: true}
	_ = r.Compile()

	if !r.Match(&stream.Event{ToolInput: "rm -rf /tmp/foo"}) {
		t.Error("expected pattern match")
	}
	if r.Match(&stream.Event{ToolInput: "ls -la"}) {
		t.Error("expected no pattern match")
	}
}

func TestRule_MatchPathPattern(t *testing.T) {
	r := Rule{ID: "t3", PathPattern: `\.env$`, Enabled: true}
	_ = r.Compile()

	if !r.Match(&stream.Event{FilePath: "/home/user/project/.env"}) {
		t.Error("expected path pattern match")
	}
	if r.Match(&stream.Event{FilePath: "/home/user/project/main.go"}) {
		t.Error("expected no path pattern match")
	}
}

func TestRule_MatchAll(t *testing.T) {
	r := Rule{
		ID:          "t4",
		Tool:        "Bash",
		Pattern:     `rm\s+-rf`,
		PathPattern: `\.\.`,
		Enabled:     true,
	}
	_ = r.Compile()

	// All three must match.
	ev := &stream.Event{ToolName: "Bash", ToolInput: "rm -rf ../secret", FilePath: "../secret"}
	if !r.Match(ev) {
		t.Error("expected full AND match")
	}

	// Missing tool match.
	ev2 := &stream.Event{ToolName: "Edit", ToolInput: "rm -rf ../secret", FilePath: "../secret"}
	if r.Match(ev2) {
		t.Error("expected no match when tool doesn't match")
	}
}

func TestRule_Disabled(t *testing.T) {
	r := Rule{ID: "t5", Tool: "Bash", Enabled: false}
	_ = r.Compile()

	if r.Match(&stream.Event{ToolName: "Bash", ToolInput: "anything"}) {
		t.Error("disabled rule must never match")
	}
}

func TestRule_CompileError(t *testing.T) {
	r := Rule{ID: "t6", Pattern: `[invalid`, Enabled: true}
	if err := r.Compile(); err == nil {
		t.Error("expected compile error for invalid regex")
	}
}

func TestRule_MatchEventType(t *testing.T) {
	r := Rule{ID: "et1", EventType: "tool_use", Tool: "Bash", Enabled: true}
	_ = r.Compile()

	// Matches tool_use event
	if !r.Match(&stream.Event{Type: stream.EventToolUse, ToolName: "Bash", ToolInput: "ls"}) {
		t.Error("expected match for tool_use event")
	}

	// Does not match user event
	if r.Match(&stream.Event{Type: stream.EventUser, Content: "hello"}) {
		t.Error("expected no match for user event with tool_use rule")
	}
}

func TestRule_MatchUserEvent(t *testing.T) {
	r := Rule{ID: "et2", EventType: "user", Pattern: `AKIA[0-9A-Z]{16}`, Enabled: true}
	_ = r.Compile()

	if !r.Match(&stream.Event{Type: stream.EventUser, Content: "use key AKIAIOSFODNN7EXAMPLE"}) {
		t.Error("expected match for user event with API key")
	}
	if r.Match(&stream.Event{Type: stream.EventAssistant, Content: "use key AKIAIOSFODNN7EXAMPLE"}) {
		t.Error("expected no match for assistant event with user rule")
	}
}

func TestRule_MatchNoEventType(t *testing.T) {
	// Rule with no EventType matches all event types (backwards compatible)
	r := Rule{ID: "et3", Pattern: `secret`, Enabled: true}
	_ = r.Compile()

	if !r.Match(&stream.Event{Type: stream.EventUser, Content: "my secret"}) {
		t.Error("expected match for user event with no event_type filter")
	}
	if !r.Match(&stream.Event{Type: stream.EventToolUse, ToolInput: "echo secret"}) {
		t.Error("expected match for tool_use event with no event_type filter")
	}
}

func TestRule_MatchAssistantEvent(t *testing.T) {
	r := Rule{ID: "et4", EventType: "assistant", Pattern: `--force`, Enabled: true}
	_ = r.Compile()

	if !r.Match(&stream.Event{Type: stream.EventAssistant, Content: "run git push --force"}) {
		t.Error("expected match for assistant response with --force")
	}
	if r.Match(&stream.Event{Type: stream.EventAssistant, Content: "run git push"}) {
		t.Error("expected no match without --force")
	}
}

func TestRule_MatchSessionScope(t *testing.T) {
	r := Rule{ID: "s1", SessionIDs: []string{"sess-abc", "sess-def"}, Pattern: "test", Enabled: true}
	_ = r.Compile()

	// Matches when session is in scope.
	if !r.Match(&stream.Event{SessionID: "sess-abc", ToolInput: "test"}) {
		t.Error("expected match for scoped session")
	}

	// Does not match when session is out of scope.
	if r.Match(&stream.Event{SessionID: "sess-xyz", ToolInput: "test"}) {
		t.Error("expected no match for out-of-scope session")
	}
}

func TestRule_MatchNoSessionScope(t *testing.T) {
	// Empty SessionIDs = matches all sessions (backwards compatible).
	r := Rule{ID: "s2", Pattern: "test", Enabled: true}
	_ = r.Compile()

	if !r.Match(&stream.Event{SessionID: "any-session", ToolInput: "test"}) {
		t.Error("expected match for unscoped rule")
	}
}
