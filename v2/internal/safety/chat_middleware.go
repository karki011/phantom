// chat_middleware.go provides safety evaluation middleware for the chat/message flow.
// It evaluates user messages before they are sent and optionally evaluates
// assistant responses. Designed to be lightweight and non-blocking.
//
// Author: Subash Karki
package safety

import (
	"context"
	"log/slog"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// ChatEvaluation is the result of evaluating a chat message through safety rules.
type ChatEvaluation struct {
	// Blocked indicates the message should not be sent (contains a block-level rule match).
	Blocked bool `json:"blocked"`
	// Warnings are non-blocking issues found in the message.
	Warnings []ChatWarning `json:"warnings,omitempty"`
	// PIIDetected indicates PII was found and should be masked.
	PIIDetected bool `json:"pii_detected"`
	// MaskedContent is the message with PII replaced (only set if PIIDetected is true).
	MaskedContent string `json:"masked_content,omitempty"`
	// PIIMatches lists the specific PII patterns found.
	PIIMatches []PIIMatch `json:"pii_matches,omitempty"`
}

// ChatWarning is a single warning from chat safety evaluation.
type ChatWarning struct {
	RuleID  string `json:"rule_id"`
	Level   Level  `json:"level"`
	Message string `json:"message"`
}

// ChatMiddleware evaluates chat messages against safety rules.
// It uses the chat-specific rules (always active) plus any user-defined
// ward rules that apply to chat content.
type ChatMiddleware struct {
	service   *Service
	chatRules []Rule
	piiScan   bool
	emitEvent func(string, interface{})
}

// NewChatMiddleware creates a ChatMiddleware backed by the given Safety service.
// If piiScan is true, messages are scanned for PII and a masked version is provided.
func NewChatMiddleware(service *Service, piiScan bool, emitEvent func(string, interface{})) *ChatMiddleware {
	return &ChatMiddleware{
		service:   service,
		chatRules: ChatRules(),
		piiScan:   piiScan,
		emitEvent: emitEvent,
	}
}

// EvaluateUserMessage checks a user message before it is sent to the AI provider.
// Returns a ChatEvaluation with any warnings or blocking issues.
// This method is designed to be fast — it should not add perceptible latency.
func (cm *ChatMiddleware) EvaluateUserMessage(ctx context.Context, sessionID, content string) ChatEvaluation {
	eval := ChatEvaluation{}

	// 1. Check chat-specific rules (always active).
	ev := &stream.Event{
		Type:      stream.EventUser,
		SessionID: sessionID,
		Content:   content,
		ToolInput: content, // Rules match against ToolInput, so set both.
		Timestamp: time.Now().UnixMilli(),
	}

	for _, rule := range cm.chatRules {
		if !rule.Match(ev) {
			continue
		}

		warning := ChatWarning{
			RuleID:  rule.ID,
			Level:   rule.Level,
			Message: rule.Message,
		}
		eval.Warnings = append(eval.Warnings, warning)

		if rule.Level == LevelBlock {
			eval.Blocked = true
		}

		// Emit event for each triggered chat rule.
		if cm.emitEvent != nil {
			cm.emitEvent("chat:safety_warning", map[string]interface{}{
				"session_id": sessionID,
				"rule_id":    rule.ID,
				"level":      string(rule.Level),
				"message":    rule.Message,
			})
		}
	}

	// 2. Also evaluate against user-defined ward rules if available.
	if cm.service != nil {
		wardEvals := cm.service.Evaluate(ctx, ev)
		for _, we := range wardEvals {
			warning := ChatWarning{
				RuleID:  we.RuleID,
				Level:   we.Level,
				Message: we.Message,
			}
			eval.Warnings = append(eval.Warnings, warning)

			if we.Level == LevelBlock {
				eval.Blocked = true
			}
		}
	}

	// 3. PII scanning.
	if cm.piiScan {
		matches := ScanForPII(content)
		if len(matches) > 0 {
			eval.PIIDetected = true
			eval.PIIMatches = matches
			eval.MaskedContent = MaskPII(content)
		}
	}

	return eval
}

// EvaluateAssistantResponse optionally checks an AI response for safety issues.
// This is lighter-weight than user message evaluation — primarily checks for
// leaked secrets in the response that might have come from the codebase.
func (cm *ChatMiddleware) EvaluateAssistantResponse(_ context.Context, sessionID, content string) ChatEvaluation {
	eval := ChatEvaluation{}

	// Only PII scan responses — we don't apply ward rules to AI output.
	if cm.piiScan {
		matches := ScanForPII(content)
		if len(matches) > 0 {
			eval.PIIDetected = true
			eval.PIIMatches = matches
			// Don't mask the response — just flag it for the frontend.
			slog.Warn("safety/chat: PII detected in assistant response", "sessionID", sessionID, "matches", len(matches))
		}
	}

	return eval
}

// StreamEventHook returns an EventHook function suitable for use with
// stream.Service.SetEventHook. It evaluates stream events that carry
// user or assistant message content through the chat safety pipeline.
//
// This is designed to be chained with existing hooks — it does not replace
// the ward evaluation hook in app.go, but adds chat-aware evaluation.
func (cm *ChatMiddleware) StreamEventHook() func(ctx context.Context, ev *stream.Event) {
	return func(ctx context.Context, ev *stream.Event) {
		switch ev.Type {
		case stream.EventUser:
			if ev.Content == "" {
				return
			}
			result := cm.EvaluateUserMessage(ctx, ev.SessionID, ev.Content)
			if result.Blocked {
				slog.Warn("safety/chat: blocked user message", "sessionID", ev.SessionID)
				if cm.emitEvent != nil {
					cm.emitEvent("chat:message_blocked", map[string]interface{}{
						"session_id": ev.SessionID,
						"warnings":   result.Warnings,
					})
				}
			}

		case stream.EventAssistant:
			if ev.Content == "" {
				return
			}
			result := cm.EvaluateAssistantResponse(ctx, ev.SessionID, ev.Content)
			if result.PIIDetected {
				if cm.emitEvent != nil {
					cm.emitEvent("chat:pii_in_response", map[string]interface{}{
						"session_id":  ev.SessionID,
						"match_count": len(result.PIIMatches),
					})
				}
			}
		}
	}
}
