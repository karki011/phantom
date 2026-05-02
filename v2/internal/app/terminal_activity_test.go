// Author: Subash Karki
//
// Integration tests for the terminal session map and activity summary formatting.
package app

import (
	"sort"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// TestTerminalSessionMap_LinkAndQuery tests the basic link/query lifecycle.
func TestTerminalSessionMap_LinkAndQuery(t *testing.T) {
	t.Parallel()

	m := newTerminalSessionMap()

	// Link pane A to session 1.
	m.link("pane-a", "session-1")
	if got := m.sessionForPane("pane-a"); got != "session-1" {
		t.Fatalf("sessionForPane(pane-a): expected 'session-1', got %q", got)
	}
	panes := m.panesForSession("session-1")
	if len(panes) != 1 {
		t.Fatalf("panesForSession(session-1): expected 1 pane, got %d", len(panes))
	}

	// Link pane B to session 1 (two panes, one session).
	m.link("pane-b", "session-1")
	panes = m.panesForSession("session-1")
	if len(panes) != 2 {
		t.Fatalf("panesForSession(session-1): expected 2 panes, got %d", len(panes))
	}

	// Verify both panes are present.
	sort.Strings(panes)
	if panes[0] != "pane-a" || panes[1] != "pane-b" {
		t.Errorf("expected [pane-a, pane-b], got %v", panes)
	}
}

// TestTerminalSessionMap_UnlinkPane tests removing a single pane link.
func TestTerminalSessionMap_UnlinkPane(t *testing.T) {
	t.Parallel()

	m := newTerminalSessionMap()

	m.link("pane-a", "session-1")
	m.link("pane-b", "session-1")

	// Unlink pane A.
	m.unlink("pane-a")

	if got := m.sessionForPane("pane-a"); got != "" {
		t.Fatalf("sessionForPane(pane-a) after unlink: expected empty, got %q", got)
	}

	panes := m.panesForSession("session-1")
	if len(panes) != 1 {
		t.Fatalf("expected 1 remaining pane, got %d", len(panes))
	}
	if panes[0] != "pane-b" {
		t.Errorf("expected pane-b remaining, got %q", panes[0])
	}
}

// TestTerminalSessionMap_UnlinkSession tests removing all panes for a session.
func TestTerminalSessionMap_UnlinkSession(t *testing.T) {
	t.Parallel()

	m := newTerminalSessionMap()

	m.link("pane-a", "session-1")
	m.link("pane-b", "session-1")
	m.link("pane-c", "session-2") // different session — should not be affected

	removed := m.unlinkSession("session-1")
	if len(removed) != 2 {
		t.Fatalf("expected 2 removed panes, got %d", len(removed))
	}

	// Session 1 should have no panes.
	if panes := m.panesForSession("session-1"); len(panes) != 0 {
		t.Fatalf("expected 0 panes for session-1, got %d", len(panes))
	}

	// Pane A and B should be unlinked.
	if got := m.sessionForPane("pane-a"); got != "" {
		t.Errorf("pane-a still linked: %q", got)
	}
	if got := m.sessionForPane("pane-b"); got != "" {
		t.Errorf("pane-b still linked: %q", got)
	}

	// Session 2 should be unaffected.
	if panes := m.panesForSession("session-2"); len(panes) != 1 {
		t.Fatalf("expected 1 pane for session-2, got %d", len(panes))
	}
}

// TestTerminalSessionMap_RelinkPane tests that relinking a pane updates properly.
func TestTerminalSessionMap_RelinkPane(t *testing.T) {
	t.Parallel()

	m := newTerminalSessionMap()

	m.link("pane-a", "session-1")
	m.link("pane-a", "session-2") // relink to different session

	if got := m.sessionForPane("pane-a"); got != "session-2" {
		t.Fatalf("after relink: expected 'session-2', got %q", got)
	}

	// Session 1 should have no panes (pane-a was moved away).
	if panes := m.panesForSession("session-1"); len(panes) != 0 {
		t.Fatalf("session-1 should have 0 panes after relink, got %d", len(panes))
	}

	// Session 2 should have 1 pane.
	if panes := m.panesForSession("session-2"); len(panes) != 1 {
		t.Fatalf("session-2 should have 1 pane after relink, got %d", len(panes))
	}
}

// TestTerminalSessionMap_UnlinkNonExistent tests that unlinking a non-existent
// pane is a safe no-op.
func TestTerminalSessionMap_UnlinkNonExistent(t *testing.T) {
	t.Parallel()

	m := newTerminalSessionMap()
	m.unlink("nonexistent") // should not panic

	removed := m.unlinkSession("nonexistent")
	if len(removed) != 0 {
		t.Errorf("expected 0 removed for nonexistent session, got %d", len(removed))
	}
}

// TestTerminalSessionMap_SessionForPane_Empty tests querying an unlinked pane.
func TestTerminalSessionMap_SessionForPane_Empty(t *testing.T) {
	t.Parallel()

	m := newTerminalSessionMap()
	if got := m.sessionForPane("pane-x"); got != "" {
		t.Errorf("expected empty for unlinked pane, got %q", got)
	}
}

// TestTerminalSessionMap_PanesForSession_Empty tests querying a session with no panes.
func TestTerminalSessionMap_PanesForSession_Empty(t *testing.T) {
	t.Parallel()

	m := newTerminalSessionMap()
	if panes := m.panesForSession("session-x"); panes != nil {
		t.Errorf("expected nil for unknown session, got %v", panes)
	}
}

// --- Activity Summary Formatting ---

// TestFormatActivitySummary tests the activity summary formatter with various
// event types and tool names.
func TestFormatActivitySummary(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		event stream.Event
		want  string
	}{
		{
			name: "edit with file path",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Edit", FilePath: "/repo/auth.go"},
			want: "Editing auth.go",
		},
		{
			name: "write with file path",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Write", FilePath: "/repo/new.go"},
			want: "Writing new.go",
		},
		{
			name: "read with file path",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Read", FilePath: "/repo/config.ts"},
			want: "Reading config.ts",
		},
		{
			name: "bash with command",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Bash", ToolInput: `{"command":"go test ./..."}`},
			want: "Running: go test ./...",
		},
		{
			name: "grep with pattern",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Grep", ToolInput: `{"pattern":"handleAuth"}`},
			want: "Searching: handleAuth",
		},
		{
			name: "glob with pattern",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Glob", ToolInput: `{"pattern":"**/*.go"}`},
			want: "Finding files: **/*.go",
		},
		{
			name: "edit without file path",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Edit"},
			want: "Editing file",
		},
		{
			name: "bash without command",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Bash"},
			want: "Running command",
		},
		{
			name: "thinking event",
			event: stream.Event{Type: stream.EventThinking},
			want: "Thinking...",
		},
		{
			name: "user message",
			event: stream.Event{Type: stream.EventUser},
			want: "User message",
		},
		{
			name: "error event",
			event: stream.Event{Type: stream.EventError},
			want: "Error occurred",
		},
		{
			name: "tool result error",
			event: stream.Event{Type: stream.EventToolResult, IsError: true},
			want: "Tool error",
		},
		{
			name: "tool result success",
			event: stream.Event{Type: stream.EventToolResult, IsError: false},
			want: "",
		},
		{
			name: "agent spawn",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Agent"},
			want: "Spawning agent",
		},
		{
			name: "skill usage",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "Skill", ToolInput: `{"skill":"verify"}`},
			want: "Using skill: verify",
		},
		{
			name: "web fetch",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "WebFetch", ToolInput: `{"url":"https://example.com"}`},
			want: "Fetching: https://example.com",
		},
		{
			name: "unknown tool",
			event: stream.Event{Type: stream.EventToolUse, ToolName: "CustomTool"},
			want: "Using CustomTool",
		},
		{
			name: "nil event",
			event: stream.Event{}, // zero-value
			want: "",
		},
		{
			name: "assistant with content",
			event: stream.Event{Type: stream.EventAssistant, Content: "I found the bug in auth.go"},
			want: "Thinking: I found the bug in auth.go",
		},
		{
			name: "assistant with long content",
			event: stream.Event{Type: stream.EventAssistant, Content: "This is a very long assistant response that exceeds eighty characters and should be truncated for display purposes in the terminal activity summary"},
			want: "Thinking: This is a very long assistant response that exceeds eighty characters and sho...",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatActivitySummary(&tt.event)
			if got != tt.want {
				t.Errorf("formatActivitySummary(%s) = %q, want %q", tt.name, got, tt.want)
			}
		})
	}
}

// TestFormatActivitySummary_NilEvent tests nil event handling.
func TestFormatActivitySummary_NilEvent(t *testing.T) {
	t.Parallel()

	got := formatActivitySummary(nil)
	if got != "" {
		t.Errorf("expected empty for nil event, got %q", got)
	}
}
