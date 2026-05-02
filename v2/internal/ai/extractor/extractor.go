// Author: Subash Karki
package extractor

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/embedding"
	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// TTLs for different memory types stored in the VectorStore.
const (
	ttlSessionFiles    = 90 * 24 * time.Hour  // 90 days
	ttlSessionErrors   = 180 * 24 * time.Hour // 180 days
	ttlSessionOutcome  = 90 * 24 * time.Hour  // 90 days
	ttlSessionCommands = 60 * 24 * time.Hour  // 60 days
)

// Memory type keys for VectorStore.
const (
	memTypeSessionFiles    = "session_files"
	memTypeSessionErrors   = "session_errors"
	memTypeSessionOutcome  = "session_outcome"
	memTypeSessionCommands = "session_commands"
)

// MemoryExtractor processes session events into structured signals
// and persists them as vector-embedded memories.
type MemoryExtractor struct {
	vectorStore *embedding.VectorStore
	logger      *slog.Logger
}

// New creates a MemoryExtractor. vectorStore may be nil (Store becomes a no-op).
func New(vs *embedding.VectorStore) *MemoryExtractor {
	return &MemoryExtractor{
		vectorStore: vs,
		logger:      slog.Default().With("component", "memory_extractor"),
	}
}

// Extract processes events and returns structured signals.
// It runs all accumulators in a single pass over the event slice.
func (me *MemoryExtractor) Extract(sessionID string, events []stream.Event) *ExtractionResult {
	fileAcc := NewFileEditAccumulator()
	errorAcc := NewErrorAccumulator()
	satisfactionAcc := NewSatisfactionAccumulator()
	commandAcc := NewCommandAccumulator()
	profileAcc := NewProfileAccumulator()

	typeCounts := make(map[string]int)
	for i, ev := range events {
		typeCounts[string(ev.Type)]++
		fileAcc.Process(ev, i)
		errorAcc.Process(ev, i)
		satisfactionAcc.Process(ev, i)
		commandAcc.Process(ev, i)
		profileAcc.Process(ev, i)
	}

	result := &ExtractionResult{
		SessionID:   sessionID,
		Files:       fileAcc.Summarize(),
		Errors:      errorAcc.Summarize(),
		Commands:    commandAcc.Summarize(),
		Outcome:     satisfactionAcc.Summarize(),
		Profile:     profileAcc.Summarize(),
		TurnCount:   profileAcc.turnCount,
		ExtractedAt: time.Now(),
	}

	me.logger.Info("extraction complete",
		"session_id", sessionID,
		"events_total", len(events),
		"event_types", typeCounts,
		"files", len(result.Files.Files),
		"errors", result.Errors.Total,
		"commands", len(result.Commands.Commands),
		"turns", result.TurnCount,
		"tool_calls", profileAcc.toolCallCount,
		"outcome_score", result.Outcome.Score,
		"profile", result.Profile.Type,
	)

	return result
}

// Store persists the extraction result into VectorStore with TTLs.
// Returns nil if the VectorStore is nil (graceful no-op).
func (me *MemoryExtractor) Store(ctx context.Context, result *ExtractionResult) error {
	if me.vectorStore == nil {
		return nil
	}
	if result == nil {
		return nil
	}

	_ = ctx // reserved for future cancellation support

	var errs []string

	// Store file edit memories.
	if len(result.Files.Files) > 0 {
		text := formatFileMemory(result)
		sourceID := result.SessionID + ":files"
		if err := me.vectorStore.StoreWithTTL(memTypeSessionFiles, sourceID, text, ttlSessionFiles); err != nil {
			errs = append(errs, fmt.Sprintf("files: %v", err))
		}
	}

	// Store error memories (one per error for granularity).
	for i, e := range result.Errors.Errors {
		text := formatErrorMemory(e)
		sourceID := fmt.Sprintf("%s:error:%d", result.SessionID, i)
		if err := me.vectorStore.StoreWithTTL(memTypeSessionErrors, sourceID, text, ttlSessionErrors); err != nil {
			errs = append(errs, fmt.Sprintf("error[%d]: %v", i, err))
		}
	}

	// Store outcome memory.
	if result.Outcome.Score > 0 {
		text := formatOutcomeMemory(result)
		sourceID := result.SessionID + ":outcome"
		if err := me.vectorStore.StoreWithTTL(memTypeSessionOutcome, sourceID, text, ttlSessionOutcome); err != nil {
			errs = append(errs, fmt.Sprintf("outcome: %v", err))
		}
	}

	// Store command memories.
	if len(result.Commands.Commands) > 0 {
		text := formatCommandMemory(result)
		sourceID := result.SessionID + ":commands"
		if err := me.vectorStore.StoreWithTTL(memTypeSessionCommands, sourceID, text, ttlSessionCommands); err != nil {
			errs = append(errs, fmt.Sprintf("commands: %v", err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("store extraction: %s", strings.Join(errs, "; "))
	}
	return nil
}

// --- Memory text formatters ---

// formatFileMemory produces a natural-language summary of files edited.
func formatFileMemory(result *ExtractionResult) string {
	var parts []string
	for _, f := range result.Files.Files {
		total := f.EditCount + f.WriteCount
		parts = append(parts, fmt.Sprintf("%s (%d edits)", f.Path, total))
	}
	return fmt.Sprintf("Session edited %s", strings.Join(parts, ", "))
}

// formatErrorMemory produces a natural-language description of a single error.
func formatErrorMemory(e ErrorEncounter) string {
	resolved := "Unresolved"
	if e.Resolved {
		resolved = "Resolved"
	}
	file := e.FilePath
	if file == "" {
		file = "unknown file"
	}
	return fmt.Sprintf("%s error in %s: %s. %s.", capitalizeFirst(e.ErrorType), file, e.Message, resolved)
}

// formatOutcomeMemory produces a natural-language summary of user satisfaction.
func formatOutcomeMemory(result *ExtractionResult) string {
	sentiment := "neutral"
	if result.Outcome.Score >= 0.7 {
		sentiment = "positive"
	} else if result.Outcome.Score <= 0.3 {
		sentiment = "negative"
	}
	signalStr := ""
	if len(result.Outcome.Signals) > 0 {
		signalStr = fmt.Sprintf(" Signals: %s.", strings.Join(result.Outcome.Signals, ", "))
	}
	return fmt.Sprintf("Session outcome: %s (%.2f).%s", sentiment, result.Outcome.Score, signalStr)
}

// formatCommandMemory produces a natural-language summary of commands executed.
func formatCommandMemory(result *ExtractionResult) string {
	patternCounts := make(map[string]int)
	for _, cmd := range result.Commands.Commands {
		patternCounts[cmd.Pattern]++
	}

	var parts []string
	for pat, count := range patternCounts {
		if count > 1 {
			parts = append(parts, fmt.Sprintf("%s (%dx)", pat, count))
		} else {
			parts = append(parts, pat)
		}
	}
	return fmt.Sprintf("Commands: %s", strings.Join(parts, ", "))
}

// capitalizeFirst uppercases the first letter of s. Replaces deprecated strings.Title.
func capitalizeFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
