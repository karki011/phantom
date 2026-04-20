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
