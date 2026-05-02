// Author: Subash Karki
package extractor

import "time"

// ExtractionResult holds all structured signals extracted from a session's events.
type ExtractionResult struct {
	SessionID   string
	Files       FilesSummary
	Errors      ErrorsSummary
	Commands    CommandsSummary
	Outcome     OutcomeSummary
	Profile     SessionProfile
	TurnCount   int
	ExtractedAt time.Time
}

// FileEdit tracks edit/write operations on a single file.
type FileEdit struct {
	Path       string
	EditCount  int
	WriteCount int
}

// FilesSummary aggregates all file-level edits in a session.
type FilesSummary struct {
	Files      []FileEdit
	TotalEdits int
}

// ErrorEncounter records a single error detected during the session.
type ErrorEncounter struct {
	ErrorType string // "build", "runtime", "test", "panic", "import"
	FilePath  string
	Message   string // truncated to 200 chars
	Resolved  bool
	TurnIndex int
}

// ErrorsSummary aggregates all errors detected in a session.
type ErrorsSummary struct {
	Errors   []ErrorEncounter
	Resolved int
	Total    int
}

// CommandRun records a single command execution.
type CommandRun struct {
	Pattern   string // sanitized command pattern
	ExitCode  int
	IsRetry   bool
	TurnIndex int
}

// CommandsSummary aggregates all command executions in a session.
type CommandsSummary struct {
	Commands       []CommandRun
	UniquePatterns int
	RetryCount     int
}

// OutcomeSummary captures the inferred user satisfaction score.
type OutcomeSummary struct {
	Score   float64  // 0.0-1.0
	Signals []string // detected signal keywords
}

// SessionProfileType classifies the overall nature of a session.
type SessionProfileType string

const (
	ProfileQuickFix     SessionProfileType = "quick_fix"
	ProfileDeepRefactor SessionProfileType = "deep_refactor"
	ProfileExploration  SessionProfileType = "exploration"
	ProfileDebugging    SessionProfileType = "debugging"
	ProfileDeployment   SessionProfileType = "deployment"
	ProfileUnknown      SessionProfileType = "unknown"
)

// SessionProfile captures high-level session characteristics used for classification.
type SessionProfile struct {
	Type          SessionProfileType
	TurnCount     int
	ToolCallCount int
	DurationMins  int
}
