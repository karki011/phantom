// Author: Subash Karki
package extractor

import (
	"math"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// --- FileEditAccumulator ---

// FileEditAccumulator tracks file-level edit and write operations.
type FileEditAccumulator struct {
	edits  map[string]*FileEdit
	total  int
}

// NewFileEditAccumulator creates a new FileEditAccumulator.
func NewFileEditAccumulator() *FileEditAccumulator {
	return &FileEditAccumulator{edits: make(map[string]*FileEdit)}
}

// Process examines a single event for file edit/write operations.
func (a *FileEditAccumulator) Process(event stream.Event, _ int) {
	if event.Type != stream.EventToolUse {
		return
	}
	if event.FilePath == "" {
		return
	}

	if !editToolNames[event.ToolName] {
		return
	}

	fe, ok := a.edits[event.FilePath]
	if !ok {
		fe = &FileEdit{Path: event.FilePath}
		a.edits[event.FilePath] = fe
	}

	if event.ToolName == "Write" {
		fe.WriteCount++
	} else {
		fe.EditCount++
	}
	a.total++
}

// Summarize returns the aggregated file edit summary.
func (a *FileEditAccumulator) Summarize() FilesSummary {
	files := make([]FileEdit, 0, len(a.edits))
	for _, fe := range a.edits {
		files = append(files, *fe)
	}
	return FilesSummary{Files: files, TotalEdits: a.total}
}

// --- ErrorAccumulator ---

// ErrorAccumulator tracks errors and their resolution status.
type ErrorAccumulator struct {
	errors       []ErrorEncounter
	lastFilePath string // file path from the most recent tool_use
}

// NewErrorAccumulator creates a new ErrorAccumulator.
func NewErrorAccumulator() *ErrorAccumulator {
	return &ErrorAccumulator{}
}

// Process examines a single event for error signals.
func (a *ErrorAccumulator) Process(event stream.Event, index int) {
	// Track the file path from tool_use events for context.
	if event.Type == stream.EventToolUse && event.FilePath != "" {
		a.lastFilePath = event.FilePath
	}

	// Only detect errors from tool_result or error events.
	if event.Type == stream.EventToolResult && (event.IsError || classifyError(event.Content) != "") {
		errType := classifyError(event.Content)
		if errType == "" {
			errType = "runtime" // default for IsError with no pattern match
		}
		a.errors = append(a.errors, ErrorEncounter{
			ErrorType: errType,
			FilePath:  a.lastFilePath,
			Message:   truncateMessage(event.Content, 200),
			Resolved:  false,
			TurnIndex: index,
		})
		return
	}

	if event.Type == stream.EventError {
		errType := classifyError(event.Content)
		if errType == "" {
			errType = "runtime"
		}
		a.errors = append(a.errors, ErrorEncounter{
			ErrorType: errType,
			FilePath:  a.lastFilePath,
			Message:   truncateMessage(event.Content, 200),
			Resolved:  false,
			TurnIndex: index,
		})
		return
	}

	// Check for resolution: a successful tool_result for a file that had errors.
	if event.Type == stream.EventToolResult && !event.IsError {
		for i := range a.errors {
			if !a.errors[i].Resolved && a.errors[i].FilePath != "" && a.errors[i].FilePath == a.lastFilePath {
				a.errors[i].Resolved = true
			}
		}
	}
}

// Summarize returns the aggregated error summary.
func (a *ErrorAccumulator) Summarize() ErrorsSummary {
	resolved := 0
	for _, e := range a.errors {
		if e.Resolved {
			resolved++
		}
	}
	return ErrorsSummary{
		Errors:   a.errors,
		Resolved: resolved,
		Total:    len(a.errors),
	}
}

// --- SatisfactionAccumulator ---

// SatisfactionAccumulator infers user satisfaction from keyword signals in user messages.
type SatisfactionAccumulator struct {
	weightedPositive float64
	weightedNegative float64
	messageCount     int
}

// NewSatisfactionAccumulator creates a new SatisfactionAccumulator.
func NewSatisfactionAccumulator() *SatisfactionAccumulator {
	return &SatisfactionAccumulator{}
}

// Process examines a single event for satisfaction signals.
func (a *SatisfactionAccumulator) Process(event stream.Event, _ int) {
	if event.Type != stream.EventUser {
		return
	}
	a.messageCount++

	content := strings.ToLower(event.Content)
	// Recency weight: later messages count more.
	weight := 1.0 + float64(a.messageCount)*0.1

	for _, kw := range positiveSignals {
		if strings.Contains(content, kw) {
			a.weightedPositive += weight
		}
	}
	for _, kw := range negativeSignals {
		if strings.Contains(content, kw) {
			a.weightedNegative += weight
		}
	}
}

// Summarize returns the outcome score and detected signals.
func (a *SatisfactionAccumulator) Summarize() OutcomeSummary {
	if a.messageCount == 0 {
		return OutcomeSummary{Score: 0.5}
	}

	// Score = (positive - negative + 1) / 2, clamped to [0, 1].
	raw := (a.weightedPositive - a.weightedNegative + 1.0) / 2.0
	score := math.Max(0.0, math.Min(1.0, raw))

	var signals []string
	if a.weightedPositive > 0 {
		signals = append(signals, "positive_keywords")
	}
	if a.weightedNegative > 0 {
		signals = append(signals, "negative_keywords")
	}

	return OutcomeSummary{Score: score, Signals: signals}
}

// --- CommandAccumulator ---

// CommandAccumulator tracks command executions, retries, and sanitization.
type CommandAccumulator struct {
	commands     []CommandRun
	recentByPat  map[string]int // pattern -> last turn index
}

// NewCommandAccumulator creates a new CommandAccumulator.
func NewCommandAccumulator() *CommandAccumulator {
	return &CommandAccumulator{recentByPat: make(map[string]int)}
}

// Process examines a single event for command execution.
func (a *CommandAccumulator) Process(event stream.Event, index int) {
	if event.Type != stream.EventToolUse {
		return
	}
	if !bashToolNames[event.ToolName] {
		return
	}

	// The command text is in ToolInput (raw JSON) or Content.
	// ToolInput for Bash is JSON like {"command":"..."}, but we use Content as fallback.
	cmdText := event.Content
	if cmdText == "" {
		cmdText = event.ToolInput
	}
	if cmdText == "" {
		return
	}

	sanitized := sanitizeCommand(cmdText)
	pattern := extractCommandPattern(sanitized)
	if pattern == "" {
		return
	}

	// Detect retry: same pattern within last 3 turns.
	isRetry := false
	if lastIdx, ok := a.recentByPat[pattern]; ok && (index-lastIdx) <= 3 {
		isRetry = true
	}
	a.recentByPat[pattern] = index

	a.commands = append(a.commands, CommandRun{
		Pattern:   pattern,
		IsRetry:   isRetry,
		TurnIndex: index,
	})
}

// Summarize returns the aggregated command summary.
func (a *CommandAccumulator) Summarize() CommandsSummary {
	uniquePatterns := make(map[string]bool)
	retryCount := 0
	for _, cmd := range a.commands {
		uniquePatterns[cmd.Pattern] = true
		if cmd.IsRetry {
			retryCount++
		}
	}
	return CommandsSummary{
		Commands:       a.commands,
		UniquePatterns: len(uniquePatterns),
		RetryCount:     retryCount,
	}
}

// --- ProfileAccumulator ---

// ProfileAccumulator classifies the session by analyzing event distribution.
type ProfileAccumulator struct {
	turnCount     int
	toolCallCount int
	editCount     int
	bashCount     int
	readCount     int
	errorCount    int
	firstTS       int64
	lastTS        int64
}

// NewProfileAccumulator creates a new ProfileAccumulator.
func NewProfileAccumulator() *ProfileAccumulator {
	return &ProfileAccumulator{}
}

// Process examines a single event to build session profile statistics.
func (a *ProfileAccumulator) Process(event stream.Event, _ int) {
	// Track timestamps for duration.
	if event.Timestamp > 0 {
		if a.firstTS == 0 || event.Timestamp < a.firstTS {
			a.firstTS = event.Timestamp
		}
		if event.Timestamp > a.lastTS {
			a.lastTS = event.Timestamp
		}
	}

	switch event.Type {
	case stream.EventUser:
		a.turnCount++
	case stream.EventToolUse:
		a.toolCallCount++
		if editToolNames[event.ToolName] {
			a.editCount++
		} else if bashToolNames[event.ToolName] {
			a.bashCount++
		} else if event.ToolName == "Read" {
			a.readCount++
		}
	case stream.EventError:
		a.errorCount++
	case stream.EventToolResult:
		if event.IsError {
			a.errorCount++
		}
	}
}

// Summarize returns the classified session profile.
func (a *ProfileAccumulator) Summarize() SessionProfile {
	durationMins := 0
	if a.lastTS > a.firstTS {
		durationMins = int((a.lastTS - a.firstTS) / 60)
	}

	profileType := a.classify()

	return SessionProfile{
		Type:          profileType,
		TurnCount:     a.turnCount,
		ToolCallCount: a.toolCallCount,
		DurationMins:  durationMins,
	}
}

// classify determines the session profile type from accumulated stats.
func (a *ProfileAccumulator) classify() SessionProfileType {
	total := a.toolCallCount
	if total == 0 && a.turnCount == 0 {
		return ProfileUnknown
	}

	// Quick fix: very short sessions.
	if a.turnCount <= 5 && a.editCount > 0 && a.editCount <= 5 {
		return ProfileQuickFix
	}

	// Deployment: high bash + git commands.
	if total > 0 && float64(a.bashCount)/float64(total) > 0.6 {
		return ProfileDeployment
	}

	// Debugging: error→fix cycles.
	if a.errorCount >= 2 && a.editCount >= 2 {
		return ProfileDebugging
	}

	// Exploration: mostly reads, few edits.
	if total > 0 && a.readCount > 0 && float64(a.readCount)/float64(total) > 0.5 {
		return ProfileExploration
	}

	// Deep refactor: many files, many edits.
	if a.editCount >= 5 {
		return ProfileDeepRefactor
	}

	return ProfileUnknown
}
