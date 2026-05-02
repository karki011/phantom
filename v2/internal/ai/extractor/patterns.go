// Author: Subash Karki
package extractor

import (
	"regexp"
	"strings"
)

// Error detection patterns — compiled once at init.
var (
	panicPattern        = regexp.MustCompile(`(?i)(panic|fatal|segfault|SIGSEGV)`)
	buildErrorPattern   = regexp.MustCompile(`(?i)(compilation failed|cannot find|undefined:|syntax error|does not implement)`)
	testFailPattern     = regexp.MustCompile(`(?i)(FAIL|--- FAIL|test.*failed|assertion.*failed)`)
	importErrorPattern  = regexp.MustCompile(`(?i)(cannot find module|import .+ not found|could not resolve)`)
	runtimeErrorPattern = regexp.MustCompile(`(?i)(Error:|error:|Exception:|traceback)`)
)

// Satisfaction keyword lists.
var positiveSignals = []string{
	"perfect", "thanks", "thank you", "looks good", "lgtm",
	"ship it", "great", "awesome", "nice", "exactly",
	"that's right", "correct", "good job", "well done",
}

var negativeSignals = []string{
	"no", "wrong", "that's not right", "undo", "revert",
	"try again", "start over", "don't", "stop", "cancel", "nope",
}

// Command sanitization patterns.
var (
	secretPattern   = regexp.MustCompile(`(?i)(api.?key|token|secret|password|credential)([=:])\S+`)
	homePathPattern = regexp.MustCompile(`/Users/[^/]+/|/home/[^/]+/`)
)

// Tool name sets — maps for O(1) lookup.
var editToolNames = map[string]bool{
	"Write":       true,
	"Edit":        true,
	"MultiEdit":   true,
	"apply_patch": true,
}

var bashToolNames = map[string]bool{
	"Bash": true,
}

// classifyError returns the error category based on content pattern matching.
// Returns empty string if no pattern matches.
func classifyError(content string) string {
	switch {
	case panicPattern.MatchString(content):
		return "panic"
	case importErrorPattern.MatchString(content):
		return "import"
	case buildErrorPattern.MatchString(content):
		return "build"
	case testFailPattern.MatchString(content):
		return "test"
	case runtimeErrorPattern.MatchString(content):
		return "runtime"
	default:
		return ""
	}
}

// sanitizeCommand strips secrets and normalizes home directory paths.
func sanitizeCommand(cmd string) string {
	// Remove secrets (API_KEY=xxx, token=xxx, etc.)
	sanitized := secretPattern.ReplaceAllString(cmd, "$1$2***")
	// Normalize home paths to ~/
	sanitized = homePathPattern.ReplaceAllString(sanitized, "~/")
	return sanitized
}

// extractCommandPattern returns the first 3 meaningful tokens of a command,
// stripping flags and arguments to produce a canonical pattern.
func extractCommandPattern(cmd string) string {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return ""
	}

	// Split on whitespace.
	parts := strings.Fields(cmd)

	var tokens []string
	for _, p := range parts {
		// Skip flags (--foo, -x).
		if strings.HasPrefix(p, "-") {
			continue
		}
		// Skip pipe/redirect operators.
		if p == "|" || p == ">" || p == ">>" || p == "<" || p == "&&" || p == "||" || p == ";" {
			break
		}
		tokens = append(tokens, p)
		if len(tokens) >= 3 {
			break
		}
	}

	if len(tokens) == 0 {
		return cmd
	}
	return strings.Join(tokens, " ")
}

// truncateMessage truncates a string to maxLen characters, appending "..." if truncated.
func truncateMessage(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
