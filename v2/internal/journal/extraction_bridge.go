// Author: Subash Karki
package journal

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/extractor"
)

// --------------------------------------------------------------------------
// ExtractionToJournalEntry — converts a single ExtractionResult into a
// work-log-ready markdown block that can be appended to the journal.
// --------------------------------------------------------------------------

// ExtractionToJournalEntry converts an extraction result into a structured
// markdown string suitable for appending to the work log. The output reads
// like a standup log entry — human-readable first, machine-parseable second.
//
// sessionName is optional; when non-empty it's used as the display name
// (e.g. "Charizard") instead of the raw session ID.
func ExtractionToJournalEntry(result *extractor.ExtractionResult, sessionName ...string) string {
	if result == nil {
		return ""
	}

	var lines []string

	// Session header — "### Session: Charizard (debugging, 25 min)"
	name := result.SessionID
	if len(sessionName) > 0 && sessionName[0] != "" {
		name = sessionName[0]
	}
	profileLabel := formatProfileType(result.Profile.Type)
	lines = append(lines, fmt.Sprintf("### Session: %s (%s, %d min)",
		name, profileLabel, result.Profile.DurationMins))
	lines = append(lines, "")

	// Files changed
	if len(result.Files.Files) > 0 {
		lines = append(lines, "**Files edited:**")
		top := topEditedFiles(result.Files.Files, 5)
		for _, f := range top {
			edits := f.EditCount + f.WriteCount
			lines = append(lines, fmt.Sprintf("- `%s` — %d edits", shortenPath(f.Path), edits))
		}
		if len(result.Files.Files) > 5 {
			lines = append(lines, fmt.Sprintf("- ...and %d more files", len(result.Files.Files)-5))
		}
		lines = append(lines, "")
	}

	// Commands run
	if len(result.Commands.Commands) > 0 {
		lines = append(lines, "**Commands:**")
		topCmds := topCommandPatterns(result.Commands.Commands, 5)
		for _, c := range topCmds {
			suffix := ""
			if c.count > 1 {
				suffix = fmt.Sprintf(" — ran %dx", c.count)
				if c.retryCount > 0 {
					suffix += " (retry after fix)"
				}
			}
			lines = append(lines, fmt.Sprintf("- `%s`%s", c.pattern, suffix))
		}
		lines = append(lines, "")
	}

	// Errors hit / resolved
	if result.Errors.Total > 0 {
		resolvedLabel := "Errors encountered"
		if result.Errors.Resolved > 0 {
			resolvedLabel = "Errors resolved"
		}
		lines = append(lines, fmt.Sprintf("**%s:**", resolvedLabel))
		shown := result.Errors.Errors
		if len(shown) > 5 {
			shown = shown[:5]
		}
		for _, e := range shown {
			status := "unresolved"
			if e.Resolved {
				status = "fixed"
			}
			file := shortenPath(e.FilePath)
			if file == "" {
				file = "unknown"
			}
			msg := e.Message
			if len(msg) > 120 {
				msg = msg[:120] + "..."
			}
			lines = append(lines, fmt.Sprintf("- %s error in `%s`: %s → %s",
				capitalizeFirstLetter(e.ErrorType), file, msg, status))
		}
		if len(result.Errors.Errors) > 5 {
			lines = append(lines, fmt.Sprintf("- ...and %d more", len(result.Errors.Errors)-5))
		}
		lines = append(lines, "")
	}

	// Outcome
	outcomeLabel := outcomeToLabel(result.Outcome.Score)
	signalNote := ""
	if len(result.Outcome.Signals) > 0 {
		signalNote = " — " + strings.Join(result.Outcome.Signals, ", ")
	}
	lines = append(lines, fmt.Sprintf("**Outcome:** %s%s",
		capitalizeFirstLetter(outcomeLabel), signalNote))

	return strings.Join(lines, "\n")
}

// --------------------------------------------------------------------------
// DailyExtractionDigest — aggregates multiple extraction results into a
// markdown section for the daily digest.
// --------------------------------------------------------------------------

