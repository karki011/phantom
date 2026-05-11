// Author: Subash Karki
//
// Integration tests for the MemoryExtractor pipeline: events -> extract -> store.
package extractor

import (
	"context"
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// buildRealisticSession constructs a sequence of events simulating a debugging
// session with error-fix cycles. Key design choices:
//   - 8+ user messages to exceed quick_fix threshold (turnCount > 5)
//   - 2+ errors and 2+ edits to trigger debugging profile
//   - Bash commands within 3 indices of each other for retry detection
func buildRealisticSession() []stream.Event {
	now := time.Now().Unix()

	return []stream.Event{
		// 0: User asks to fix a bug.
		{ID: "e-0", SessionID: "s-1", Type: stream.EventUser, Content: "please fix the authentication bug in auth.go", Timestamp: now},
		// 1: Read.
		{ID: "e-1", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Read", FilePath: "/repo/auth.go", Timestamp: now + 1},
		// 2: Read result.
		{ID: "e-2", SessionID: "s-1", Type: stream.EventToolResult, Content: "func handleAuth() { ... }", Timestamp: now + 2},
		// 3: Edit auth.go.
		{ID: "e-3", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Edit", FilePath: "/repo/auth.go", Timestamp: now + 3},
		// 4: Edit result.
		{ID: "e-4", SessionID: "s-1", Type: stream.EventToolResult, Timestamp: now + 4},
		// 5: Bash: go test (1st).
		{ID: "e-5", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Bash", Content: "go test ./...", Timestamp: now + 5},
		// 6: FAIL — error #1.
		{ID: "e-6", SessionID: "s-1", Type: stream.EventToolResult, IsError: true, Content: "FAIL internal/auth - test failed", Timestamp: now + 6},
		// 7: Edit auth.go again.
		{ID: "e-7", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Edit", FilePath: "/repo/auth.go", Timestamp: now + 7},
		// 8: Bash: go test (2nd, retry — gap from index 5 is 3, which is <= 3).
		{ID: "e-8", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Bash", Content: "go test ./...", Timestamp: now + 8},
		// 9: FAIL — error #2.
		{ID: "e-9", SessionID: "s-1", Type: stream.EventToolResult, IsError: true, Content: "FAIL internal/auth - assertion failed", Timestamp: now + 9},
		// 10: Edit auth.go (3rd edit).
		{ID: "e-10", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Edit", FilePath: "/repo/auth.go", Timestamp: now + 10},
		// 11: Bash: go test (3rd, retry — gap from index 8 is 3).
		{ID: "e-11", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Bash", Content: "go test ./...", Timestamp: now + 11},
		// 12: PASS — resolves errors.
		{ID: "e-12", SessionID: "s-1", Type: stream.EventToolResult, Content: "ok internal/auth 0.5s", Timestamp: now + 12},
		// 13: User follow-up.
		{ID: "e-13", SessionID: "s-1", Type: stream.EventUser, Content: "great, now check middleware", Timestamp: now + 13},
		// 14: Read.
		{ID: "e-14", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Read", FilePath: "/repo/middleware.go", Timestamp: now + 14},
		// 15: Result.
		{ID: "e-15", SessionID: "s-1", Type: stream.EventToolResult, Content: "func middleware() { ... }", Timestamp: now + 15},
		// 16: User.
		{ID: "e-16", SessionID: "s-1", Type: stream.EventUser, Content: "fix that too", Timestamp: now + 16},
		// 17: Edit middleware.
		{ID: "e-17", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Edit", FilePath: "/repo/middleware.go", Timestamp: now + 17},
		// 18: Result.
		{ID: "e-18", SessionID: "s-1", Type: stream.EventToolResult, Timestamp: now + 18},
		// 19: User.
		{ID: "e-19", SessionID: "s-1", Type: stream.EventUser, Content: "run the build", Timestamp: now + 19},
		// 20: Bash build.
		{ID: "e-20", SessionID: "s-1", Type: stream.EventToolUse, ToolName: "Bash", Content: "go build ./...", Timestamp: now + 20},
		// 21: Build OK.
		{ID: "e-21", SessionID: "s-1", Type: stream.EventToolResult, Content: "ok", Timestamp: now + 21},
		// 22-29: More user turns to establish turn count > 5.
		{ID: "e-22", SessionID: "s-1", Type: stream.EventUser, Content: "anything else to fix?", Timestamp: now + 22},
		{ID: "e-23", SessionID: "s-1", Type: stream.EventAssistant, Content: "Everything looks clean now.", Timestamp: now + 23},
		{ID: "e-24", SessionID: "s-1", Type: stream.EventUser, Content: "what about the tests?", Timestamp: now + 24},
		{ID: "e-25", SessionID: "s-1", Type: stream.EventAssistant, Content: "All tests are passing.", Timestamp: now + 25},
		{ID: "e-26", SessionID: "s-1", Type: stream.EventUser, Content: "good work", Timestamp: now + 26},
		{ID: "e-27", SessionID: "s-1", Type: stream.EventUser, Content: "looks good, thanks!", Timestamp: now + 27},
		{ID: "e-28", SessionID: "s-1", Type: stream.EventUser, Content: "ship it", Timestamp: now + 28},
	}
}

// TestExtractorPipeline exercises the full extraction pipeline with realistic events.
func TestExtractorPipeline(t *testing.T) {
	t.Parallel()

	me := New()
	events := buildRealisticSession()

	// Extract.
	result := me.Extract("s-1", events)

	// Verify files: auth.go should have 3 edits, middleware.go should have 1.
	if len(result.Files.Files) < 2 {
		t.Fatalf("expected at least 2 files edited, got %d", len(result.Files.Files))
	}
	authEdits := 0
	mwEdits := 0
	for _, f := range result.Files.Files {
		switch f.Path {
		case "/repo/auth.go":
			authEdits = f.EditCount + f.WriteCount
		case "/repo/middleware.go":
			mwEdits = f.EditCount + f.WriteCount
		}
	}
	if authEdits != 3 {
		t.Errorf("auth.go: expected 3 edits, got %d", authEdits)
	}
	if mwEdits != 1 {
		t.Errorf("middleware.go: expected 1 edit, got %d", mwEdits)
	}

	// Verify errors: 2 errors (both FAIL results).
	if result.Errors.Total < 2 {
		t.Errorf("expected at least 2 errors, got %d", result.Errors.Total)
	}

	// Verify commands: should include "go test ./..." pattern.
	goTestPattern := ""
	for _, cmd := range result.Commands.Commands {
		if cmd.Pattern != "" && len(cmd.Pattern) >= 7 && cmd.Pattern[:7] == "go test" {
			goTestPattern = cmd.Pattern
			break
		}
	}
	if goTestPattern == "" {
		t.Errorf("expected 'go test' in command patterns, commands: %+v", result.Commands.Commands)
	}

	// Verify retry detection: with 3 go test calls at indices 5, 8, 11 (gaps of 3),
	// at least one should be marked as retry.
	retryFound := false
	for _, cmd := range result.Commands.Commands {
		if cmd.IsRetry {
			retryFound = true
			break
		}
	}
	if !retryFound {
		t.Errorf("expected at least one retry, commands: %+v", result.Commands.Commands)
	}

	// Verify satisfaction: "good work" + "looks good" + "thanks" + "ship it" should give > 0.5.
	if result.Outcome.Score <= 0.5 {
		t.Errorf("expected satisfaction score > 0.5, got %.2f", result.Outcome.Score)
	}

	// Verify profile: with 2+ errors and 4+ edits and 9 user turns, should be debugging.
	if result.Profile.Type != ProfileDebugging {
		t.Errorf("expected debugging profile, got %q (turnCount=%d, errors=%d, edits=%d)",
			result.Profile.Type, result.Profile.TurnCount, result.Errors.Total, result.Files.TotalEdits)
	}

	// Store is a no-op — just verify it doesn't error.
	if err := me.Store(context.Background(), result); err != nil {
		t.Fatalf("Store: %v", err)
	}
}

// TestExtractorPipeline_EmptyEvents verifies graceful handling of empty input.
func TestExtractorPipeline_EmptyEvents(t *testing.T) {
	t.Parallel()

	me := New()

	result := me.Extract("s-empty", nil)
	if result == nil {
		t.Fatal("expected non-nil result for empty events")
	}
	if len(result.Files.Files) != 0 {
		t.Errorf("expected 0 files, got %d", len(result.Files.Files))
	}
	if result.Errors.Total != 0 {
		t.Errorf("expected 0 errors, got %d", result.Errors.Total)
	}
	// Default satisfaction should be 0.5 (neutral).
	if result.Outcome.Score != 0.5 {
		t.Errorf("expected neutral score 0.5, got %.2f", result.Outcome.Score)
	}
}

// TestExtractorPipeline_StoreIsNoOp verifies Store is always a safe no-op.
func TestExtractorPipeline_StoreIsNoOp(t *testing.T) {
	t.Parallel()

	me := New()
	result := me.Extract("s-1", buildRealisticSession())

	err := me.Store(context.Background(), result)
	if err != nil {
		t.Fatalf("Store should be a no-op, got error: %v", err)
	}
}

// TestExtractorPipeline_ProfileClassification tests different session profiles.
func TestExtractorPipeline_ProfileClassification(t *testing.T) {
	t.Parallel()

	now := time.Now().Unix()

	tests := []struct {
		name   string
		events []stream.Event
		want   SessionProfileType
	}{
		{
			name: "quick_fix",
			events: []stream.Event{
				{Type: stream.EventUser, Content: "fix typo", Timestamp: now},
				{Type: stream.EventToolUse, ToolName: "Edit", FilePath: "/a.go", Timestamp: now + 1},
				{Type: stream.EventToolResult, Timestamp: now + 2},
				{Type: stream.EventUser, Content: "done", Timestamp: now + 3},
			},
			want: ProfileQuickFix,
		},
		{
			name: "exploration",
			events: func() []stream.Event {
				var evs []stream.Event
				evs = append(evs, stream.Event{Type: stream.EventUser, Content: "explore", Timestamp: now})
				for i := 0; i < 10; i++ {
					evs = append(evs, stream.Event{
						Type:      stream.EventToolUse,
						ToolName:  "Read",
						FilePath:  "/file.go",
						Timestamp: now + int64(i+1),
					})
				}
				return evs
			}(),
			want: ProfileExploration,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			me := New()
			result := me.Extract("s-"+tt.name, tt.events)
			if result.Profile.Type != tt.want {
				t.Errorf("expected profile %q, got %q", tt.want, result.Profile.Type)
			}
		})
	}
}
