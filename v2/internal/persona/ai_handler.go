// Author: Subash Karki
package persona

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// AIHandler uses the Claude CLI to answer general questions with workspace context.
// It is the default fallback handler — any query that doesn't match a fast-path
// pattern is routed here.
type AIHandler struct {
	engine    *ContextEngine
	claudeBin string // resolved path to the claude CLI binary
}

// NewAIHandler creates an AIHandler with the given context engine and claude binary path.
// If claudeBin is empty, it falls back to "claude" (PATH lookup at call time).
func NewAIHandler(engine *ContextEngine, claudeBin string) *AIHandler {
	if claudeBin == "" {
		claudeBin = "claude"
	}
	return &AIHandler{engine: engine, claudeBin: claudeBin}
}

func (h *AIHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	query := intent.Args["query"]
	if query == "" {
		query = intent.Raw
	}
	if strings.TrimSpace(query) == "" {
		return Response{
			Text:  "I didn't catch that. Could you rephrase?",
			Speak: "Could you rephrase?",
		}
	}

	// Assemble workspace context for the system prompt.
	prompt := h.buildPrompt(ctx, query, projectPath)

	// Call Claude CLI with a 15-second timeout.
	cliCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	answer, err := h.callClaude(cliCtx, prompt, projectPath)
	if err != nil {
		// Graceful degradation: return the error as a helpful message.
		text := fmt.Sprintf("I couldn't reach the AI backend: %s\n\nTry asking something like:\n• \"What is Claude doing?\"\n• \"Git status\"\n• \"What changed?\"", err)
		return Response{Text: text, Speak: "AI backend unavailable."}
	}

	answer = strings.TrimSpace(answer)
	if answer == "" {
		answer = "I received an empty response. Try rephrasing your question."
	}

	return Response{Text: answer, Speak: truncateSpeak(answer, 120)}
}

// buildPrompt assembles the full prompt including system context and user query.
func (h *AIHandler) buildPrompt(ctx context.Context, query, projectPath string) string {
	var sb strings.Builder

	sb.WriteString("You are Phantom, an AI assistant embedded in the Phantom developer environment.\n")
	sb.WriteString("You have access to the following workspace context:\n\n")

	// Project path.
	if projectPath != "" {
		sb.WriteString(fmt.Sprintf("[Project]: %s\n", projectPath))
	} else {
		sb.WriteString("[Project]: (none selected)\n")
	}

	// Git summary.
	gitSummary := h.engine.GitSummary(ctx, projectPath)
	if gitSummary.Branch != "" {
		sb.WriteString(fmt.Sprintf("[Git]: branch %s, %d staged, %d unstaged, %d untracked\n",
			gitSummary.Branch, gitSummary.Staged, gitSummary.Unstaged, gitSummary.Untracked))
		if len(gitSummary.RecentCommits) > 0 {
			var commits []string
			limit := 5
			if len(gitSummary.RecentCommits) < limit {
				limit = len(gitSummary.RecentCommits)
			}
			for _, c := range gitSummary.RecentCommits[:limit] {
				commits = append(commits, fmt.Sprintf("  %s %s (%s)", c.Hash, c.Message, c.Author))
			}
			sb.WriteString(fmt.Sprintf("[Recent Commits]:\n%s\n", strings.Join(commits, "\n")))
		}
	} else {
		sb.WriteString("[Git]: no repository detected\n")
	}

	// Claude sessions.
	sessions := h.engine.ClaudeSessions(ctx, projectPath)
	if len(sessions) > 0 {
		var details []string
		for _, s := range sessions {
			detail := fmt.Sprintf("%s (%s)", s.SessionID, s.LiveState)
			if s.LastTool != "" {
				detail += fmt.Sprintf(" — %s", s.LastTool)
			}
			details = append(details, detail)
		}
		sb.WriteString(fmt.Sprintf("[Claude Sessions]: %d active — %s\n", len(sessions), strings.Join(details, ", ")))
	} else {
		sb.WriteString("[Claude Sessions]: none\n")
	}

	// Terminals.
	terminals := h.engine.TerminalSessions(ctx)
	sb.WriteString(fmt.Sprintf("[Terminals]: %d open\n", len(terminals)))

	// File graph.
	graph := h.engine.GraphSummary(projectPath)
	if graph.FileCount > 0 {
		sb.WriteString(fmt.Sprintf("[File Graph]: %d files, %d symbols, %d dependency edges\n",
			graph.FileCount, graph.SymbolCount, graph.EdgeCount))
	}

	sb.WriteString("\nAnswer the user's question concisely. If they ask about workspace state, use the context above.\n")
	sb.WriteString("If they ask you to perform an action (open terminal, run command, start Claude), tell them ")
	sb.WriteString("what command they could use but don't execute it — action tiers are managed separately.\n")
	sb.WriteString("Keep responses under 3 sentences unless the question requires more detail.\n")
	sb.WriteString(fmt.Sprintf("\nUser question: %s", query))

	return sb.String()
}

// callClaude invokes the Claude CLI in single-turn mode and returns stdout.
func (h *AIHandler) callClaude(ctx context.Context, prompt, projectPath string) (string, error) {
	args := []string{
		"-p", prompt,
		"--output-format", "text",
		"--no-input",
		"--model", "haiku",
	}

	cmd := exec.CommandContext(ctx, h.claudeBin, args...)
	if projectPath != "" {
		cmd.Dir = projectPath
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// Include stderr for diagnostics if available.
		errText := stderr.String()
		if errText != "" {
			return "", fmt.Errorf("%w: %s", err, strings.TrimSpace(errText))
		}
		return "", err
	}

	return stdout.String(), nil
}

// truncateSpeak creates a short version of text suitable for spoken output.
func truncateSpeak(s string, maxLen int) string {
	// Use the first sentence or truncate.
	if idx := strings.IndexAny(s, ".!?"); idx >= 0 && idx < maxLen {
		return s[:idx+1]
	}
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
