// Package graph provides codebase context extraction for AI chat prompts.
// It queries the project detector and collector data to build a concise
// context string that gives the AI model awareness of the codebase.
//
// Author: Subash Karki
package graph

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/project"
)

// MaxContextChars is the hard cap on injected context to prevent prompt bloat.
const MaxContextChars = 8000

// ContextProvider builds codebase context strings for AI chat prompts.
type ContextProvider struct {
	queries    *db.Queries
	rawDB      db.DBTX
	graphLookup func(projectCwd string) FileGraphReader
}

// FileGraphReader is the interface the context provider needs from the file graph.
type FileGraphReader interface {
	Neighbors(path string, depth int) []FileGraphNode
	SymbolLookup(name string) []FileGraphNode
}

// FileGraphNode is a simplified view of a file graph node for context building.
type FileGraphNode struct {
	Path     string
	Language string
	Symbols  []string
}

// NewContextProvider creates a ContextProvider backed by the given DB connections.
func NewContextProvider(queries *db.Queries, rawDB db.DBTX) *ContextProvider {
	return &ContextProvider{queries: queries, rawDB: rawDB}
}

// SetGraphLookup injects the file graph so the context provider can use
// dependency-aware context selection. Called after indexers are started.
func (cp *ContextProvider) SetGraphLookup(fn func(projectCwd string) FileGraphReader) {
	cp.graphLookup = fn
}

// ContextResult holds the assembled context and metadata about what was included.
type ContextResult struct {
	Context    string `json:"context"`
	CharCount  int    `json:"char_count"`
	ProjectCwd string `json:"project_cwd,omitempty"`
	Truncated  bool   `json:"truncated"`
}

// ForSession builds context for a specific session by looking up its project
// and recent activity. Returns an empty result if the session is not found.
func (cp *ContextProvider) ForSession(ctx context.Context, sessionID string) ContextResult {
	sess, err := cp.queries.GetSession(ctx, sessionID)
	if err != nil {
		return ContextResult{}
	}

	cwd := ""
	if sess.Cwd.Valid {
		cwd = sess.Cwd.String
	}
	if cwd == "" {
		return ContextResult{}
	}

	return cp.ForProject(ctx, cwd, sessionID)
}

// ForProject builds context for a project directory, optionally scoped to a session.
func (cp *ContextProvider) ForProject(ctx context.Context, projectCwd, sessionID string) ContextResult {
	var sections []string

	// 1. Project profile (type, build system, package manager, recipes).
	profile := project.Detect(projectCwd)
	if profile.Detected {
		sections = append(sections, formatProjectProfile(profile))
	}

	// 2. Recent files touched in this session (from activity_log).
	if sessionID != "" {
		files := cp.recentFiles(ctx, sessionID)
		if len(files) > 0 {
			sections = append(sections, formatRecentFiles(files))
		}
	}

	// 3. Active branch (from session data).
	if sessionID != "" {
		branch := cp.activeBranch(ctx, sessionID)
		if branch != "" {
			sections = append(sections, fmt.Sprintf("[Git Branch]\n%s", branch))
		}
	}

	if len(sections) == 0 {
		return ContextResult{}
	}

	full := strings.Join(sections, "\n\n")
	truncated := false
	if len(full) > MaxContextChars {
		full = full[:MaxContextChars-3] + "..."
		truncated = true
	}

	return ContextResult{
		Context:    full,
		CharCount:  len(full),
		ProjectCwd: projectCwd,
		Truncated:  truncated,
	}
}

// ForMessage builds context for a user message by extracting keywords,
// matching them against recent session activity, and using the file graph
// to include dependency neighbors for referenced files.
func (cp *ContextProvider) ForMessage(ctx context.Context, sessionID, userMessage string) ContextResult {
	// Start with the full session context.
	result := cp.ForSession(ctx, sessionID)
	if result.Context == "" {
		return result
	}

	// If the message references specific files, prepend that info.
	fileHints := cp.fileHintsFromMessage(ctx, sessionID, userMessage)
	if fileHints != "" {
		combined := fileHints + "\n\n" + result.Context
		if len(combined) > MaxContextChars {
			combined = combined[:MaxContextChars-3] + "..."
			result.Truncated = true
		}
		result.Context = combined
		result.CharCount = len(combined)
	}

	// Use file graph to add dependency context for referenced files.
	graphContext := cp.graphContextFromMessage(ctx, sessionID, userMessage)
	if graphContext != "" {
		combined := result.Context + "\n\n" + graphContext
		if len(combined) > MaxContextChars {
			combined = combined[:MaxContextChars-3] + "..."
			result.Truncated = true
		}
		result.Context = combined
		result.CharCount = len(combined)
	}

	return result
}

