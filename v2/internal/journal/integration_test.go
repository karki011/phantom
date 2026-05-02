// Author: Subash Karki
//
// Integration tests for journal extraction bridge: ExtractionToJournalEntry
// and DailyExtractionDigest with realistic extraction results.
package journal

import (
	"strings"
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/extractor"
)

// TestJournalExtractionBridge tests that ExtractionToJournalEntry produces
// readable, structured markdown from extraction results.
func TestJournalExtractionBridge(t *testing.T) {
	t.Parallel()

	result := &extractor.ExtractionResult{
		SessionID: "session-abc",
		Files: extractor.FilesSummary{
			Files: []extractor.FileEdit{
				{Path: "/repo/src/auth.go", EditCount: 5, WriteCount: 1},
				{Path: "/repo/src/utils.go", EditCount: 2, WriteCount: 0},
			},
			TotalEdits: 8,
		},
		Errors: extractor.ErrorsSummary{
			Errors: []extractor.ErrorEncounter{
				{ErrorType: "build", FilePath: "/repo/src/auth.go", Message: "undefined: validateToken", Resolved: true, TurnIndex: 3},
				{ErrorType: "test", FilePath: "/repo/src/auth_test.go", Message: "FAIL TestAuth", Resolved: true, TurnIndex: 7},
			},
			Resolved: 2,
			Total:    2,
		},
		Commands: extractor.CommandsSummary{
			Commands: []extractor.CommandRun{
				{Pattern: "go build", TurnIndex: 2},
				{Pattern: "go test", TurnIndex: 4, IsRetry: false},
				{Pattern: "go test", TurnIndex: 8, IsRetry: true},
			},
			UniquePatterns: 2,
			RetryCount:     1,
		},
		Outcome: extractor.OutcomeSummary{
			Score:   0.85,
			Signals: []string{"positive_keywords"},
		},
		Profile: extractor.SessionProfile{
			Type:          extractor.ProfileDebugging,
			TurnCount:     12,
			ToolCallCount: 20,
			DurationMins:  18,
		},
		TurnCount:   12,
		ExtractedAt: time.Now(),
	}

	// With session name "Charizard".
	got := ExtractionToJournalEntry(result, "Charizard")

	// Verify output contains key elements.
	checks := []struct {
		desc  string
		want  string
	}{
		{"session header with name", "### Session: Charizard"},
		{"profile type", "debugging"},
		{"duration", "18 min"},
		{"files edited header", "**Files edited:**"},
		{"auth.go filename", "auth.go"},
		{"auth.go edit count", "6 edits"},  // 5 edit + 1 write
		{"utils.go filename", "utils.go"},
		{"commands header", "**Commands:**"},
		{"go build command", "go build"},
		{"go test command", "go test"},
		{"errors header", "**Errors resolved:**"},
		{"build error", "Build error"},
		{"resolved status", "fixed"},
		{"outcome header", "**Outcome:**"},
		{"positive outcome", "Positive"},
	}
	for _, c := range checks {
		if !strings.Contains(got, c.want) {
			t.Errorf("%s: expected output to contain %q, got:\n%s", c.desc, c.want, got)
		}
	}
}

// TestJournalExtractionBridge_FallbackToSessionID tests that the session ID
// is used when no name is provided.
func TestJournalExtractionBridge_FallbackToSessionID(t *testing.T) {
	t.Parallel()

	result := &extractor.ExtractionResult{
		SessionID: "session-xyz-123",
		Profile: extractor.SessionProfile{
			Type:         extractor.ProfileQuickFix,
			DurationMins: 3,
		},
		Outcome: extractor.OutcomeSummary{Score: 0.5},
	}

	got := ExtractionToJournalEntry(result)
	if !strings.Contains(got, "### Session: session-xyz-123") {
		t.Errorf("expected session ID as fallback, got:\n%s", got)
	}
}

