// Package knowledge provides a unified interface for querying codebase knowledge.
// LogError writes structured NDJSON error entries to ~/.phantom-os/errors.log
// for observability without disrupting fail-open behavior.
//
// Author: Subash Karki
package knowledge

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ErrorEntry is a single structured error record written as NDJSON.
type ErrorEntry struct {
	Timestamp string `json:"timestamp"`
	Component string `json:"component"`
	Operation string `json:"operation"`
	Error     string `json:"error"`
	Context   string `json:"context,omitempty"`
}

var (
	errorLogMu   sync.Mutex
	errorLogPath string
)

func init() {
	home, _ := os.UserHomeDir()
	errorLogPath = filepath.Join(home, ".phantom-os", "errors.log")
}

// LogError appends a structured error entry to the shared NDJSON error log.
// It is safe for concurrent use and silently drops writes that fail (the error
// logger must never itself become a source of errors).
func LogError(component, operation string, err error, context ...string) {
	if err == nil {
		return
	}
	errorLogMu.Lock()
	defer errorLogMu.Unlock()

	entry := ErrorEntry{
		Timestamp: time.Now().Format(time.RFC3339),
		Component: component,
		Operation: operation,
		Error:     err.Error(),
	}
	if len(context) > 0 {
		entry.Context = context[0]
	}

	line, _ := json.Marshal(entry)

	// Ensure parent directory exists.
	_ = os.MkdirAll(filepath.Dir(errorLogPath), 0755)

	f, ferr := os.OpenFile(errorLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if ferr != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s\n", line)
}

// ReadRecentErrors reads the last N error entries from the log file.
// Returns an empty slice if the file doesn't exist or can't be read.
func ReadRecentErrors(limit int) []ErrorEntry {
	if limit <= 0 {
		limit = 50
	}

	data, err := os.ReadFile(errorLogPath)
	if err != nil {
		return nil
	}

	lines := splitNonEmpty(string(data))

	// Take the last `limit` lines.
	start := 0
	if len(lines) > limit {
		start = len(lines) - limit
	}
	lines = lines[start:]

	entries := make([]ErrorEntry, 0, len(lines))
	for _, line := range lines {
		var e ErrorEntry
		if json.Unmarshal([]byte(line), &e) == nil {
			entries = append(entries, e)
		}
	}

	// Reverse so newest is first.
	for i, j := 0, len(entries)-1; i < j; i, j = i+1, j-1 {
		entries[i], entries[j] = entries[j], entries[i]
	}
	return entries
}

// splitNonEmpty splits a string by newlines and filters empty strings.
func splitNonEmpty(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			line := s[start:i]
			if len(line) > 0 {
				result = append(result, line)
			}
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}
