// Author: Subash Karki
package extractor

import (
	"context"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// --- Helper to build test events ---

func makeEvent(t stream.EventType, opts ...func(*stream.Event)) stream.Event {
	ev := stream.Event{Type: t}
	for _, o := range opts {
		o(&ev)
	}
	return ev
}

func withToolName(name string) func(*stream.Event) {
	return func(e *stream.Event) { e.ToolName = name }
}

func withFilePath(fp string) func(*stream.Event) {
	return func(e *stream.Event) { e.FilePath = fp }
}

func withContent(c string) func(*stream.Event) {
	return func(e *stream.Event) { e.Content = c }
}

func withIsError(b bool) func(*stream.Event) {
	return func(e *stream.Event) { e.IsError = b }
}

func withTimestamp(ts int64) func(*stream.Event) {
	return func(e *stream.Event) { e.Timestamp = ts }
}

// --- FileEditAccumulator Tests ---

func TestFileEditAccumulator(t *testing.T) {
	acc := NewFileEditAccumulator()

	// 3 edits to auth.go.
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("auth.go")), 0)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("auth.go")), 1)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("auth.go")), 2)
	// 1 write to middleware.go.
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Write"), withFilePath("middleware.go")), 3)

	summary := acc.Summarize()

	if summary.TotalEdits != 4 {
		t.Errorf("TotalEdits = %d, want 4", summary.TotalEdits)
	}
	if len(summary.Files) != 2 {
		t.Fatalf("Files count = %d, want 2", len(summary.Files))
	}

	fileMap := make(map[string]FileEdit)
	for _, f := range summary.Files {
		fileMap[f.Path] = f
	}

	auth := fileMap["auth.go"]
	if auth.EditCount != 3 {
		t.Errorf("auth.go EditCount = %d, want 3", auth.EditCount)
	}
	if auth.WriteCount != 0 {
		t.Errorf("auth.go WriteCount = %d, want 0", auth.WriteCount)
	}

	mw := fileMap["middleware.go"]
	if mw.WriteCount != 1 {
		t.Errorf("middleware.go WriteCount = %d, want 1", mw.WriteCount)
	}
	if mw.EditCount != 0 {
		t.Errorf("middleware.go EditCount = %d, want 0", mw.EditCount)
	}
}

func TestFileEditAccumulator_IgnoresNonEditTools(t *testing.T) {
	acc := NewFileEditAccumulator()
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Read"), withFilePath("file.go")), 0)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Bash"), withFilePath("")), 1)

	summary := acc.Summarize()
	if summary.TotalEdits != 0 {
		t.Errorf("TotalEdits = %d, want 0", summary.TotalEdits)
	}
}

// --- ErrorAccumulator Tests ---

func TestErrorAccumulator_Resolved(t *testing.T) {
	acc := NewErrorAccumulator()

	// Tool use on auth.go sets file context.
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("auth.go")), 0)
	// Error result.
	acc.Process(makeEvent(stream.EventToolResult, withIsError(true), withContent("compilation failed: undefined variable")), 1)
	// Successful edit on the same file resolves the error.
	acc.Process(makeEvent(stream.EventToolResult, withIsError(false)), 2)

	summary := acc.Summarize()
	if summary.Total != 1 {
		t.Fatalf("Total = %d, want 1", summary.Total)
	}
	if summary.Resolved != 1 {
		t.Errorf("Resolved = %d, want 1", summary.Resolved)
	}
	if !summary.Errors[0].Resolved {
		t.Error("Expected error to be resolved")
	}
	if summary.Errors[0].ErrorType != "build" {
		t.Errorf("ErrorType = %q, want 'build'", summary.Errors[0].ErrorType)
	}
}

func TestErrorAccumulator_Unresolved(t *testing.T) {
	acc := NewErrorAccumulator()

	acc.Process(makeEvent(stream.EventToolUse, withToolName("Bash"), withFilePath("main.go")), 0)
	acc.Process(makeEvent(stream.EventToolResult, withIsError(true), withContent("panic: nil pointer dereference")), 1)

	summary := acc.Summarize()
	if summary.Total != 1 {
		t.Fatalf("Total = %d, want 1", summary.Total)
	}
	if summary.Resolved != 0 {
		t.Errorf("Resolved = %d, want 0", summary.Resolved)
	}
	if summary.Errors[0].Resolved {
		t.Error("Expected error to be unresolved")
	}
}

