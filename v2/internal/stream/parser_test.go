// parser_test.go verifies the JSONL line parser for all major event types.
// Author: Subash Karki
package stream

import (
	"testing"
)

// --- fixtures ---

var sampleUserMessage = `{"type":"human","message":{"role":"user","content":"Fix the auth bug"}}`

var sampleThinkingBlock = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"I need to look at the auth code first."}]}}`

var sampleTextBlock = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Sure, let me read the file."}]}}`

var sampleToolUseRead = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_01Read","name":"Read","input":{"file_path":"auth/token.ts"}}]}}`

var sampleToolUseEdit = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_02Edit","name":"Edit","input":{"file_path":"auth/token.ts","old_string":"const x = 1;","new_string":"const x = 2;"}}]}}`

var sampleToolUseBash = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_03Bash","name":"Bash","input":{"command":"go test ./..."}}]}}`

var sampleToolResult = `{"type":"tool_result","tool_use_id":"toolu_01Read","content":"package auth","is_error":false}`

var sampleResultWithUsage = `{"type":"result","usage":{"input_tokens":1234,"output_tokens":567,"cache_read_input_tokens":100,"cache_creation_input_tokens":50}}`

var sampleMalformed = `{not valid json`

// --- tests ---

func TestParser_UserMessage(t *testing.T) {
	p := NewParser("sess-1")
	ev := p.ParseLine([]byte(sampleUserMessage))
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	if ev.Type != EventUser {
		t.Fatalf("expected EventUser, got %s", ev.Type)
	}
	if ev.Content != "Fix the auth bug" {
		t.Fatalf("unexpected content: %q", ev.Content)
	}
	if ev.SeqNum != 0 {
		t.Fatalf("expected SeqNum 0, got %d", ev.SeqNum)
	}
}

func TestParser_ThinkingBlock(t *testing.T) {
	p := NewParser("sess-2")
	ev := p.ParseLine([]byte(sampleThinkingBlock))
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	if ev.Type != EventThinking {
		t.Fatalf("expected EventThinking, got %s", ev.Type)
	}
	if ev.Content == "" {
		t.Fatal("expected thinking content to be non-empty")
	}
}

func TestParser_ToolUseRead(t *testing.T) {
	p := NewParser("sess-3")
	ev := p.ParseLine([]byte(sampleToolUseRead))
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	if ev.Type != EventToolUse {
		t.Fatalf("expected EventToolUse, got %s", ev.Type)
	}
	if ev.ToolName != "Read" {
		t.Fatalf("expected ToolName=Read, got %q", ev.ToolName)
	}
	if ev.FilePath != "auth/token.ts" {
		t.Fatalf("expected FilePath=auth/token.ts, got %q", ev.FilePath)
	}
}

func TestParser_ToolUseEdit(t *testing.T) {
	p := NewParser("sess-4")
	ev := p.ParseLine([]byte(sampleToolUseEdit))
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	if ev.Type != EventToolUse {
		t.Fatalf("expected EventToolUse, got %s", ev.Type)
	}
	if ev.ToolName != "Edit" {
		t.Fatalf("expected ToolName=Edit, got %q", ev.ToolName)
	}
	if ev.FilePath != "auth/token.ts" {
		t.Fatalf("expected FilePath, got %q", ev.FilePath)
	}
	if ev.DiffContent == "" {
		t.Fatal("expected DiffContent to be populated for Edit tool")
	}
	if ev.OldContent != "const x = 1;" {
		t.Fatalf("unexpected OldContent: %q", ev.OldContent)
	}
	if ev.NewContent != "const x = 2;" {
		t.Fatalf("unexpected NewContent: %q", ev.NewContent)
	}
}

func TestParser_ToolUseBash(t *testing.T) {
	p := NewParser("sess-5")
	ev := p.ParseLine([]byte(sampleToolUseBash))
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	if ev.Type != EventToolUse {
		t.Fatalf("expected EventToolUse, got %s", ev.Type)
	}
	if ev.ToolName != "Bash" {
		t.Fatalf("expected ToolName=Bash, got %q", ev.ToolName)
	}
	if ev.Content != "go test ./..." {
		t.Fatalf("expected command in Content, got %q", ev.Content)
	}
}

func TestParser_ToolResult(t *testing.T) {
	p := NewParser("sess-6")
	ev := p.ParseLine([]byte(sampleToolResult))
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	if ev.Type != EventToolResult {
		t.Fatalf("expected EventToolResult, got %s", ev.Type)
	}
	if ev.ToolResultID != "toolu_01Read" {
		t.Fatalf("expected ToolResultID=toolu_01Read, got %q", ev.ToolResultID)
	}
	if ev.IsError {
		t.Fatal("expected IsError=false")
	}
}

func TestParser_TokenCounting(t *testing.T) {
	p := NewParser("sess-7")
	ev := p.ParseLine([]byte(sampleResultWithUsage))
	if ev == nil {
		t.Fatal("expected event for result line, got nil")
	}
	if ev.InputTokens != 1234 {
		t.Fatalf("expected InputTokens=1234, got %d", ev.InputTokens)
	}
	if ev.OutputTokens != 567 {
		t.Fatalf("expected OutputTokens=567, got %d", ev.OutputTokens)
	}
	if ev.CacheRead != 100 {
		t.Fatalf("expected CacheRead=100, got %d", ev.CacheRead)
	}
	if ev.CacheWrite != 50 {
		t.Fatalf("expected CacheWrite=50, got %d", ev.CacheWrite)
	}
}

func TestParser_CostCalculation(t *testing.T) {
	p := NewParser("sess-8")
	ev := p.ParseLine([]byte(sampleResultWithUsage))
	if ev == nil {
		t.Fatal("expected event, got nil")
	}
	// Sonnet pricing (default): 1234*3 + 567*15 + 100*0.3 + 50*3.75
	// = 3702 + 8505 + 30 + 187.5 = 12424.5 → 12424 micros
	if ev.CostMicros <= 0 {
		t.Fatalf("expected positive CostMicros, got %d", ev.CostMicros)
	}
}

func TestParser_SequenceNumbering(t *testing.T) {
	p := NewParser("sess-9")
	lines := []string{
		sampleUserMessage,
		sampleToolUseRead,
		sampleToolResult,
	}
	for i, line := range lines {
		ev := p.ParseLine([]byte(line))
		if ev == nil {
			t.Fatalf("line %d: expected event, got nil", i)
		}
		if ev.SeqNum != i {
			t.Fatalf("line %d: expected SeqNum=%d, got %d", i, i, ev.SeqNum)
		}
	}
}

func TestParser_SkipMalformed(t *testing.T) {
	p := NewParser("sess-10")
	// Should not panic, should return nil
	ev := p.ParseLine([]byte(sampleMalformed))
	if ev != nil {
		t.Fatalf("expected nil for malformed JSON, got %+v", ev)
	}
	// Empty line
	ev = p.ParseLine([]byte{})
	if ev != nil {
		t.Fatalf("expected nil for empty line, got %+v", ev)
	}
}
