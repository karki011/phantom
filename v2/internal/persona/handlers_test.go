// Author: Subash Karki
package persona

import (
	"context"
	"strings"
	"testing"
)

// containsAny returns true if s (lowercased) contains any of the given substrings.
func containsAny(s string, subs ...string) bool {
	lower := strings.ToLower(s)
	for _, sub := range subs {
		if strings.Contains(lower, strings.ToLower(sub)) {
			return true
		}
	}
	return false
}

// newNilEngine returns a ContextEngine with no deps (all lookups return zero values).
func newNilEngine() *ContextEngine {
	return NewContextEngine(ContextDeps{})
}

func TestStatusHandler_ClaudeStatus_NoSessions(t *testing.T) {
	h := NewStatusHandler(newNilEngine())
	intent := Intent{
		Lane:    LaneStateLookup,
		Handler: "status",
		Method:  "claudeStatus",
		Args:    map[string]string{},
		Raw:     "what is claude doing",
	}
	resp := h.Handle(context.Background(), intent, "")
	if resp.Text == "" {
		t.Fatal("expected non-empty response text")
	}
	if !containsAny(resp.Text, "no", "0") {
		t.Errorf("expected response to indicate no sessions, got: %q", resp.Text)
	}
}

func TestStatusHandler_TerminalCount_Zero(t *testing.T) {
	h := NewStatusHandler(newNilEngine())
	intent := Intent{
		Lane:    LaneStateLookup,
		Handler: "status",
		Method:  "terminalCount",
		Args:    map[string]string{},
		Raw:     "how many terminals",
	}
	resp := h.Handle(context.Background(), intent, "")
	if resp.Text == "" {
		t.Fatal("expected non-empty response text")
	}
	if !containsAny(resp.Text, "no", "0") {
		t.Errorf("expected response to indicate zero terminals, got: %q", resp.Text)
	}
}

func TestGitHandler_Status_NoGit(t *testing.T) {
	h := NewGitHandler(newNilEngine())
	intent := Intent{
		Lane:    LaneStateLookup,
		Handler: "git",
		Method:  "query",
		Args:    map[string]string{"type": "status"},
		Raw:     "git status",
	}
	// Use a temp path that definitely has no git repo.
	resp := h.Handle(context.Background(), intent, "/tmp")
	if resp.Text == "" {
		t.Fatal("expected non-empty response text")
	}
}

func TestGitHandler_RecentChanges_NoGit(t *testing.T) {
	h := NewGitHandler(newNilEngine())
	intent := Intent{
		Lane:    LaneStateLookup,
		Handler: "git",
		Method:  "recentChanges",
		Args:    map[string]string{},
		Raw:     "what changed",
	}
	resp := h.Handle(context.Background(), intent, "/tmp")
	if resp.Text == "" {
		t.Fatal("expected non-empty response text")
	}
}

func TestSearchHandler_EmptyQuery(t *testing.T) {
	h := NewSearchHandler(newNilEngine())
	intent := Intent{
		Lane:    LaneStateLookup,
		Handler: "search",
		Method:  "search",
		Args:    map[string]string{"query": ""},
		Raw:     "search for",
	}
	resp := h.Handle(context.Background(), intent, "")
	if resp.Text == "" {
		t.Fatal("expected non-empty response text")
	}
}