func TestErrorAccumulator_ErrorEventType(t *testing.T) {
	acc := NewErrorAccumulator()
	acc.Process(makeEvent(stream.EventError, withContent("traceback: file not found")), 0)

	summary := acc.Summarize()
	if summary.Total != 1 {
		t.Fatalf("Total = %d, want 1", summary.Total)
	}
	if summary.Errors[0].ErrorType != "runtime" {
		t.Errorf("ErrorType = %q, want 'runtime'", summary.Errors[0].ErrorType)
	}
}

// --- SatisfactionAccumulator Tests ---

func TestSatisfactionAccumulator_Positive(t *testing.T) {
	acc := NewSatisfactionAccumulator()

	acc.Process(makeEvent(stream.EventUser, withContent("looks good, thanks!")), 0)
	acc.Process(makeEvent(stream.EventUser, withContent("perfect, ship it")), 1)

	summary := acc.Summarize()
	if summary.Score <= 0.6 {
		t.Errorf("Score = %.2f, want > 0.6", summary.Score)
	}
}

func TestSatisfactionAccumulator_Negative(t *testing.T) {
	acc := NewSatisfactionAccumulator()

	acc.Process(makeEvent(stream.EventUser, withContent("wrong, that's not right")), 0)
	acc.Process(makeEvent(stream.EventUser, withContent("revert, try again, undo")), 1)

	summary := acc.Summarize()
	if summary.Score >= 0.4 {
		t.Errorf("Score = %.2f, want < 0.4", summary.Score)
	}
}

func TestSatisfactionAccumulator_Mixed(t *testing.T) {
	acc := NewSatisfactionAccumulator()

	acc.Process(makeEvent(stream.EventUser, withContent("great start")), 0)
	acc.Process(makeEvent(stream.EventUser, withContent("wrong approach")), 1)

	summary := acc.Summarize()
	if summary.Score < 0.2 || summary.Score > 0.8 {
		t.Errorf("Score = %.2f, want between 0.2 and 0.8", summary.Score)
	}
}

func TestSatisfactionAccumulator_NoMessages(t *testing.T) {
	acc := NewSatisfactionAccumulator()
	summary := acc.Summarize()
	if summary.Score != 0.5 {
		t.Errorf("Score = %.2f, want 0.5 for no messages", summary.Score)
	}
}

// --- CommandAccumulator Tests ---

func TestCommandAccumulator_Sanitize(t *testing.T) {
	acc := NewCommandAccumulator()

	acc.Process(makeEvent(stream.EventToolUse, withToolName("Bash"),
		withContent("curl -H API_KEY=sk-abc123 https://example.com")), 0)

	summary := acc.Summarize()
	if len(summary.Commands) != 1 {
		t.Fatalf("Commands = %d, want 1", len(summary.Commands))
	}
	cmd := summary.Commands[0]
	if cmd.Pattern == "" {
		t.Error("Pattern should not be empty")
	}
}

func TestCommandAccumulator_Retry(t *testing.T) {
	acc := NewCommandAccumulator()

	acc.Process(makeEvent(stream.EventToolUse, withToolName("Bash"), withContent("go test ./...")), 0)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Bash"), withContent("go test ./...")), 2)

	summary := acc.Summarize()
	if len(summary.Commands) != 2 {
		t.Fatalf("Commands = %d, want 2", len(summary.Commands))
	}
	if !summary.Commands[1].IsRetry {
		t.Error("Second command should be marked as retry")
	}
	if summary.RetryCount != 1 {
		t.Errorf("RetryCount = %d, want 1", summary.RetryCount)
	}
}

func TestCommandAccumulator_NotRetryWhenFarApart(t *testing.T) {
	acc := NewCommandAccumulator()

	acc.Process(makeEvent(stream.EventToolUse, withToolName("Bash"), withContent("go build")), 0)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Bash"), withContent("go build")), 10) // >3 apart

	summary := acc.Summarize()
	if summary.Commands[1].IsRetry {
		t.Error("Should not be retry when >3 turns apart")
	}
}

