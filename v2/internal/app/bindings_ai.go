// bindings_ai.go exposes AI context injection APIs to the Wails frontend.
// Author: Subash Karki
package app

import (
	"log/slog"

	graphctx "github.com/subashkarki/phantom-os-v2/internal/ai/graph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
)

// GetAIContext returns the codebase context that would be injected for a session.
// The frontend can use this to show users what the AI "knows" about their project.
func (a *App) GetAIContext(sessionID string) *graphctx.ContextResult {
	if a.ctxInjector == nil {
		return nil
	}
	result := a.ctxInjector.GetContext(a.ctx, sessionID)
	if result.Context == "" {
		return nil
	}
	return &result
}

// EnrichPrompt takes a user message and returns an enriched version with
// codebase context prepended. Returns the original message if no context
// is available or the injector is not initialized.
func (a *App) EnrichPrompt(sessionID, userMessage string) *strategies.EnrichResult {
	if a.ctxInjector == nil {
		return &strategies.EnrichResult{
			EnrichedPrompt: userMessage,
			OriginalPrompt: userMessage,
		}
	}
	result := a.ctxInjector.Enrich(a.ctx, sessionID, userMessage)
	return &result
}

// ResetAIPerformance clears all strategy performance history and decisions.
// Use when the performance data is stale or poisoned. Requires app restart
// to clear in-memory caches.
func (a *App) ResetAIPerformance() error {
	if a.DB == nil {
		return nil
	}
	sqlDB := a.DB.Writer
	for _, table := range []string{"ai_performance", "ai_decisions", "ai_outcomes"} {
		if _, err := sqlDB.Exec("DELETE FROM " + table); err != nil {
			slog.Warn("failed to clear table", "table", table, "error", err)
		}
	}
	slog.Info("AI performance data reset — restart app to clear in-memory caches")
	return nil
}
