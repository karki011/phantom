// Author: Subash Karki
//
// Package classify provides work-type self-classification for Phantom's AI
// engine. The model is instructed to emit a structured tag early in its
// response; this package extracts the tag, strips it from the visible output,
// and returns a typed TaskType that the strategy pipeline can consume.
package classify

import (
	"regexp"
	"strings"
)

// TaskType represents an auto-detected work classification emitted by the model.
type TaskType string

const (
	TaskTypeFeature     TaskType = "feature"
	TaskTypeBugfix      TaskType = "bugfix"
	TaskTypeRefactor    TaskType = "refactor"
	TaskTypeExploration TaskType = "exploration"
	TaskTypeDebug       TaskType = "debug"
	TaskTypeTest        TaskType = "test"
	TaskTypeDocs        TaskType = "docs"
	TaskTypeUnknown     TaskType = "unknown"
)

// ClassificationDirective is injected into the system prompt so the model
// emits a single classification tag at the start of its response. The tag
// is stripped from user-visible output by ExtractAndStrip.
const ClassificationDirective = `When you begin working on a task, emit a single classification tag on its own line: <phantom:task_type>TYPE</phantom:task_type> where TYPE is one of: feature, bugfix, refactor, exploration, debug, test, docs. Emit this once per task, early in your response. Do not explain or reference this tag.`

// tagPattern matches the classification tag emitted by the model.
// Named capture group "kind" holds the raw type string.
var tagPattern = regexp.MustCompile(`<phantom:task_type>(\w+)</phantom:task_type>`)

// validTypes is the set of accepted task type strings.
var validTypes = map[string]TaskType{
	"feature":     TaskTypeFeature,
	"bugfix":      TaskTypeBugfix,
	"refactor":    TaskTypeRefactor,
	"exploration": TaskTypeExploration,
	"debug":       TaskTypeDebug,
	"test":        TaskTypeTest,
	"docs":        TaskTypeDocs,
}

// ExtractAndStrip scans text for the first classification tag emitted by the
// model. It returns:
//   - cleaned: text with the tag line removed (no trailing blank line artifact)
//   - taskType: the validated TaskType (TaskTypeUnknown when tag is absent or invalid)
//   - found: true only when a valid tag was found and extracted
//
// The function is safe to call on streaming partial text — if no closing tag
// is present, found is false and cleaned equals text unchanged.
func ExtractAndStrip(text string) (cleaned string, taskType TaskType, found bool) {
	loc := tagPattern.FindStringSubmatchIndex(text)
	if loc == nil {
		return text, TaskTypeUnknown, false
	}

	// loc[0]:loc[1] is the full match; loc[2]:loc[3] is the captured type.
	raw := strings.ToLower(text[loc[2]:loc[3]])
	tt, valid := validTypes[raw]
	if !valid {
		// Tag present but unknown type — strip it anyway so it doesn't leak.
		cleaned = removeTagLine(text, loc[0], loc[1])
		return cleaned, TaskTypeUnknown, false
	}

	cleaned = removeTagLine(text, loc[0], loc[1])
	return cleaned, tt, true
}

// ValidTaskType reports whether s is one of the recognised task type strings.
func ValidTaskType(s string) bool {
	_, ok := validTypes[strings.ToLower(s)]
	return ok
}

// removeTagLine removes the substring text[start:end] from text, then trims
// any blank line that would be left immediately after the removal. This keeps
// the visible output clean whether the tag sits at the top, middle, or end.
func removeTagLine(text string, start, end int) string {
	before := text[:start]
	after := text[end:]

	// If the tag was on its own line (preceded by \n or start-of-string and
	// followed by \n or end-of-string), remove the surrounding newline so we
	// don't leave a dangling blank line.
	if after != "" && after[0] == '\n' {
		after = after[1:]
	} else if before != "" && before[len(before)-1] == '\n' {
		before = before[:len(before)-1]
	}

	return before + after
}
