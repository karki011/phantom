// Author: Subash Karki
package journal

import (
	"strings"
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/extractor"
)

func TestExtractionToJournalEntry_Nil(t *testing.T) {
	got := ExtractionToJournalEntry(nil)
	if got != "" {
		t.Errorf("expected empty string for nil, got %q", got)
	}
}

func TestExtractionToJournalEntry_WithName(t *testing.T) {
	result := &extractor.ExtractionResult{
		SessionID: "abc-123",
		Files: extractor.FilesSummary{
			Files: []extractor.FileEdit{
				{Path: "/src/app/main.go", EditCount: 5, WriteCount: 2},
				{Path: "/src/app/utils.go", EditCount: 3, WriteCount: 1},
			},
			TotalEdits: 8,
		},
		Errors: extractor.ErrorsSummary{
			Errors: []extractor.ErrorEncounter{
				{ErrorType: "build", FilePath: "/src/app/main.go", Message: "undefined: foo", Resolved: true, TurnIndex: 2},
				{ErrorType: "test", FilePath: "/src/app/utils_test.go", Message: "assertion failed", Resolved: false, TurnIndex: 5},
			},
			Resolved: 1,
			Total:    2,
		},
		Commands: extractor.CommandsSummary{
			Commands: []extractor.CommandRun{
				{Pattern: "go build", ExitCode: 0, TurnIndex: 1},
				{Pattern: "go build", ExitCode: 1, TurnIndex: 3, IsRetry: true},
				{Pattern: "go test", ExitCode: 0, TurnIndex: 6},
			},
			UniquePatterns: 2,
			RetryCount:     1,
		},
		Outcome: extractor.OutcomeSummary{
			Score:   0.85,
			Signals: []string{"completed", "thanked"},
		},
		Profile: extractor.SessionProfile{
			Type:          extractor.ProfileDebugging,
			TurnCount:     10,
			ToolCallCount: 25,
			DurationMins:  15,
		},
		TurnCount:   10,
		ExtractedAt: time.Now(),
	}

	// With session name
	got := ExtractionToJournalEntry(result, "Charizard")

	checks := []string{
		"### Session: Charizard (debugging, 15 min)",
		"**Files edited:**",
		"`app/main.go` — 7 edits",    // 5 edit + 2 write
		"`app/utils.go` — 4 edits",   // 3 edit + 1 write
		"**Commands:**",
		"`go build`",
		"ran 2x",
		"retry after fix",
		"**Errors resolved:**",
		"Build error in `app/main.go`",
		"→ fixed",
		"→ unresolved",
		"**Outcome:** Positive",
		"completed, thanked",
	}
	for _, check := range checks {
		if !strings.Contains(got, check) {
			t.Errorf("expected output to contain %q, got:\n%s", check, got)
		}
	}
}

func TestExtractionToJournalEntry_WithoutName(t *testing.T) {
	result := &extractor.ExtractionResult{
		SessionID: "abc-123",
		Profile: extractor.SessionProfile{
			Type:         extractor.ProfileQuickFix,
			DurationMins: 5,
		},
		Outcome: extractor.OutcomeSummary{Score: 0.9},
	}

	got := ExtractionToJournalEntry(result)
	if !strings.Contains(got, "### Session: abc-123 (quick fix, 5 min)") {
		t.Errorf("expected session ID in header, got:\n%s", got)
	}
}

func TestDailyExtractionDigest_Empty(t *testing.T) {
	got := DailyExtractionDigest(nil)
	if got != "" {
		t.Errorf("expected empty for nil, got %q", got)
	}

	got = DailyExtractionDigest([]*extractor.ExtractionResult{})
	if got != "" {
		t.Errorf("expected empty for empty slice, got %q", got)
	}

	// All nil entries should also produce empty
	got = DailyExtractionDigest([]*extractor.ExtractionResult{nil, nil})
	if got != "" {
		t.Errorf("expected empty for all-nil slice, got %q", got)
	}
}

