// scanner_test.go verifies batch scan, offset-based reads, and file tailing.
// Author: Subash Karki
package stream

import (
	"context"
	"os"
	"testing"
	"time"
)

// writeLines writes newline-separated JSONL lines to a temp file and returns the path.
func writeTempJSONL(t *testing.T, lines []string) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "test-*.jsonl")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	for _, l := range lines {
		if _, err := f.WriteString(l + "\n"); err != nil {
			t.Fatalf("write line: %v", err)
		}
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close temp file: %v", err)
	}
	return f.Name()
}

var testLines = []string{
	`{"type":"human","message":{"role":"user","content":"Hello"}}`,
	`{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi there"}]}}`,
	`{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"main.go"}}]}}`,
}

func TestScanner_ScanAll(t *testing.T) {
	path := writeTempJSONL(t, testLines)
	sc := NewScanner("sess-scan-1", path)

	events, err := sc.ScanAll()
	if err != nil {
		t.Fatalf("ScanAll: %v", err)
	}
	if len(events) != len(testLines) {
		t.Fatalf("expected %d events, got %d", len(testLines), len(events))
	}
	if events[0].Type != EventUser {
		t.Fatalf("first event should be EventUser, got %s", events[0].Type)
	}
	if events[2].Type != EventToolUse {
		t.Fatalf("third event should be EventToolUse, got %s", events[2].Type)
	}
}

func TestScanner_EmptyFile(t *testing.T) {
	path := writeTempJSONL(t, nil)
	sc := NewScanner("sess-scan-2", path)

	events, err := sc.ScanAll()
	if err != nil {
		t.Fatalf("ScanAll on empty file: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected 0 events, got %d", len(events))
	}
}

func TestScanner_ScanFrom(t *testing.T) {
	// Write initial lines
	initialLines := testLines[:2]
	path := writeTempJSONL(t, initialLines)

	sc := NewScanner("sess-scan-3", path)

	// First scan — read all current content
	events, offset, err := sc.ScanFrom(0)
	if err != nil {
		t.Fatalf("ScanFrom(0): %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events on first scan, got %d", len(events))
	}
	if offset == 0 {
		t.Fatal("offset should be > 0 after reading content")
	}

	// Append a new line to the file
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatalf("open for append: %v", err)
	}
	if _, err := f.WriteString(testLines[2] + "\n"); err != nil {
		f.Close()
		t.Fatalf("append line: %v", err)
	}
	f.Close()

	// Second scan from last offset — should only return the new event
	newEvents, newOffset, err := sc.ScanFrom(offset)
	if err != nil {
		t.Fatalf("ScanFrom(offset): %v", err)
	}
	if len(newEvents) != 1 {
		t.Fatalf("expected 1 new event, got %d", len(newEvents))
	}
	if newEvents[0].Type != EventToolUse {
		t.Fatalf("expected EventToolUse, got %s", newEvents[0].Type)
	}
	if newOffset <= offset {
		t.Fatal("newOffset should be larger than previous offset")
	}
}

func TestScanner_Tail(t *testing.T) {
	// Create an empty file to tail
	f, err := os.CreateTemp(t.TempDir(), "tail-*.jsonl")
	if err != nil {
		t.Fatalf("create temp: %v", err)
	}
	path := f.Name()

	sc := NewScanner("sess-scan-4", path)
	ch := make(chan Event, 10)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Start tailing in background
	errCh := make(chan error, 1)
	go func() {
		errCh <- sc.Tail(ctx, ch)
	}()

	// Give the tailer a moment to start
	time.Sleep(100 * time.Millisecond)

	// Write lines to the file
	for _, line := range testLines {
		if _, err := f.WriteString(line + "\n"); err != nil {
			t.Fatalf("write to tailed file: %v", err)
		}
		if err := f.Sync(); err != nil {
			t.Fatalf("sync: %v", err)
		}
	}

	// Collect events until we have enough or timeout
	received := make([]Event, 0, len(testLines))
	deadline := time.After(3 * time.Second)
	for len(received) < len(testLines) {
		select {
		case ev := <-ch:
			received = append(received, ev)
		case <-deadline:
			t.Fatalf("timed out waiting for events; received %d/%d", len(received), len(testLines))
		}
	}

	cancel() // stop the tailer
	f.Close()

	if len(received) < len(testLines) {
		t.Fatalf("expected at least %d events via tail, got %d", len(testLines), len(received))
	}
}