// DailyExtractionDigest aggregates all sessions' extraction results into a
// daily summary section. Returns markdown text that can be appended to the
// existing morning brief or end-of-day recap. Returns "" if results is empty.
func DailyExtractionDigest(results []*extractor.ExtractionResult) string {
	// Filter nil entries
	var valid []*extractor.ExtractionResult
	for _, r := range results {
		if r != nil {
			valid = append(valid, r)
		}
	}
	if len(valid) == 0 {
		return ""
	}

	// Aggregate counters
	uniqueFiles := map[string]int{}   // path → total edits
	totalEdits := 0
	totalErrors := 0
	resolvedErrors := 0
	totalDurationMins := 0
	profileCounts := map[extractor.SessionProfileType]int{}
	cmdCounts := map[string]int{}
	totalToolCalls := 0
	totalRetries := 0
	var outcomeSum float64

	for _, r := range valid {
		// Files
		for _, f := range r.Files.Files {
			uniqueFiles[f.Path] += f.EditCount + f.WriteCount
		}
		totalEdits += r.Files.TotalEdits

		// Errors
		totalErrors += r.Errors.Total
		resolvedErrors += r.Errors.Resolved

		// Profile
		profileCounts[r.Profile.Type]++
		totalDurationMins += r.Profile.DurationMins
		totalToolCalls += r.Profile.ToolCallCount

		// Commands
		for _, c := range r.Commands.Commands {
			cmdCounts[c.Pattern]++
		}
		totalRetries += r.Commands.RetryCount

		// Outcome
		outcomeSum += r.Outcome.Score
	}

	var lines []string
	lines = append(lines, "**Session Intelligence**")

	// Session breakdown — "6 sessions (2h 15m total): 3 quick fixes, 1 deep refactor, 2 debugging"
	if len(profileCounts) > 0 {
		var parts []string
		sorted := sortProfileCounts(profileCounts)
		for _, pe := range sorted {
			parts = append(parts, fmt.Sprintf("%d %s", pe.count, formatProfileType(pe.ptype)))
		}
		durationStr := formatDurationMins(totalDurationMins)
		lines = append(lines, fmt.Sprintf("- **%s** (%s): %s",
			pluralize(len(valid), "session"), durationStr, strings.Join(parts, ", ")))
	}

	// Most-edited files — "Most edited: auth.go (7 edits), middleware.go (4 edits)"
	if len(uniqueFiles) > 0 {
		type fileEntry struct {
			path  string
			edits int
		}
		sorted := make([]fileEntry, 0, len(uniqueFiles))
		for p, e := range uniqueFiles {
			sorted = append(sorted, fileEntry{p, e})
		}
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].edits > sorted[j].edits
		})
		top := sorted
		if len(top) > 5 {
			top = top[:5]
		}
		var fileParts []string
		for _, f := range top {
			fileParts = append(fileParts, fmt.Sprintf("`%s` (%d edits)", shortenPath(f.path), f.edits))
		}
		lines = append(lines, fmt.Sprintf("- Most edited: %s", strings.Join(fileParts, ", ")))
		if len(uniqueFiles) > 5 {
			lines = append(lines, fmt.Sprintf("  (%d unique files total, %d total edits)",
				len(uniqueFiles), totalEdits))
		}
	}

	// Error resolution rate — "Error resolution rate: 8/10 (80%)"
	if totalErrors > 0 {
		pct := resolvedErrors * 100 / totalErrors
		lines = append(lines, fmt.Sprintf("- Error resolution rate: %d/%d (%d%%)",
			resolvedErrors, totalErrors, pct))
	}

	// Commands — "Commands: 23 tool calls, 4 retries. Top: go build×8, go test×6"
	if len(cmdCounts) > 0 {
		type cmdEntry struct {
			pattern string
			count   int
		}
		sorted := make([]cmdEntry, 0, len(cmdCounts))
		for p, c := range cmdCounts {
			sorted = append(sorted, cmdEntry{p, c})
		}
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].count > sorted[j].count
		})
		top := sorted
		if len(top) > 5 {
			top = top[:5]
		}
		var parts []string
		for _, c := range top {
			parts = append(parts, fmt.Sprintf("`%s`×%d", c.pattern, c.count))
		}
		retryNote := ""
		if totalRetries > 0 {
			retryNote = fmt.Sprintf(", %d retries", totalRetries)
		}
		lines = append(lines, fmt.Sprintf("- Commands: %d tool calls%s. Top: %s",
			totalToolCalls, retryNote, strings.Join(parts, ", ")))
	}

	// Average outcome — "Average outcome: positive (82%)"
	if len(valid) > 0 {
		avgOutcome := outcomeSum / float64(len(valid))
		lines = append(lines, fmt.Sprintf("- Average outcome: %s (%.0f%%)",
			outcomeToLabel(avgOutcome), avgOutcome*100))
	}

	return strings.Join(lines, "\n")
}

// --------------------------------------------------------------------------
// AppendExtractionWorkLog appends a work log entry from an ExtractionResult
// to today's journal. Convenience method that ties the bridge to the service.
// --------------------------------------------------------------------------