// TestDailyExtractionDigest_AggregatesMultipleSessions tests the daily digest
// with 3 extraction results.
func TestDailyExtractionDigest_AggregatesMultipleSessions(t *testing.T) {
	t.Parallel()

	results := []*extractor.ExtractionResult{
		{
			SessionID: "s1",
			Files: extractor.FilesSummary{
				Files: []extractor.FileEdit{
					{Path: "/repo/auth.go", EditCount: 4, WriteCount: 1},
					{Path: "/repo/config.go", EditCount: 2},
				},
				TotalEdits: 7,
			},
			Errors:  extractor.ErrorsSummary{Total: 3, Resolved: 2},
			Profile: extractor.SessionProfile{Type: extractor.ProfileDebugging, DurationMins: 30, ToolCallCount: 15},
			Commands: extractor.CommandsSummary{
				Commands:       []extractor.CommandRun{{Pattern: "go test"}, {Pattern: "go build"}},
				UniquePatterns: 2,
			},
			Outcome: extractor.OutcomeSummary{Score: 0.9},
		},
		{
			SessionID: "s2",
			Files: extractor.FilesSummary{
				Files:      []extractor.FileEdit{{Path: "/repo/auth.go", EditCount: 3}},
				TotalEdits: 3,
			},
			Errors:  extractor.ErrorsSummary{Total: 1, Resolved: 1},
			Profile: extractor.SessionProfile{Type: extractor.ProfileQuickFix, DurationMins: 5, ToolCallCount: 8},
			Commands: extractor.CommandsSummary{
				Commands: []extractor.CommandRun{{Pattern: "go test"}},
			},
			Outcome: extractor.OutcomeSummary{Score: 0.8},
		},
		{
			SessionID: "s3",
			Files: extractor.FilesSummary{
				Files:      []extractor.FileEdit{{Path: "/repo/deploy.sh", EditCount: 1}},
				TotalEdits: 1,
			},
			Errors:  extractor.ErrorsSummary{Total: 0, Resolved: 0},
			Profile: extractor.SessionProfile{Type: extractor.ProfileDeployment, DurationMins: 10, ToolCallCount: 5},
			Commands: extractor.CommandsSummary{
				Commands: []extractor.CommandRun{{Pattern: "kubectl apply"}},
			},
			Outcome: extractor.OutcomeSummary{Score: 0.7},
		},
	}

	got := DailyExtractionDigest(results)

	// Verify aggregation.
	checks := []struct {
		desc string
		want string
	}{
		{"session intelligence header", "**Session Intelligence**"},
		{"session count", "**3 sessions**"},
		{"total duration", "45m"}, // 30 + 5 + 10
		{"debugging profile", "debugging"},
		{"quick fix profile", "quick fix"},
		{"deployment profile", "deployment"},
		{"most edited header", "Most edited:"},
		{"auth.go aggregated edits", "`repo/auth.go` (8 edits)"}, // 5 + 3 = 8, shortenPath returns repo/auth.go
		{"error resolution rate", "Error resolution rate: 3/4"}, // 3 of 4 resolved
		{"commands header", "Commands:"},
		{"tool call count", "28 tool calls"}, // 15 + 8 + 5
		{"average outcome", "Average outcome:"},
	}
	for _, c := range checks {
		if !strings.Contains(got, c.want) {
			t.Errorf("%s: expected output to contain %q, got:\n%s", c.desc, c.want, got)
		}
	}
}

// TestDailyExtractionDigest_NilFiltering tests that nil entries are skipped.
func TestDailyExtractionDigest_NilFiltering(t *testing.T) {
	t.Parallel()

	results := []*extractor.ExtractionResult{
		nil,
		{
			SessionID: "s1",
			Profile:   extractor.SessionProfile{Type: extractor.ProfileQuickFix, DurationMins: 5, ToolCallCount: 3},
			Outcome:   extractor.OutcomeSummary{Score: 0.8},
		},
		nil,
	}

	got := DailyExtractionDigest(results)
	if got == "" {
		t.Fatal("expected non-empty digest with 1 valid result among nils")
	}
	if !strings.Contains(got, "**1 session**") {
		t.Errorf("expected 1 session count, got:\n%s", got)
	}
}

// TestDailyExtractionDigest_AllNilReturnsEmpty tests that all-nil input
// produces empty output.
func TestDailyExtractionDigest_AllNilReturnsEmpty(t *testing.T) {
	t.Parallel()

	got := DailyExtractionDigest([]*extractor.ExtractionResult{nil, nil, nil})
	if got != "" {
		t.Errorf("expected empty string for all-nil, got %q", got)
	}
}
