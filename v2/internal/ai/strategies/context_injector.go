// Package strategies provides AI prompt enhancement strategies.
// ContextInjector wraps user messages with codebase context before
// they are sent to the AI provider, giving the model awareness of
// the project structure, recent activity, and referenced files.
//
// Author: Subash Karki
package strategies

import (
	"context"
	"fmt"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/metrics"
	"github.com/subashkarki/phantom-os-v2/internal/ai/sanitize"
)

// ContextInjector enriches user prompts with codebase context.
type ContextInjector struct {
	provider *graph.ContextProvider
	assessor *Assessor
	registry *Registry
	metrics  *metrics.PipelineMetrics
}

// NewContextInjector creates a ContextInjector backed by the given ContextProvider.
func NewContextInjector(provider *graph.ContextProvider) *ContextInjector {
	return &ContextInjector{provider: provider}
}

// SetAssessor injects a task assessor for strategy-aware enrichment.
// Called after the assessor is initialized.
func (ci *ContextInjector) SetAssessor(a *Assessor) {
	ci.assessor = a
}

// SetRegistry injects a strategy registry for strategy-aware enrichment.
// Called after strategies are registered.
func (ci *ContextInjector) SetRegistry(r *Registry) {
	ci.registry = r
}

// EnrichResult holds the enriched prompt and metadata about what was injected.
type EnrichResult struct {
	// EnrichedPrompt is the user message with context prepended as a system-style block.
	EnrichedPrompt string `json:"enriched_prompt"`
	// OriginalPrompt is the unmodified user message.
	OriginalPrompt string `json:"original_prompt"`
	// ContextChars is the number of characters of context injected.
	ContextChars int `json:"context_chars"`
	// HasContext indicates whether any context was injected.
	HasContext bool `json:"has_context"`
	// StrategyID is the ID of the strategy that was selected (empty if none).
	StrategyID string `json:"strategy_id,omitempty"`
	// StrategyName is the human-readable name of the selected strategy.
	StrategyName string `json:"strategy_name,omitempty"`
}

// Enrich takes a user message and session ID, queries the graph for relevant
// context, and returns an enriched prompt. If no context is available, the
// original message is returned unchanged.
func (ci *ContextInjector) Enrich(ctx context.Context, sessionID, userMessage string) EnrichResult {
	if ci.provider == nil {
		return EnrichResult{
			EnrichedPrompt: userMessage,
			OriginalPrompt: userMessage,
		}
	}

	ctxResult := ci.provider.ForMessage(ctx, sessionID, userMessage)
	if ctxResult.Context == "" {
		return EnrichResult{
			EnrichedPrompt: userMessage,
			OriginalPrompt: userMessage,
		}
	}

	// Sanitize graph context to prevent prompt injection via source file contents.
	ctxResult.Context = sanitize.XMLTags(ctxResult.Context)

	// Apply strategy assessment when assessor + registry are configured.
	message := userMessage
	var strategyID, strategyName string
	if ci.assessor != nil && ci.registry != nil {
		fileCount := countContextFiles(ctxResult.Context)
		blastRadius := fileCount // Use file count as blast radius proxy.
		assessment := ci.assessor.Assess(userMessage, fileCount, blastRadius)

		if strategy := ci.registry.Select(assessment); strategy != nil {
			strategyID = strategy.ID()
			strategyName = strategy.Name()
			message = strategy.Enrich(message, assessment, ctxResult.Context)
		}
	}

	enriched := formatEnrichedPrompt(ctxResult.Context, message)

	return EnrichResult{
		EnrichedPrompt: enriched,
		OriginalPrompt: userMessage,
		ContextChars:   ctxResult.CharCount,
		HasContext:      true,
		StrategyID:     strategyID,
		StrategyName:   strategyName,
	}
}

// EnrichForProject enriches a message with context from a specific project directory
// rather than a session. Useful for one-off queries not tied to an active session.
func (ci *ContextInjector) EnrichForProject(ctx context.Context, projectCwd, userMessage string) EnrichResult {
	if ci.provider == nil {
		return EnrichResult{
			EnrichedPrompt: userMessage,
			OriginalPrompt: userMessage,
		}
	}

	ctxResult := ci.provider.ForProject(ctx, projectCwd, "")
	if ctxResult.Context == "" {
		return EnrichResult{
			EnrichedPrompt: userMessage,
			OriginalPrompt: userMessage,
		}
	}

	// Sanitize graph context to prevent prompt injection via source file contents.
	ctxResult.Context = sanitize.XMLTags(ctxResult.Context)

	enriched := formatEnrichedPrompt(ctxResult.Context, userMessage)

	return EnrichResult{
		EnrichedPrompt: enriched,
		OriginalPrompt: userMessage,
		ContextChars:   ctxResult.CharCount,
		HasContext:      true,
	}
}

// GetContext returns the raw context for a session without enriching a message.
// Useful for the frontend to display what context the AI is receiving.
func (ci *ContextInjector) GetContext(ctx context.Context, sessionID string) graph.ContextResult {
	if ci.provider == nil {
		return graph.ContextResult{}
	}
	return ci.provider.ForSession(ctx, sessionID)
}

// formatEnrichedPrompt combines context and user message into a single prompt.
// The context is wrapped in a clearly delineated block so the AI can distinguish
// injected context from the user's actual question.
func formatEnrichedPrompt(codebaseContext, userMessage string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("<codebase-context>\n%s\n</codebase-context>\n\n", codebaseContext))
	b.WriteString(userMessage)
	return b.String()
}

// countContextFiles estimates the number of files referenced in the context string
// by counting lines that look like file paths (contain a slash and a dot).
func countContextFiles(ctx string) int {
	count := 0
	for _, line := range strings.Split(ctx, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "/") && strings.Contains(trimmed, ".") {
			count++
		}
	}
	return count
}