// --- ProfileAccumulator Tests ---

func TestProfileClassification_QuickFix(t *testing.T) {
	acc := NewProfileAccumulator()

	// 3 user turns, 2 edits.
	acc.Process(makeEvent(stream.EventUser), 0)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("a.go")), 1)
	acc.Process(makeEvent(stream.EventUser), 2)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("b.go")), 3)
	acc.Process(makeEvent(stream.EventUser), 4)

	profile := acc.Summarize()
	if profile.Type != ProfileQuickFix {
		t.Errorf("Profile = %q, want %q", profile.Type, ProfileQuickFix)
	}
}

func TestProfileClassification_Exploration(t *testing.T) {
	acc := NewProfileAccumulator()

	// 20 user turns, all reads.
	for i := 0; i < 20; i++ {
		acc.Process(makeEvent(stream.EventUser), i*2)
		acc.Process(makeEvent(stream.EventToolUse, withToolName("Read"), withFilePath("file.go")), i*2+1)
	}

	profile := acc.Summarize()
	if profile.Type != ProfileExploration {
		t.Errorf("Profile = %q, want %q", profile.Type, ProfileExploration)
	}
}

func TestProfileClassification_Debugging(t *testing.T) {
	acc := NewProfileAccumulator()

	// Error→fix cycles.
	for i := 0; i < 6; i++ {
		acc.Process(makeEvent(stream.EventUser), i*3)
	}
	acc.Process(makeEvent(stream.EventToolResult, withIsError(true)), 1)
	acc.Process(makeEvent(stream.EventToolResult, withIsError(true)), 3)
	acc.Process(makeEvent(stream.EventToolResult, withIsError(true)), 5)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("a.go")), 7)
	acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("b.go")), 8)

	profile := acc.Summarize()
	if profile.Type != ProfileDebugging {
		t.Errorf("Profile = %q, want %q", profile.Type, ProfileDebugging)
	}
}

func TestProfileClassification_DeepRefactor(t *testing.T) {
	acc := NewProfileAccumulator()

	// Many turns + many edits.
	for i := 0; i < 10; i++ {
		acc.Process(makeEvent(stream.EventUser), i*2)
		acc.Process(makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("file.go")), i*2+1)
	}

	profile := acc.Summarize()
	if profile.Type != ProfileDeepRefactor {
		t.Errorf("Profile = %q, want %q", profile.Type, ProfileDeepRefactor)
	}
}

func TestProfileClassification_Deployment(t *testing.T) {
	acc := NewProfileAccumulator()

	// Heavy bash usage.
	for i := 0; i < 10; i++ {
		acc.Process(makeEvent(stream.EventUser), i*2)
		acc.Process(makeEvent(stream.EventToolUse, withToolName("Bash")), i*2+1)
	}

	profile := acc.Summarize()
	if profile.Type != ProfileDeployment {
		t.Errorf("Profile = %q, want %q", profile.Type, ProfileDeployment)
	}
}

func TestProfileDuration(t *testing.T) {
	acc := NewProfileAccumulator()

	acc.Process(makeEvent(stream.EventUser, withTimestamp(1000)), 0)
	acc.Process(makeEvent(stream.EventUser, withTimestamp(1600)), 1) // 600 seconds = 10 minutes

	profile := acc.Summarize()
	if profile.DurationMins != 10 {
		t.Errorf("DurationMins = %d, want 10", profile.DurationMins)
	}
}

// --- Full Extract Test ---

