// Author: Subash Karki
package persona

import (
	"context"
	"strings"
	"sync"
	"testing"
)

// stubPrefs is a minimal in-memory PrefGetter + PrefSetter for tests.
type stubPrefs struct {
	mu   sync.RWMutex
	data map[string]string
}

func newStubPrefs() *stubPrefs {
	return &stubPrefs{data: make(map[string]string)}
}

func (s *stubPrefs) GetPreference(key string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data[key]
}

func (s *stubPrefs) SetPreference(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = value
	return nil
}

// mockAIFn returns a mock ClaudeFn for tests that avoids calling the real Claude CLI.
func mockAIFn() ClaudeFn {
	return func(_ context.Context, prompt, _ string) (string, error) {
		return "Mock AI response for: " + prompt[:min(50, len(prompt))], nil
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// testDeps returns PersonaDeps with a mock AI function for fast tests.
func testDeps() PersonaDeps {
	return PersonaDeps{AICallFn: mockAIFn()}
}

func TestNewPersona(t *testing.T) {
	p := NewPersona(testDeps())
	if p == nil {
		t.Fatal("expected non-nil Persona")
	}
	state := p.GetState()
	if state.PillState != PillIdle {
		t.Errorf("expected PillIdle, got %q", state.PillState)
	}
	if state.StatusText != "Ready" {
		t.Errorf("expected StatusText=Ready, got %q", state.StatusText)
	}
}

func TestPersona_Ask_StateLookup(t *testing.T) {
	p := NewPersona(testDeps())
	ctx := context.Background()

	resp := p.Ask(ctx, "what is claude doing")
	if resp.Text == "" {
		t.Error("expected non-empty response text")
	}

	history := p.GetHistory()
	if len(history) != 2 {
		t.Fatalf("expected 2 messages (user+assistant), got %d", len(history))
	}
	if history[0].Role != "user" {
		t.Errorf("expected first message role=user, got %q", history[0].Role)
	}
	if history[1].Role != "assistant" {
		t.Errorf("expected second message role=assistant, got %q", history[1].Role)
	}
}

func TestPersona_Ask_TrustBlocked(t *testing.T) {
	prefs := newStubPrefs()
	p := NewPersona(PersonaDeps{
		PrefGetter: prefs,
		PrefSetter: prefs,
		AICallFn:   mockAIFn(),
	})
	ctx := context.Background()

	// Set active project so trust checks apply.
	p.SetProjectPath("/test/project")

	// "start claude" is LaneClaudeTask, requires TierClaude (2) — blocked at TierObserve (0).
	resp := p.Ask(ctx, "start claude with auth refactor")
	if resp.Text != "That action requires a higher trust tier for this project." {
		t.Errorf("expected trust-blocked response, got %q", resp.Text)
	}
}

func TestPersona_Ask_TrustAllowed(t *testing.T) {
	prefs := newStubPrefs()
	p := NewPersona(PersonaDeps{
		PrefGetter: prefs,
		PrefSetter: prefs,
		AICallFn:   mockAIFn(),
	})
	ctx := context.Background()

	p.SetProjectPath("/test/project")
	_ = p.SetTrust("/test/project", TierTerminal)

	resp := p.Ask(ctx, "open a terminal")
	// Should NOT be the trust-blocked message.
	if resp.Text == "That action requires a higher trust tier for this project." {
		t.Error("expected handler response but got trust-blocked")
	}
}

func TestPersona_Ask_AIFallback(t *testing.T) {
	p := NewPersona(testDeps())
	ctx := context.Background()

	// "explain the code" routes to the "ai" handler. Without a working claude
	// binary in CI, it returns a graceful degradation message.
	resp := p.Ask(ctx, "explain the code")
	if resp.Text == "" {
		t.Error("expected non-empty response from AI fallback")
	}
	// It should not say "I don't have a handler" — the ai handler is registered.
	if strings.Contains(resp.Text, "I don't have a handler") {
		t.Errorf("expected ai handler to be registered, got: %q", resp.Text)
	}
}

func TestPersona_SetProjectPath(t *testing.T) {
	p := NewPersona(testDeps())
	p.SetProjectPath("/home/user/myproject")

	state := p.GetState()
	if state.ActiveProject != "/home/user/myproject" {
		t.Errorf("expected /home/user/myproject, got %q", state.ActiveProject)
	}
}

func TestPersona_GetContext_EmptyDeps(t *testing.T) {
	p := NewPersona(testDeps())
	ctx := context.Background()

	pc := p.GetContext(ctx)
	if pc.ClaudeSessions == nil {
		t.Error("expected non-nil ClaudeSessions")
	}
	if pc.TerminalSessions == nil {
		t.Error("expected non-nil TerminalSessions")
	}
}

func TestPersona_HistoryCap(t *testing.T) {
	p := NewPersona(testDeps())
	ctx := context.Background()

	// Ask more than maxHistory/2 times (each Ask adds 2 messages).
	for i := 0; i < 60; i++ {
		p.Ask(ctx, "what is claude doing")
	}
	history := p.GetHistory()
	if len(history) > maxHistory {
		t.Errorf("history exceeded cap: %d > %d", len(history), maxHistory)
	}
}

func TestPersona_EmitFnCalled(t *testing.T) {
	var mu sync.Mutex
	emitted := make(map[string]int)
	p := NewPersona(PersonaDeps{
		EmitFn: func(name string, _ interface{}) {
			mu.Lock()
			emitted[name]++
			mu.Unlock()
		},
		AICallFn: mockAIFn(),
	})
	ctx := context.Background()

	p.Ask(ctx, "what is claude doing")

	mu.Lock()
	defer mu.Unlock()
	if emitted["persona:state"] == 0 {
		t.Error("expected persona:state events to be emitted")
	}
	if emitted["persona:response"] == 0 {
		t.Error("expected persona:response event to be emitted")
	}
}

func TestPersona_NilSafety(t *testing.T) {
	var p *Persona

	// All methods on nil must not panic and return safe defaults.
	state := p.GetState()
	if state.PillState != PillIdle {
		t.Errorf("expected PillIdle from nil, got %q", state.PillState)
	}

	history := p.GetHistory()
	if history == nil || len(history) != 0 {
		t.Error("expected empty non-nil history from nil Persona")
	}

	ctx := context.Background()
	pc := p.GetContext(ctx)
	if pc.ActiveProject != "" {
		t.Errorf("expected empty ActiveProject from nil, got %q", pc.ActiveProject)
	}

	resp := p.Ask(ctx, "hello")
	if resp.Text == "" {
		t.Error("expected non-empty fallback text from nil Persona.Ask")
	}

	tier := p.GetTrust("any")
	if tier != TierObserve {
		t.Errorf("expected TierObserve from nil, got %d", tier)
	}

	err := p.SetTrust("any", TierClaude)
	if err != nil {
		t.Errorf("expected nil error from nil SetTrust, got %v", err)
	}

	// SetProjectPath on nil must not panic.
	p.SetProjectPath("/test")
}
