// Author: Subash Karki
package persona

import (
	"context"
	"fmt"
	"strings"
)

// Handler processes a classified Intent and returns a Response.
type Handler interface {
	Handle(ctx context.Context, intent Intent, projectPath string) Response
}

// ─── StatusHandler ───────────────────────────────────────────────────────────

// StatusHandler answers questions about Claude sessions and open terminals.
type StatusHandler struct {
	engine *ContextEngine
}

func NewStatusHandler(engine *ContextEngine) *StatusHandler {
	return &StatusHandler{engine: engine}
}

func (h *StatusHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	switch intent.Method {
	case "claudeStatus":
		text := h.claudeStatus(ctx, projectPath)
		return Response{Text: text, Speak: text}
	case "terminalCount":
		text := h.terminalCount(ctx)
		return Response{Text: text, Speak: text}
	default:
		text := h.claudeStatus(ctx, projectPath)
		return Response{Text: text, Speak: text}
	}
}

// claudeStatus returns a human-readable summary of active Claude sessions.
func (h *StatusHandler) claudeStatus(ctx context.Context, projectPath string) string {
	sessions := h.engine.ClaudeSessions(ctx, projectPath)
	if len(sessions) == 0 {
		return "No active Claude sessions."
	}

	var details []string
	for _, s := range sessions {
		details = append(details, fmt.Sprintf("%s (%s)", s.SessionID, s.LiveState))
	}
	return fmt.Sprintf("%d session(s) active: %s", len(sessions), strings.Join(details, ", "))
}

// terminalCount returns a human-readable count of open terminals.
func (h *StatusHandler) terminalCount(ctx context.Context) string {
	terminals := h.engine.TerminalSessions(ctx)
	n := len(terminals)
	if n == 0 {
		return "No terminals open."
	}
	return fmt.Sprintf("%d terminal(s) open.", n)
}

// ─── GitHandler ──────────────────────────────────────────────────────────────

// GitHandler answers questions about the current git state.
type GitHandler struct {
	engine *ContextEngine
}

func NewGitHandler(engine *ContextEngine) *GitHandler {
	return &GitHandler{engine: engine}
}

func (h *GitHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	switch intent.Method {
	case "query":
		gitType := intent.Args["type"]
		text := h.query(ctx, gitType, projectPath)
		return Response{Text: text, Speak: text}
	case "recentChanges":
		text := h.recentChanges(ctx, projectPath)
		return Response{Text: text, Speak: text}
	default:
		text := h.query(ctx, "status", projectPath)
		return Response{Text: text, Speak: text}
	}
}

// query handles "status" and "log" git query types.
func (h *GitHandler) query(ctx context.Context, gitType string, projectPath string) string {
	summary := h.engine.GitSummary(ctx, projectPath)

	switch strings.ToLower(gitType) {
	case "log":
		if len(summary.RecentCommits) == 0 {
			return "No recent commits found."
		}
		lines := make([]string, 0, len(summary.RecentCommits))
		for _, c := range summary.RecentCommits {
			lines = append(lines, fmt.Sprintf("%s %s — %s", c.Hash, c.Message, c.Author))
		}
		return "Recent commits:\n" + strings.Join(lines, "\n")

	default: // "status" and anything else
		branch := summary.Branch
		if branch == "" {
			return "No git repository found at this path."
		}
		if summary.IsClean {
			return fmt.Sprintf("On branch %s. Working tree clean.", branch)
		}
		return fmt.Sprintf(
			"On branch %s. Staged: %d, Unstaged: %d, Untracked: %d.",
			branch, summary.Staged, summary.Unstaged, summary.Untracked,
		)
	}
}

// recentChanges returns a concise summary of working tree and recent commit activity.
func (h *GitHandler) recentChanges(ctx context.Context, projectPath string) string {
	summary := h.engine.GitSummary(ctx, projectPath)

	if summary.Branch == "" {
		return "No git repository found at this path."
	}

	parts := []string{}
	total := summary.Staged + summary.Unstaged + summary.Untracked
	if total > 0 {
		parts = append(parts, fmt.Sprintf("%d file(s) changed in working tree", total))
	}
	if len(summary.RecentCommits) > 0 {
		parts = append(parts, fmt.Sprintf("%d recent commit(s)", len(summary.RecentCommits)))
	}

	if len(parts) == 0 {
		return fmt.Sprintf("Branch %s is clean with no recent activity.", summary.Branch)
	}
	return strings.Join(parts, "; ") + "."
}

// ─── SearchHandler ───────────────────────────────────────────────────────────

// SearchHandler answers search/find queries using the graph.
type SearchHandler struct {
	engine *ContextEngine
}

func NewSearchHandler(engine *ContextEngine) *SearchHandler {
	return &SearchHandler{engine: engine}
}

func (h *SearchHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	switch intent.Method {
	case "search":
		query := intent.Args["query"]
		text := h.search(ctx, query, projectPath)
		return Response{Text: text, Speak: text}
	default:
		text := h.search(ctx, intent.Raw, projectPath)
		return Response{Text: text, Speak: text}
	}
}

// search returns a message describing a graph-backed search.
func (h *SearchHandler) search(ctx context.Context, query string, projectPath string) string {
	graph := h.engine.GraphSummary(projectPath)

	if graph.FileCount == 0 {
		return "The file graph is empty — no files indexed yet."
	}

	q := strings.TrimSpace(query)
	if q == "" {
		return fmt.Sprintf("Graph has %d file(s) indexed. Provide a search term to find symbols or references.", graph.FileCount)
	}
	return fmt.Sprintf("Searching for %q across %d file(s)...", q, graph.FileCount)
}

// ─── WorkspaceHandler ────────────────────────────────────────────────────────

// WorkspaceHandler handles project-switching actions (action tier — locked in observe tier).
type WorkspaceHandler struct {
	engine *ContextEngine
}

func NewWorkspaceHandler(engine *ContextEngine) *WorkspaceHandler {
	return &WorkspaceHandler{engine: engine}
}

func (h *WorkspaceHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	switch intent.Method {
	case "switchProject":
		text := h.switchProject(intent.Args["project"])
		return Response{Text: text, Speak: text}
	default:
		return Response{
			Text:  "Workspace actions are not yet available.",
			Speak: "Workspace actions are not yet available.",
		}
	}
}

// switchProject informs the user that project switching is not yet enabled.
func (h *WorkspaceHandler) switchProject(project string) string {
	if project == "" {
		return "Project switching is not yet enabled."
	}
	return fmt.Sprintf("Switching to project %q is not yet enabled — action tier locked.", project)
}