func TestExtract_FullSession(t *testing.T) {
	events := []stream.Event{
		// User messages.
		makeEvent(stream.EventUser, withContent("fix the auth bug"), withTimestamp(1000)),
		makeEvent(stream.EventUser, withContent("looks good, thanks"), withTimestamp(1300)),
		// Tool uses.
		makeEvent(stream.EventToolUse, withToolName("Read"), withFilePath("auth.go"), withTimestamp(1050)),
		makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("auth.go"), withTimestamp(1100)),
		makeEvent(stream.EventToolUse, withToolName("Bash"), withContent("go test ./..."), withTimestamp(1150)),
		// Tool results.
		makeEvent(stream.EventToolResult, withIsError(true), withContent("--- FAIL: TestAuth"), withTimestamp(1160)),
		makeEvent(stream.EventToolUse, withToolName("Edit"), withFilePath("auth.go"), withTimestamp(1200)),
		makeEvent(stream.EventToolResult, withIsError(false), withTimestamp(1210)),
		makeEvent(stream.EventToolUse, withToolName("Bash"), withContent("go test ./..."), withTimestamp(1250)),
		makeEvent(stream.EventToolResult, withIsError(false), withTimestamp(1260)),
	}

	ext := New(nil)
	result := ext.Extract("test-session-123", events)

	if result == nil {
		t.Fatal("Extract returned nil")
	}
	if result.SessionID != "test-session-123" {
		t.Errorf("SessionID = %q, want 'test-session-123'", result.SessionID)
	}
	if len(result.Files.Files) == 0 {
		t.Error("Expected at least 1 file edit")
	}
	if result.Files.TotalEdits == 0 {
		t.Error("Expected TotalEdits > 0")
	}
	if result.Errors.Total == 0 {
		t.Error("Expected at least 1 error")
	}
	if len(result.Commands.Commands) == 0 {
		t.Error("Expected at least 1 command")
	}
	if result.Outcome.Score <= 0 {
		t.Error("Expected outcome score > 0")
	}
	if result.Profile.Type == "" {
		t.Error("Expected profile type to be set")
	}
	if result.TurnCount == 0 {
		t.Error("Expected TurnCount > 0")
	}
}

// --- Store Tests ---

func TestStore_NilVectorStore(t *testing.T) {
	ext := New(nil)
	result := &ExtractionResult{
		SessionID: "test-nil",
		Files: FilesSummary{
			Files:      []FileEdit{{Path: "a.go", EditCount: 1}},
			TotalEdits: 1,
		},
	}

	err := ext.Store(context.Background(), result)
	if err != nil {
		t.Errorf("Store with nil VectorStore should return nil, got: %v", err)
	}
}

func TestStore_NilResult(t *testing.T) {
	ext := New(nil)
	err := ext.Store(context.Background(), nil)
	if err != nil {
		t.Errorf("Store with nil result should return nil, got: %v", err)
	}
}

// --- Memory Formatter Tests ---

func TestFormatFileMemory(t *testing.T) {
	result := &ExtractionResult{
		Files: FilesSummary{
			Files: []FileEdit{
				{Path: "auth.go", EditCount: 3, WriteCount: 0},
				{Path: "mw.go", EditCount: 0, WriteCount: 1},
			},
		},
	}
	text := formatFileMemory(result)
	if text == "" {
		t.Error("Expected non-empty file memory text")
	}
	if !contains(text, "auth.go") || !contains(text, "mw.go") {
		t.Errorf("Text missing file names: %q", text)
	}
}

func TestFormatErrorMemory(t *testing.T) {
	e := ErrorEncounter{
		ErrorType: "build",
		FilePath:  "main.go",
		Message:   "undefined variable",
		Resolved:  true,
	}
	text := formatErrorMemory(e)
	if !contains(text, "Build error") {
		t.Errorf("Expected 'Build error' in text: %q", text)
	}
	if !contains(text, "Resolved") {
		t.Errorf("Expected 'Resolved' in text: %q", text)
	}
}

func TestFormatOutcomeMemory(t *testing.T) {
	result := &ExtractionResult{
		Outcome: OutcomeSummary{Score: 0.82, Signals: []string{"positive_keywords"}},
	}
	text := formatOutcomeMemory(result)
	if !contains(text, "positive") {
		t.Errorf("Expected 'positive' in text: %q", text)
	}
	if !contains(text, "0.82") {
		t.Errorf("Expected score in text: %q", text)
	}
}

func TestFormatCommandMemory(t *testing.T) {
	result := &ExtractionResult{
		Commands: CommandsSummary{
			Commands: []CommandRun{
				{Pattern: "go test ./..."},
				{Pattern: "go test ./...", IsRetry: true},
				{Pattern: "go build"},
			},
		},
	}
	text := formatCommandMemory(result)
	if !contains(text, "Commands:") {
		t.Errorf("Expected 'Commands:' prefix in text: %q", text)
	}
}

// helper
func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