// graphContextFromMessage uses the file graph to find dependency neighbors
// for any files mentioned in the user message.
func (cp *ContextProvider) graphContextFromMessage(ctx context.Context, sessionID, message string) string {
	if cp.graphLookup == nil {
		return ""
	}

	sess, err := cp.queries.GetSession(ctx, sessionID)
	if err != nil || !sess.Cwd.Valid {
		return ""
	}

	graph := cp.graphLookup(sess.Cwd.String)
	if graph == nil {
		return ""
	}

	// Find files mentioned in the message from recent activity.
	recentFiles := cp.recentFiles(ctx, sessionID)
	msgLower := strings.ToLower(message)

	var mentionedPaths []string
	for _, f := range recentFiles {
		base := strings.ToLower(lastPathComponent(f))
		if strings.Contains(msgLower, base) {
			mentionedPaths = append(mentionedPaths, f)
		}
	}

	if len(mentionedPaths) == 0 {
		return ""
	}

	// Collect neighbor files (depth 1) for all mentioned files.
	seen := make(map[string]struct{})
	var neighborLines []string

	for _, path := range mentionedPaths {
		if len(neighborLines) >= 15 {
			break
		}
		neighbors := graph.Neighbors(path, 1)
		for _, n := range neighbors {
			if _, ok := seen[n.Path]; ok {
				continue
			}
			seen[n.Path] = struct{}{}
			symStr := ""
			if len(n.Symbols) > 0 {
				max := 5
				if len(n.Symbols) < max {
					max = len(n.Symbols)
				}
				symStr = " → " + strings.Join(n.Symbols[:max], ", ")
			}
			neighborLines = append(neighborLines, fmt.Sprintf("  %s (%s)%s", lastPathComponent(n.Path), n.Language, symStr))
			if len(neighborLines) >= 15 {
				break
			}
		}
	}

	if len(neighborLines) == 0 {
		return ""
	}

	return fmt.Sprintf("[Related Files (dependency graph)]\n%s", strings.Join(neighborLines, "\n"))
}

// recentFiles returns the last N unique file paths touched in a session.
func (cp *ContextProvider) recentFiles(ctx context.Context, sessionID string) []string {
	activities, err := cp.queries.ListRecentActivity(ctx, db.ListRecentActivityParams{
		SessionID: sql.NullString{String: sessionID, Valid: true},
		Column2:   sessionID,
		Limit:     200,
	})
	if err != nil {
		return nil
	}

	seen := make(map[string]struct{})
	var files []string

	for _, a := range activities {
		if !strings.HasPrefix(a.Type, "tool:") {
			continue
		}
		if !a.Metadata.Valid {
			continue
		}

		var meta map[string]string
		if err := json.Unmarshal([]byte(a.Metadata.String), &meta); err != nil {
			continue
		}

		detail := meta["detail"]
		if detail == "" {
			continue
		}

		// Only file-oriented tools carry paths.
		if a.Type == "tool:read" || a.Type == "tool:edit" || a.Type == "tool:write" {
			path := strings.TrimSpace(detail)
			if path != "" && !strings.Contains(path, " ") {
				if _, ok := seen[path]; !ok {
					seen[path] = struct{}{}
					files = append(files, path)
				}
			}
		}
	}

	// Cap at 20 most recent.
	if len(files) > 20 {
		files = files[:20]
	}
	return files
}

// activeBranch looks up the git branch from the session's enrichment data.
func (cp *ContextProvider) activeBranch(ctx context.Context, sessionID string) string {
	row := cp.rawDB.QueryRowContext(ctx,
		`SELECT branch FROM sessions WHERE id = ? AND branch IS NOT NULL AND branch != ''`,
		sessionID)
	var branch string
	if err := row.Scan(&branch); err != nil {
		return ""
	}
	return branch
}

// fileHintsFromMessage checks if the user message mentions any recently-touched files
// and returns a brief summary. This helps the AI know which files are relevant.
func (cp *ContextProvider) fileHintsFromMessage(ctx context.Context, sessionID, message string) string {
	files := cp.recentFiles(ctx, sessionID)
	if len(files) == 0 {
		return ""
	}

	msgLower := strings.ToLower(message)
	var mentioned []string

	for _, f := range files {
		// Match by filename (last path component) or full path.
		base := strings.ToLower(lastPathComponent(f))
		if strings.Contains(msgLower, base) {
			mentioned = append(mentioned, f)
		}
	}

	if len(mentioned) == 0 {
		return ""
	}

	return fmt.Sprintf("[Referenced Files]\n%s", strings.Join(mentioned, "\n"))
}

// formatProjectProfile formats a project.Profile into a concise context block.
func formatProjectProfile(p project.Profile) string {
	var lines []string
	lines = append(lines, "[Project]")
	lines = append(lines, fmt.Sprintf("Type: %s", p.Type))

	if p.BuildSystem != "" {
		lines = append(lines, fmt.Sprintf("Build: %s", p.BuildSystem))
	}
	if p.PackageMgr != "" {
		lines = append(lines, fmt.Sprintf("Package Manager: %s", p.PackageMgr))
	}

	// Include key recipes (test, build, lint) — skip the rest.
	var keyRecipes []string
	for _, r := range p.Recipes {
		switch r.Category {
		case project.CategoryTest, project.CategoryBuild, project.CategoryLint:
			keyRecipes = append(keyRecipes, fmt.Sprintf("  %s: %s", r.Label, r.Command))
		}
		if len(keyRecipes) >= 6 {
			break
		}
	}
	if len(keyRecipes) > 0 {
		lines = append(lines, "Key Commands:")
		lines = append(lines, keyRecipes...)
	}

	if len(p.EnvNeeds) > 0 {
		lines = append(lines, fmt.Sprintf("Requires: %s", strings.Join(p.EnvNeeds, ", ")))
	}

	return strings.Join(lines, "\n")
}

// formatRecentFiles formats a file list into a concise context block.
func formatRecentFiles(files []string) string {
	var lines []string
	lines = append(lines, "[Recently Touched Files]")
	for _, f := range files {
		lines = append(lines, fmt.Sprintf("  %s", f))
	}
	return strings.Join(lines, "\n")
}

// lastPathComponent returns the last segment of a path.
func lastPathComponent(path string) string {
	if idx := strings.LastIndex(path, "/"); idx >= 0 {
		return path[idx+1:]
	}
	return path
}
