// Package evaluator provides response quality evaluation for AI chat.
// It checks AI responses for common issues like hallucinations about
// the codebase or references to files that don't exist.
//
// Author: Subash Karki
package evaluator

import (
	"os"
	"regexp"
	"strings"
)

// ResponseCheck holds the result of evaluating an AI response.
type ResponseCheck struct {
	// Warnings are non-blocking issues found in the response.
	Warnings []string `json:"warnings,omitempty"`
	// HasIssues indicates whether any warnings were found.
	HasIssues bool `json:"has_issues"`
}

// CheckResponse evaluates an AI response for common issues.
// projectCwd is the project root directory for file existence checks.
func CheckResponse(response, projectCwd string) ResponseCheck {
	var warnings []string

	// Check for file paths that don't exist.
	if projectCwd != "" {
		badPaths := checkFilePaths(response, projectCwd)
		warnings = append(warnings, badPaths...)
	}

	return ResponseCheck{
		Warnings:  warnings,
		HasIssues: len(warnings) > 0,
	}
}

// filePathRegex matches common file path patterns in AI responses.
var filePathRegex = regexp.MustCompile("`([a-zA-Z0-9_./\\-]+\\.[a-zA-Z]{1,6})`")

// checkFilePaths extracts file paths from backtick-quoted strings and checks if they exist.
func checkFilePaths(response, projectCwd string) []string {
	matches := filePathRegex.FindAllStringSubmatch(response, 20)
	if len(matches) == 0 {
		return nil
	}

	var warnings []string
	checked := make(map[string]struct{})

	for _, m := range matches {
		path := m[1]

		// Skip URLs, common false positives, and already-checked paths.
		if strings.Contains(path, "://") || strings.HasPrefix(path, "http") {
			continue
		}
		if _, ok := checked[path]; ok {
			continue
		}
		checked[path] = struct{}{}

		// Try absolute path first, then relative to project root.
		if !strings.HasPrefix(path, "/") {
			fullPath := projectCwd + "/" + path
			if _, err := os.Stat(fullPath); err != nil {
				// Only warn if the path looks like a real file reference
				// (has at least one directory separator).
				if strings.Contains(path, "/") {
					warnings = append(warnings, "Referenced file may not exist: "+path)
				}
			}
		}
	}

	return warnings
}
