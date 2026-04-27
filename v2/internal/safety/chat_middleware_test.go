// chat_middleware_test.go tests the chat safety middleware.
// Author: Subash Karki
package safety

import (
	"context"
	"testing"
)

func TestChatMiddleware_EvaluateUserMessage_DetectsSecrets(t *testing.T) {
	// Create middleware without a backing safety service (nil) — uses chat rules only.
	mw := NewChatMiddleware(nil, true, nil)

	eval := mw.EvaluateUserMessage(context.Background(), "test-session", "My key is AKIAIOSFODNN7EXAMPLE")

	if len(eval.Warnings) == 0 {
		t.Error("expected at least one warning for AWS key")
	}

	if !eval.PIIDetected {
		t.Error("expected PII detected for AWS key")
	}

	if eval.MaskedContent == "" {
		t.Error("expected masked content when PII detected")
	}
}

func TestChatMiddleware_EvaluateUserMessage_NormalMessage(t *testing.T) {
	mw := NewChatMiddleware(nil, true, nil)

	eval := mw.EvaluateUserMessage(context.Background(), "test-session", "How do I write tests in Go?")

	if len(eval.Warnings) != 0 {
		t.Errorf("expected no warnings, got %d", len(eval.Warnings))
	}
	if eval.Blocked {
		t.Error("normal message should not be blocked")
	}
	if eval.PIIDetected {
		t.Error("normal message should not trigger PII detection")
	}
}

func TestChatMiddleware_EvaluateUserMessage_EmitsEvents(t *testing.T) {
	var emittedEvents []string
	emitFn := func(name string, data interface{}) {
		emittedEvents = append(emittedEvents, name)
	}

	mw := NewChatMiddleware(nil, false, emitFn)

	// Use a message with a GitHub token — should trigger chat-pii-secrets rule.
	mw.EvaluateUserMessage(context.Background(), "test-session",
		"Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl")

	if len(emittedEvents) == 0 {
		t.Error("expected events to be emitted on rule match")
	}

	foundWarning := false
	for _, name := range emittedEvents {
		if name == "chat:safety_warning" {
			foundWarning = true
		}
	}
	if !foundWarning {
		t.Error("expected chat:safety_warning event")
	}
}

func TestChatMiddleware_EvaluateAssistantResponse_PIIScan(t *testing.T) {
	mw := NewChatMiddleware(nil, true, nil)

	eval := mw.EvaluateAssistantResponse(context.Background(), "test-session",
		"Here is your key: AKIAIOSFODNN7EXAMPLE")

	if !eval.PIIDetected {
		t.Error("expected PII detected in assistant response")
	}
}

func TestChatMiddleware_EvaluateAssistantResponse_NoPII(t *testing.T) {
	mw := NewChatMiddleware(nil, true, nil)

	eval := mw.EvaluateAssistantResponse(context.Background(), "test-session",
		"To create a component, use React.createElement or JSX syntax.")

	if eval.PIIDetected {
		t.Error("expected no PII in clean response")
	}
}

func TestChatMiddleware_PIIScanDisabled(t *testing.T) {
	mw := NewChatMiddleware(nil, false, nil) // PII scan disabled

	eval := mw.EvaluateUserMessage(context.Background(), "test-session",
		"My key is AKIAIOSFODNN7EXAMPLE")

	// Should still get warnings from chat rules (pattern match).
	if len(eval.Warnings) == 0 {
		t.Error("expected warnings from chat rules even with PII scan disabled")
	}

	// But PII scan should not run.
	if eval.PIIDetected {
		t.Error("PII scan should not run when disabled")
	}
}

func TestChatMiddleware_StreamEventHook(t *testing.T) {
	var emittedEvents []string
	emitFn := func(name string, data interface{}) {
		emittedEvents = append(emittedEvents, name)
	}

	mw := NewChatMiddleware(nil, true, emitFn)
	hook := mw.StreamEventHook()

	if hook == nil {
		t.Fatal("expected non-nil hook function")
	}
}
