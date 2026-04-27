// context_injector_test.go tests the ContextInjector strategy.
// Author: Subash Karki
package strategies

import (
	"strings"
	"testing"
)

func TestFormatEnrichedPrompt(t *testing.T) {
	context := "[Project]\nType: go\nBuild: go"
	message := "How do I run the tests?"

	result := formatEnrichedPrompt(context, message)

	if !strings.Contains(result, "<codebase-context>") {
		t.Error("expected codebase-context opening tag")
	}
	if !strings.Contains(result, "</codebase-context>") {
		t.Error("expected codebase-context closing tag")
	}
	if !strings.Contains(result, "Type: go") {
		t.Error("expected context content")
	}
	if !strings.HasSuffix(result, message) {
		t.Error("expected user message at end")
	}
}

func TestContextInjector_NilProvider(t *testing.T) {
	ci := NewContextInjector(nil)
	result := ci.Enrich(nil, "session-1", "hello")

	if result.HasContext {
		t.Error("expected no context with nil provider")
	}
	if result.EnrichedPrompt != "hello" {
		t.Errorf("expected original message, got %q", result.EnrichedPrompt)
	}
	if result.OriginalPrompt != "hello" {
		t.Errorf("expected original prompt preserved, got %q", result.OriginalPrompt)
	}
}
