// bindings_ai.go exposes AI context injection and chat safety APIs to the Wails frontend.
// Author: Subash Karki
package app

import (
	graphctx "github.com/subashkarki/phantom-os-v2/internal/ai/graph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
	"github.com/subashkarki/phantom-os-v2/internal/safety"
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

// EvaluateChatMessage runs safety evaluation on a chat message before sending.
// Returns warnings, PII detection results, and whether the message is blocked.
func (a *App) EvaluateChatMessage(sessionID, content string) *safety.ChatEvaluation {
	if a.chatMiddleware == nil {
		return &safety.ChatEvaluation{}
	}
	result := a.chatMiddleware.EvaluateUserMessage(a.ctx, sessionID, content)
	return &result
}

// EvaluateChatResponse runs safety evaluation on an AI response.
// Primarily checks for PII/secrets in the response content.
func (a *App) EvaluateChatResponse(sessionID, content string) *safety.ChatEvaluation {
	if a.chatMiddleware == nil {
		return &safety.ChatEvaluation{}
	}
	result := a.chatMiddleware.EvaluateAssistantResponse(a.ctx, sessionID, content)
	return &result
}

// GetChatSafetyRules returns the active chat-specific safety rules.
func (a *App) GetChatSafetyRules() []safety.Rule {
	return safety.ChatRules()
}