func TestDailyExtractionDigest_MultiSession(t *testing.T) {
	results := []*extractor.ExtractionResult{
		{
			SessionID: "s1",
			Files: extractor.FilesSummary{
				Files:      []extractor.FileEdit{{Path: "/a.go", EditCount: 3}},
				TotalEdits: 3,
			},
			Errors: extractor.ErrorsSummary{Total: 2, Resolved: 2},
			Profile: extractor.SessionProfile{
				Type:          extractor.ProfileQuickFix,
				DurationMins:  10,
				ToolCallCount: 5,
			},
			Commands: extractor.CommandsSummary{
				Commands:       []extractor.CommandRun{{Pattern: "go build"}},
				UniquePatterns: 1,
			},
			Outcome: extractor.OutcomeSummary{Score: 0.9},
		},
		{
			SessionID: "s2",
			Files: extractor.FilesSummary{
				Files:      []extractor.FileEdit{{Path: "/a.go", EditCount: 2}, {Path: "/b.go", EditCount: 1}},
				TotalEdits: 3,
			},
			Errors: extractor.ErrorsSummary{Total: 1, Resolved: 0},
			Profile: extractor.SessionProfile{
				Type:          extractor.ProfileDebugging,
				DurationMins:  25,
				ToolCallCount: 15,
			},
			Commands: extractor.CommandsSummary{
				Commands:       []extractor.CommandRun{{Pattern: "go test"}, {Pattern: "go build"}},
				UniquePatterns: 2,
				RetryCount:     1,
			},
			Outcome: extractor.OutcomeSummary{Score: 0.5},
		},
		nil, // nil should be skipped gracefully
	}

	got := DailyExtractionDigest(results)

	checks := []string{
		"**Session Intelligence**",
		"**2 sessions** (35m)",        // 10 + 25 = 35 mins, only 2 valid
		"quick fix",                   // profile type
		"debugging",                   // profile type
		"Most edited:",                // most-edited header
		"`a.go` (5 edits)",            // 3 + 2 = 5
		"Error resolution rate: 2/3 (66%)", // 2 of 3 resolved
		"Commands: 20 tool calls",     // 5 + 15 = 20
		"`go build`",                  // top command
		"Average outcome:",
	}
	for _, check := range checks {
		if !strings.Contains(got, check) {
			t.Errorf("expected output to contain %q, got:\n%s", check, got)
		}
	}
}

func TestShortenPath(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", ""},
		{"/src/app/main.go", "app/main.go"},
		{"main.go", "main.go"},
		{"/main.go", "main.go"},
		{"/a/b/c/d.go", "c/d.go"},
	}
	for _, tt := range tests {
		got := shortenPath(tt.input)
		if got != tt.want {
			t.Errorf("shortenPath(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestOutcomeToLabel(t *testing.T) {
	tests := []struct {
		score float64
		want  string
	}{
		{0.9, "positive"},
		{0.8, "positive"},
		{0.5, "neutral"},
		{0.4, "neutral"},
		{0.3, "negative"},
		{0.0, "negative"},
	}
	for _, tt := range tests {
		got := outcomeToLabel(tt.score)
		if got != tt.want {
			t.Errorf("outcomeToLabel(%v) = %q, want %q", tt.score, got, tt.want)
		}
	}
}

func TestFormatProfileType(t *testing.T) {
	tests := []struct {
		input extractor.SessionProfileType
		want  string
	}{
		{extractor.ProfileQuickFix, "quick fix"},
		{extractor.ProfileDeepRefactor, "deep refactor"},
		{extractor.ProfileExploration, "exploration"},
		{extractor.ProfileDebugging, "debugging"},
		{extractor.ProfileDeployment, "deployment"},
		{extractor.ProfileUnknown, "session"},
		{"something_else", "session"},
	}
	for _, tt := range tests {
		got := formatProfileType(tt.input)
		if got != tt.want {
			t.Errorf("formatProfileType(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestFormatDurationMins(t *testing.T) {
	tests := []struct {
		mins int
		want string
	}{
		{0, "0m"},
		{-1, "0m"},
		{5, "5m"},
		{60, "1h"},
		{90, "1h 30m"},
		{135, "2h 15m"},
	}
	for _, tt := range tests {
		got := formatDurationMins(tt.mins)
		if got != tt.want {
			t.Errorf("formatDurationMins(%d) = %q, want %q", tt.mins, got, tt.want)
		}
	}
}

func TestAppendExtractionWorkLog_NilSafety(t *testing.T) {
	// Should not panic on nil inputs
	AppendExtractionWorkLog(nil, nil)
	AppendExtractionWorkLog(&Service{dir: t.TempDir()}, nil)
	AppendExtractionWorkLog(nil, &extractor.ExtractionResult{})
}

func TestAppendExtractionWorkLog_WritesLine(t *testing.T) {
	dir := t.TempDir()
	svc := NewService(dir)

	result := &extractor.ExtractionResult{
		SessionID: "test-123",
		Files: extractor.FilesSummary{
			Files:      []extractor.FileEdit{{Path: "/x.go", EditCount: 1}},
			TotalEdits: 1,
		},
		Profile: extractor.SessionProfile{Type: extractor.ProfileQuickFix},
		Outcome: extractor.OutcomeSummary{Score: 0.9},
	}

	AppendExtractionWorkLog(svc, result, "Pikachu")

	today := time.Now().Format("2006-01-02")
	entry := svc.GetEntry(today)
	if len(entry.WorkLog) != 1 {
		t.Fatalf("expected 1 work log line, got %d", len(entry.WorkLog))
	}
	line := entry.WorkLog[0]
	if !strings.Contains(line, "[quick fix]") {
		t.Errorf("expected profile tag, got %q", line)
	}
	if !strings.Contains(line, "Pikachu") {
		t.Errorf("expected session name, got %q", line)
	}
}
