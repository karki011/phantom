// Phantom — Content search bindings (grep/git-grep)
// Author: Subash Karki
//
// Provides SearchFileContents for searching text within workspace files.
// Uses git grep when in a git repo (respects .gitignore), falls back to
// grep -rn otherwise. Results are limited to maxResults to avoid UI flooding.

package app

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/charmbracelet/log"
)

// SearchResult represents a single line match from a content search.
type SearchResult struct {
	FilePath    string `json:"filePath"`
	LineNumber  int    `json:"lineNumber"`
	LineContent string `json:"lineContent"`
	MatchStart  int    `json:"matchStart"`
	MatchEnd    int    `json:"matchEnd"`
}

// SearchFileContents searches for a text query within files in the given workspace.
// It uses git grep (which respects .gitignore) when available, or grep -rn as fallback.
// maxResults caps the number of returned matches (0 means use default of 100).
func (a *App) SearchFileContents(workspaceID string, query string, maxResults int) ([]SearchResult, error) {
	log.Info("app/SearchFileContents: called", "workspaceID", workspaceID, "query", query, "maxResults", maxResults)

	if query == "" {
		return []SearchResult{}, nil
	}

	if maxResults <= 0 {
		maxResults = 100
	}

	repoPath, err := a.resolveWorkspacePath(workspaceID)
	if err != nil {
		log.Error("app/SearchFileContents: resolve failed", "workspaceID", workspaceID, "err", err)
		return nil, err
	}

	results, err := runContentSearch(repoPath, query, maxResults)
	if err != nil {
		log.Error("app/SearchFileContents: search failed", "repoPath", repoPath, "err", err)
		return nil, err
	}

	log.Info("app/SearchFileContents: success", "repoPath", repoPath, "results", len(results))
	return results, nil
}

// runContentSearch performs the actual grep, preferring git grep in git repos.
func runContentSearch(repoPath, query string, maxResults int) ([]SearchResult, error) {
	// Check if this is a git repo by looking for .git
	gitDir := repoPath + "/.git"
	isGit := false
	if _, err := os.Stat(gitDir); err == nil {
		isGit = true
	}

	var output string
	var cmdErr error

	if isGit {
		output, cmdErr = runGitGrep(repoPath, query, maxResults)
	}

	// Fallback to regular grep if not a git repo or git grep failed
	if !isGit || cmdErr != nil {
		output, cmdErr = runPlainGrep(repoPath, query, maxResults)
		if cmdErr != nil {
			return []SearchResult{}, nil // return empty rather than error on grep miss
		}
	}

	return parseGrepOutput(repoPath, output, query, maxResults), nil
}

// runGitGrep runs git grep -n --column -F (fixed string, case-insensitive).
// Returns raw output lines in format: filepath:linenum:colnum:content
func runGitGrep(repoPath, query string, maxResults int) (string, error) {
	// -n: line numbers, --column: column numbers, -i: case insensitive, -F: fixed string (no regex)
	// --max-count: limit per-file matches; we parse and cap globally
	args := []string{
		"-c", "core.optionalLocks=false",
		"-C", repoPath,
		"grep",
		"-n",
		"--column",
		"-i",
		"-F",
		fmt.Sprintf("--max-count=%d", maxResults),
		query,
	}
	cmd := exec.Command("git", args...)
	out, err := cmd.Output()
	if err != nil {
		// exit code 1 = no matches (not an error), >1 = real error
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return "", nil
		}
		return "", err
	}
	return string(out), nil
}

// runPlainGrep runs grep -rn -i -F as fallback when not in a git repo.
// Output format: filepath:linenum:content
func runPlainGrep(repoPath, query string, maxResults int) (string, error) {
	cmd := exec.Command("grep",
		"-rn",
		"-i",
		"-F",
		"--include=*",
		query,
		repoPath,
	)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return "", nil // no matches
		}
		return "", err
	}
	return string(out), nil
}

// parseGrepOutput parses grep/git-grep output into SearchResult structs.
// git grep format:  filepath:linenum:colnum:content
// plain grep format: filepath:linenum:content  (absolute path)
func parseGrepOutput(repoPath, output, query string, maxResults int) []SearchResult {
	if output == "" {
		return []SearchResult{}
	}

	results := make([]SearchResult, 0, maxResults)
	scanner := bufio.NewScanner(strings.NewReader(output))

	for scanner.Scan() {
		if len(results) >= maxResults {
			break
		}
		line := scanner.Text()
		if line == "" {
			continue
		}

		result, ok := parseLine(repoPath, line, query)
		if !ok {
			continue
		}
		results = append(results, result)
	}

	return results
}

// parseLine tries to parse a single grep output line.
// Handles both git grep (file:line:col:content) and plain grep (file:line:content) formats.
func parseLine(repoPath, line, query string) (SearchResult, bool) {
	// Split on ':' — be careful with Windows paths, but we're on macOS
	parts := strings.SplitN(line, ":", 4)
	if len(parts) < 3 {
		return SearchResult{}, false
	}

	filePath := parts[0]
	lineNumStr := parts[1]

	var colNumStr string
	var content string

	// git grep emits 4 parts when --column is used
	if len(parts) == 4 {
		colNumStr = parts[2]
		content = parts[3]
	} else {
		// plain grep: 3 parts (file:line:content) — absolute path
		colNumStr = ""
		content = parts[2]
		// strip the repo path prefix to make it relative
		filePath = strings.TrimPrefix(filePath, repoPath+"/")
	}

	lineNum, err := strconv.Atoi(strings.TrimSpace(lineNumStr))
	if err != nil {
		return SearchResult{}, false
	}

	colNum := 1
	if colNumStr != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(colNumStr)); err == nil {
			colNum = n
		}
	}

	// Compute match start/end in the content string (1-based col → 0-based index)
	matchStart := colNum - 1
	if matchStart < 0 {
		matchStart = 0
	}

	// Find the actual match in content for accurate highlighting
	lowerContent := strings.ToLower(content)
	lowerQuery := strings.ToLower(query)
	idx := strings.Index(lowerContent, lowerQuery)
	if idx >= 0 {
		matchStart = idx
	}
	matchEnd := matchStart + len(query)
	if matchEnd > len(content) {
		matchEnd = len(content)
	}

	return SearchResult{
		FilePath:    filePath,
		LineNumber:  lineNum,
		LineContent: content,
		MatchStart:  matchStart,
		MatchEnd:    matchEnd,
	}, true
}