// AppendExtractionWorkLog creates a work log entry from the extraction
// result and appends it to the given date's journal.
// sessionName is optional — when provided, it's used as the display name.
func AppendExtractionWorkLog(svc *Service, result *extractor.ExtractionResult, sessionName ...string) {
	if svc == nil || result == nil {
		return
	}
	date := time.Now().Format("2006-01-02")

	name := ""
	if len(sessionName) > 0 {
		name = sessionName[0]
	}

	entry := ExtractionToJournalEntry(result, name)
	if entry == "" {
		return
	}

	// Append a summary line to the work log (the full markdown block is
	// too large for a single line — the summary is for the listing view,
	// the full entry is available in the extraction digest).
	displayName := result.SessionID
	if name != "" {
		displayName = name
	}
	profileLabel := formatProfileType(result.Profile.Type)
	summary := fmt.Sprintf("[%s] %s: %d files, %d errors (%d resolved), outcome %s",
		profileLabel,
		displayName,
		len(result.Files.Files),
		result.Errors.Total,
		result.Errors.Resolved,
		outcomeToLabel(result.Outcome.Score),
	)
	ts := time.Now().Format("15:04")
	svc.AppendWorkLog(date, fmt.Sprintf("%s %s", ts, summary))
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

func formatProfileType(pt extractor.SessionProfileType) string {
	switch pt {
	case extractor.ProfileQuickFix:
		return "quick fix"
	case extractor.ProfileDeepRefactor:
		return "deep refactor"
	case extractor.ProfileExploration:
		return "exploration"
	case extractor.ProfileDebugging:
		return "debugging"
	case extractor.ProfileDeployment:
		return "deployment"
	default:
		return "session"
	}
}

func outcomeToLabel(score float64) string {
	switch {
	case score >= 0.8:
		return "positive"
	case score >= 0.4:
		return "neutral"
	default:
		return "negative"
	}
}

// capitalizeFirstLetter uppercases the first letter of s.
func capitalizeFirstLetter(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// shortenPath returns just the last two path components for readability.
func shortenPath(p string) string {
	if p == "" {
		return p
	}
	dir := filepath.Dir(p)
	base := filepath.Base(p)
	parent := filepath.Base(dir)
	if parent == "." || parent == "/" {
		return base
	}
	return parent + "/" + base
}

// formatDurationMins formats minutes as "Xh Ym" or "Ym".
func formatDurationMins(mins int) string {
	if mins <= 0 {
		return "0m"
	}
	h := mins / 60
	m := mins % 60
	if h > 0 && m > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	if h > 0 {
		return fmt.Sprintf("%dh", h)
	}
	return fmt.Sprintf("%dm", m)
}

// topEditedFiles returns the top N files by edit count.
func topEditedFiles(files []extractor.FileEdit, n int) []extractor.FileEdit {
	sorted := make([]extractor.FileEdit, len(files))
	copy(sorted, files)
	sort.Slice(sorted, func(i, j int) bool {
		return (sorted[i].EditCount + sorted[i].WriteCount) > (sorted[j].EditCount + sorted[j].WriteCount)
	})
	if len(sorted) > n {
		sorted = sorted[:n]
	}
	return sorted
}

type cmdPattern struct {
	pattern    string
	count      int
	retryCount int
}

// topCommandPatterns aggregates commands by pattern and returns the top N.
func topCommandPatterns(commands []extractor.CommandRun, n int) []cmdPattern {
	counts := map[string]*cmdPattern{}
	for _, c := range commands {
		cp, ok := counts[c.Pattern]
		if !ok {
			cp = &cmdPattern{pattern: c.Pattern}
			counts[c.Pattern] = cp
		}
		cp.count++
		if c.IsRetry {
			cp.retryCount++
		}
	}
	sorted := make([]cmdPattern, 0, len(counts))
	for _, cp := range counts {
		sorted = append(sorted, *cp)
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].count > sorted[j].count
	})
	if len(sorted) > n {
		sorted = sorted[:n]
	}
	return sorted
}

type profileEntry struct {
	ptype extractor.SessionProfileType
	count int
}

// sortProfileCounts returns profile counts sorted by count descending.
func sortProfileCounts(counts map[extractor.SessionProfileType]int) []profileEntry {
	sorted := make([]profileEntry, 0, len(counts))
	for pt, c := range counts {
		sorted = append(sorted, profileEntry{pt, c})
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].count > sorted[j].count
	})
	return sorted
}
