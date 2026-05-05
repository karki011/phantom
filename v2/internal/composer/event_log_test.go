// Author: Subash Karki
//
// event_log_test.go — tests for NDJSON event log persistence.
package composer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestEventLog_WriteAndRead(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "events.ndjson")

	log, err := NewEventLog(path)
	if err != nil {
		t.Fatalf("NewEventLog: %v", err)
	}

	ev1 := StreamEvent{
		Kind:    EventAssistantMessageDelta,
		RawType: "assistant",
		Text:    "Hello",
	}
	ev2 := StreamEvent{
		Kind:     EventToolUseStart,
		RawType:  "tool_use",
		ToolName: "Read",
		ToolInput: json.RawMessage(`{"file_path":"/tmp/foo.go"}`),
	}

	if err := log.Append(ev1); err != nil {
		t.Fatalf("Append ev1: %v", err)
	}
	if err := log.Append(ev2); err != nil {
		t.Fatalf("Append ev2: %v", err)
	}
	if err := log.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	events, err := ReadEventLog(path)
	if err != nil {
		t.Fatalf("ReadEventLog: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("got %d events, want 2", len(events))
	}
	if events[0].Kind != EventAssistantMessageDelta {
		t.Errorf("events[0].Kind = %q, want %q", events[0].Kind, EventAssistantMessageDelta)
	}
	if events[0].Text != "Hello" {
		t.Errorf("events[0].Text = %q, want %q", events[0].Text, "Hello")
	}
	if events[1].Kind != EventToolUseStart {
		t.Errorf("events[1].Kind = %q, want %q", events[1].Kind, EventToolUseStart)
	}
	if events[1].ToolName != "Read" {
		t.Errorf("events[1].ToolName = %q, want %q", events[1].ToolName, "Read")
	}
}

func TestReadEventLogTail(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "events.ndjson")

	log, err := NewEventLog(path)
	if err != nil {
		t.Fatalf("NewEventLog: %v", err)
	}

	for i := 0; i < 100; i++ {
		ev := StreamEvent{
			Kind:    EventAssistantMessageDelta,
			RawType: "assistant",
			Text:    "chunk",
		}
		if err := log.Append(ev); err != nil {
			t.Fatalf("Append %d: %v", i, err)
		}
	}
	if err := log.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	tail, err := ReadEventLogTail(path, 10)
	if err != nil {
		t.Fatalf("ReadEventLogTail: %v", err)
	}
	if len(tail) != 10 {
		t.Fatalf("got %d events, want 10", len(tail))
	}
}

func TestReadEventLog_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.ndjson")

	if err := os.WriteFile(path, []byte{}, 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	events, err := ReadEventLog(path)
	if err != nil {
		t.Fatalf("ReadEventLog empty file should not error, got: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("got %d events, want 0", len(events))
	}
}

func TestReadEventLog_MissingFile(t *testing.T) {
	_, err := ReadEventLog("/tmp/nonexistent-phantom-test-file.ndjson")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}
