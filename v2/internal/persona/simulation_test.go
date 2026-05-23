// Author: Subash Karki
package persona

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/git"
)

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

// simPersona creates a Persona with stub prefs, optional mock git deps, and an
// event capture callback. Returns the persona, prefs, and captured events map.
func simPersona(deps *ContextDeps) (*Persona, *stubPrefs, map[string]int) {
	prefs := newStubPrefs()

	var mu sync.Mutex
	emitted := make(map[string]int)

	pd := PersonaDeps{
		PrefGetter: prefs,
		PrefSetter: prefs,
		EmitFn: func(name string, _ interface{}) {
			mu.Lock()
			emitted[name]++
			mu.Unlock()
		},
		AICallFn: mockAIFn(),
	}
	if deps != nil {
		pd.ContextDeps = *deps
	}

	return NewPersona(pd), prefs, emitted
}

// simContains checks that resp.Text (lowercased) contains ALL given substrings.
func simContains(t *testing.T, resp Response, subs ...string) {
	t.Helper()
	lower := strings.ToLower(resp.Text)
	for _, sub := range subs {
		if !strings.Contains(lower, strings.ToLower(sub)) {
			t.Errorf("expected response to contain %q, got:\n  %s", sub, resp.Text)
		}
	}
}

// simNotContains checks that resp.Text (lowercased) does NOT contain any of the given substrings.
func simNotContains(t *testing.T, resp Response, subs ...string) {
	t.Helper()
	lower := strings.ToLower(resp.Text)
	for _, sub := range subs {
		if strings.Contains(lower, strings.ToLower(sub)) {
			t.Errorf("expected response NOT to contain %q, got:\n  %s", sub, resp.Text)
		}
	}
}

// simNonEmpty checks that resp.Text is not empty.
func simNonEmpty(t *testing.T, resp Response) {
	t.Helper()
	if resp.Text == "" {
		t.Error("expected non-empty response")
	}
}

// mockGitDeps returns ContextDeps with mock git functions that return
// predictable data: branch "main", 2 staged, 1 unstaged, 3 commits.
func mockGitDeps() ContextDeps {
	return ContextDeps{
		GitStatusFn: func(_ context.Context, _ string) (*git.RepoStatus, error) {
			return &git.RepoStatus{
				Branch:  "main",
				IsClean: false,
				Staged: []git.FileStatus{
					{Path: "auth.go", Status: "M"},
					{Path: "server.go", Status: "A"},
				},
				Unstaged: []git.FileStatus{
					{Path: "readme.md", Status: "M"},
				},
				Untracked: nil,
			}, nil
		},
		GitLogFn: func(_ context.Context, _ string, _ int) ([]git.CommitInfo, error) {
			return []git.CommitInfo{
				{ShortHash: "abc1234", Subject: "feat: add auth", Author: "Subash"},
				{ShortHash: "def5678", Subject: "fix: login bug", Author: "Subash"},
				{ShortHash: "ghi9012", Subject: "chore: cleanup", Author: "Subash"},
			}, nil
		},
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Query Routing Simulation
//
// All queries now go through the "ai" handler (except Claude control:
// start/pause/stop/resume). The mock AI function returns a non-empty string
// starting with "Mock AI response for: ...". Tests verify:
//   - response is not "I don't have a handler"
//   - response is non-empty
//
// Tests that need to verify specific data content call handlers DIRECTLY.
// ──────────────────────────────────────────────────────────────────────────────

func TestSim_QueryRouting_ClaudeStatus(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "what is claude doing")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_ClaudeStatusCaseInsensitive(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "What is Claude doing?")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_ClaudeStatusTypoTolerant(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "what is calude doing")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_GitStatus(t *testing.T) {
	deps := mockGitDeps()
	p, _, _ := simPersona(&deps)
	p.SetProjectPath("/mock/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "git status")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_GitLog(t *testing.T) {
	deps := mockGitDeps()
	p, _, _ := simPersona(&deps)
	p.SetProjectPath("/mock/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "git log")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_GitDiff(t *testing.T) {
	deps := mockGitDeps()
	p, _, _ := simPersona(&deps)
	p.SetProjectPath("/mock/project")
	ctx := context.Background()

	// "git diff" routes to ai handler — verify it was handled.
	resp := p.Ask(ctx, "git diff")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_WhatChanged(t *testing.T) {
	deps := mockGitDeps()
	p, _, _ := simPersona(&deps)
	p.SetProjectPath("/mock/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "what changed")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_HowManyTerminals(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "how many terminals are open")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_HowManyTerminalsPartial(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "how many terminals")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_SearchForAuthentication(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "search for authentication")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_FindUserService(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "find user service")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

// "open a terminal" now routes to the "ai" handler (LaneLocalReasoning, TierObserve).
// Trust blocking ONLY applies to Claude control actions (start/pause/stop/resume).
func TestSim_QueryRouting_OpenTerminal_AIHandler(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "open a terminal")
	// Routes to AI handler — non-empty, no trust block.
	simNotContains(t, resp, "I don't have a handler")
	simNotContains(t, resp, "trust tier")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_OpenTerminalShort_AIHandler(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "open terminal")
	simNotContains(t, resp, "I don't have a handler")
	simNotContains(t, resp, "trust tier")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_RunCommand_AIHandler(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "run npm test")
	simNotContains(t, resp, "I don't have a handler")
	simNotContains(t, resp, "trust tier")
	simNonEmpty(t, resp)
}

// Claude control actions (start/pause/stop/resume) ARE still trust-blocked.
func TestSim_QueryRouting_StartClaude_TrustBlocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "start claude with auth refactor")
	simContains(t, resp, "trust tier")
}

func TestSim_QueryRouting_HelpMeWith_TrustBlocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "help me with auth refactor")
	simContains(t, resp, "trust tier")
}

func TestSim_QueryRouting_PauseClaude_TrustBlocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "pause claude")
	// pause claude is LaneClaudeTask, requires TierClaude (2)
	simContains(t, resp, "trust tier")
}

func TestSim_QueryRouting_StopClaude_TrustBlocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "stop claude")
	simContains(t, resp, "trust tier")
}

func TestSim_QueryRouting_ResumeClaude_TrustBlocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "resume claude")
	simContains(t, resp, "trust tier")
}

// "switch to project" now routes to AI handler — not trust-blocked.
func TestSim_QueryRouting_SwitchProject_AIHandler(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	resp := p.Ask(ctx, "switch to project phantom")
	simNotContains(t, resp, "I don't have a handler")
	simNonEmpty(t, resp)
}

func TestSim_QueryRouting_WhyBuildFail_AIHandler(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "why did the build fail")
	simNotContains(t, resp, "I don't have a handler")
	// AI handler is registered; without a working claude binary it degrades gracefully.
	if resp.Text == "" {
		t.Error("expected non-empty response from AI handler")
	}
}

func TestSim_QueryRouting_ExplainError_AIHandler(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "explain this error")
	simNotContains(t, resp, "I don't have a handler")
	if resp.Text == "" {
		t.Error("expected non-empty response from AI handler")
	}
}

func TestSim_QueryRouting_Summarize_AIHandler(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "summarize the changes")
	simNotContains(t, resp, "I don't have a handler")
	if resp.Text == "" {
		t.Error("expected non-empty response from AI handler")
	}
}

func TestSim_QueryRouting_Gibberish_AIHandler(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "random gibberish xyzzy")
	simNotContains(t, resp, "I don't have a handler")
	// AI handler returns a response (either from Claude or graceful degradation).
	if resp.Text == "" {
		t.Error("expected non-empty response from AI handler")
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Trust Tier Simulation
//
// Only Claude control actions (start/pause/stop/resume) require elevated trust.
// All other queries (including "open a terminal", "run command", "switch project")
// now go to the AI handler at TierObserve — they are NOT blocked.
// ──────────────────────────────────────────────────────────────────────────────

func TestSim_TrustTier_Tier0_ObserveWorks(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	// All non-claude-control queries work at tier 0 (AI handler, LaneLocalReasoning).
	resp := p.Ask(ctx, "what is claude doing")
	simNotContains(t, resp, "trust tier")

	resp = p.Ask(ctx, "how many terminals")
	simNotContains(t, resp, "trust tier")
}

func TestSim_TrustTier_Tier0_ClaudeControlBlocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	// Only ClaudeTask lane actions are blocked at tier 0.
	resp := p.Ask(ctx, "start claude")
	simContains(t, resp, "trust tier")
}

func TestSim_TrustTier_Tier1_TerminalUnblocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	_ = p.SetTrust("/test/project", TierTerminal)
	ctx := context.Background()

	// "open a terminal" routes to AI handler at tier 0 anyway — works at any tier.
	resp := p.Ask(ctx, "open a terminal")
	simNotContains(t, resp, "trust tier")
	simNonEmpty(t, resp)
}

func TestSim_TrustTier_Tier1_ClaudeStillBlocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	_ = p.SetTrust("/test/project", TierTerminal)
	ctx := context.Background()

	resp := p.Ask(ctx, "start claude")
	simContains(t, resp, "trust tier")
}

func TestSim_TrustTier_Tier2_ClaudeUnblocked(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	_ = p.SetTrust("/test/project", TierClaude)
	ctx := context.Background()

	// Claude actions should pass trust check at tier 2.
	// Without a ComposerMgr, the handler will say "Composer not available" or similar.
	resp := p.Ask(ctx, "start claude")
	simNotContains(t, resp, "trust tier")
}

func TestSim_TrustTier_Tier2_TerminalAlsoWorks(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	_ = p.SetTrust("/test/project", TierClaude) // tier 2 >= tier 1
	ctx := context.Background()

	resp := p.Ask(ctx, "open a terminal")
	simNotContains(t, resp, "trust tier")
}

func TestSim_TrustTier_Tier3_EverythingWorks(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	_ = p.SetTrust("/test/project", TierGit)
	ctx := context.Background()

	// All queries should pass trust
	queries := []string{
		"what is claude doing",
		"open a terminal",
		"start claude",
		"switch to project phantom",
	}
	for _, q := range queries {
		resp := p.Ask(ctx, q)
		if strings.Contains(strings.ToLower(resp.Text), "trust tier") {
			t.Errorf("at tier 3, %q should not be trust-blocked, got: %s", q, resp.Text)
		}
	}
}

func TestSim_TrustTier_ProgressiveEscalation(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/test/project")
	ctx := context.Background()

	// Tier 0: Claude control blocked, AI queries work
	resp := p.Ask(ctx, "start claude")
	simContains(t, resp, "trust tier")

	// "open a terminal" goes to AI handler — not blocked at any tier
	resp = p.Ask(ctx, "open a terminal")
	simNotContains(t, resp, "trust tier")

	// Upgrade to tier 1: Claude still blocked
	_ = p.SetTrust("/test/project", TierTerminal)
	resp = p.Ask(ctx, "start claude")
	simContains(t, resp, "trust tier")

	// Upgrade to tier 2: Claude unblocked
	_ = p.SetTrust("/test/project", TierClaude)
	resp = p.Ask(ctx, "start claude")
	simNotContains(t, resp, "trust tier")

	// Upgrade to tier 3: everything works
	_ = p.SetTrust("/test/project", TierGit)
	resp = p.Ask(ctx, "pause claude")
	simNotContains(t, resp, "trust tier")
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Conversation History Simulation
// ──────────────────────────────────────────────────────────────────────────────

func TestSim_History_FiveQuestions(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	questions := []string{
		"what is claude doing",
		"how many terminals",
		"git status",
		"what changed",
		"explain this error",
	}
	for _, q := range questions {
		p.Ask(ctx, q)
	}

	history := p.GetHistory()
	if len(history) != 10 {
		t.Fatalf("expected 10 messages (5 user + 5 assistant), got %d", len(history))
	}

	// Verify alternating user/assistant pattern.
	for i, msg := range history {
		expectedRole := "user"
		if i%2 == 1 {
			expectedRole = "assistant"
		}
		if msg.Role != expectedRole {
			t.Errorf("message[%d]: expected role=%q, got %q", i, expectedRole, msg.Role)
		}
	}
}

func TestSim_History_MessageOrdering(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	p.Ask(ctx, "what is claude doing")
	p.Ask(ctx, "how many terminals")

	history := p.GetHistory()
	if len(history) != 4 {
		t.Fatalf("expected 4 messages, got %d", len(history))
	}

	// First pair
	if history[0].Role != "user" || !strings.Contains(history[0].Text, "what is claude doing") {
		t.Errorf("message[0] unexpected: role=%q text=%q", history[0].Role, history[0].Text)
	}
	if history[1].Role != "assistant" {
		t.Errorf("message[1] expected assistant, got %q", history[1].Role)
	}
	// Second pair
	if history[2].Role != "user" || !strings.Contains(history[2].Text, "how many terminals") {
		t.Errorf("message[2] unexpected: role=%q text=%q", history[2].Role, history[2].Text)
	}
	if history[3].Role != "assistant" {
		t.Errorf("message[3] expected assistant, got %q", history[3].Role)
	}

	// Verify timestamps are monotonically non-decreasing.
	for i := 1; i < len(history); i++ {
		if history[i].Timestamp.Before(history[i-1].Timestamp) {
			t.Errorf("message[%d] timestamp %v is before message[%d] timestamp %v",
				i, history[i].Timestamp, i-1, history[i-1].Timestamp)
		}
	}
}

func TestSim_History_CapsAt100(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	// Each Ask adds 2 messages. 60 asks = 120 messages attempted, capped to 100.
	for i := 0; i < 60; i++ {
		p.Ask(ctx, "what is claude doing")
	}

	history := p.GetHistory()
	if len(history) > maxHistory {
		t.Errorf("history exceeded maxHistory cap: %d > %d", len(history), maxHistory)
	}
	if len(history) != maxHistory {
		t.Errorf("expected exactly %d messages after overflow, got %d", maxHistory, len(history))
	}

	// After trimming, the oldest messages should have been dropped.
	// The remaining messages should still alternate user/assistant.
	// The trim slices from the end, so the last message should be "assistant".
	if history[len(history)-1].Role != "assistant" {
		t.Errorf("last message should be assistant, got %q", history[len(history)-1].Role)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. State Transitions Simulation
// ──────────────────────────────────────────────────────────────────────────────

func TestSim_State_InitialIdle(t *testing.T) {
	p, _, _ := simPersona(nil)
	state := p.GetState()
	if state.PillState != PillIdle {
		t.Errorf("expected initial state PillIdle, got %q", state.PillState)
	}
	if state.StatusText != "Ready" {
		t.Errorf("expected initial status 'Ready', got %q", state.StatusText)
	}
}

func TestSim_State_ReturnsToIdleAfterAsk(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	p.Ask(ctx, "what is claude doing")
	state := p.GetState()
	if state.PillState != PillIdle {
		t.Errorf("expected PillIdle after Ask, got %q", state.PillState)
	}
	if state.StatusText != "Ready" {
		t.Errorf("expected StatusText=Ready after Ask, got %q", state.StatusText)
	}
}

func TestSim_State_EmitsStateEvents(t *testing.T) {
	var mu sync.Mutex
	var stateSequence []PillState

	prefs := newStubPrefs()
	p := NewPersona(PersonaDeps{
		PrefGetter: prefs,
		PrefSetter: prefs,
		AICallFn:   mockAIFn(),
		EmitFn: func(name string, data interface{}) {
			if name == "persona:state" {
				if s, ok := data.(PersonaState); ok {
					mu.Lock()
					stateSequence = append(stateSequence, s.PillState)
					mu.Unlock()
				}
			}
		},
	})
	ctx := context.Background()

	p.Ask(ctx, "what is claude doing")

	mu.Lock()
	defer mu.Unlock()

	// Expect at least: listening → speaking → idle
	if len(stateSequence) < 3 {
		t.Fatalf("expected at least 3 state transitions, got %d: %v", len(stateSequence), stateSequence)
	}

	// First transition should be listening
	if stateSequence[0] != PillListening {
		t.Errorf("first state should be listening, got %q", stateSequence[0])
	}
	// Should have speaking somewhere
	foundSpeaking := false
	for _, s := range stateSequence {
		if s == PillSpeaking {
			foundSpeaking = true
			break
		}
	}
	if !foundSpeaking {
		t.Errorf("expected speaking state in sequence: %v", stateSequence)
	}
	// Last should be idle
	if stateSequence[len(stateSequence)-1] != PillIdle {
		t.Errorf("last state should be idle, got %q", stateSequence[len(stateSequence)-1])
	}
}

func TestSim_State_SetProjectPathUpdates(t *testing.T) {
	p, _, _ := simPersona(nil)
	p.SetProjectPath("/home/user/my-project")

	state := p.GetState()
	if state.ActiveProject != "/home/user/my-project" {
		t.Errorf("expected ActiveProject=/home/user/my-project, got %q", state.ActiveProject)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. Context Engine with Mock Data
//
// These tests call handlers DIRECTLY (not through Persona.Ask) to verify data
// correctness, since Ask now routes everything through the AI handler which
// returns a generic mock response.
// ──────────────────────────────────────────────────────────────────────────────

func TestSim_Context_GitStatusWithMockData(t *testing.T) {
	deps := mockGitDeps()
	engine := NewContextEngine(deps)
	ctx := context.Background()

	handler := NewGitHandler(engine)
	intent := Intent{
		Lane:    LaneLocalReasoning,
		Handler: "git",
		Method:  "query",
		Args:    map[string]string{"type": "status"},
		Raw:     "git status",
	}
	resp := handler.Handle(ctx, intent, "/mock/project")

	// Should report branch main and staged count.
	simContains(t, resp, "main")
	simContains(t, resp, "staged")
}

func TestSim_Context_GitLogWithMockData(t *testing.T) {
	deps := mockGitDeps()
	engine := NewContextEngine(deps)
	ctx := context.Background()

	handler := NewGitHandler(engine)
	intent := Intent{
		Lane:    LaneLocalReasoning,
		Handler: "git",
		Method:  "query",
		Args:    map[string]string{"type": "log"},
		Raw:     "git log",
	}
	resp := handler.Handle(ctx, intent, "/mock/project")

	// Should contain commit info from mocks.
	simContains(t, resp, "commit")
	simContains(t, resp, "abc1234")
	simContains(t, resp, "feat: add auth")
}

func TestSim_Context_WhatChangedWithMockData(t *testing.T) {
	deps := mockGitDeps()
	engine := NewContextEngine(deps)
	ctx := context.Background()

	handler := NewGitHandler(engine)
	intent := Intent{
		Lane:    LaneLocalReasoning,
		Handler: "git",
		Method:  "recentChanges",
		Args:    map[string]string{},
		Raw:     "what changed",
	}
	resp := handler.Handle(ctx, intent, "/mock/project")

	// recentChanges should report total file changes and commit count.
	simContains(t, resp, "file")
	simContains(t, resp, "3")      // 3 commits
	simContains(t, resp, "commit") // "commit(s)"
}

func TestSim_Context_GitSummaryFieldsCorrect(t *testing.T) {
	deps := mockGitDeps()
	engine := NewContextEngine(deps)
	ctx := context.Background()

	summary := engine.GitSummary(ctx, "/mock/project")

	if summary.Branch != "main" {
		t.Errorf("expected branch=main, got %q", summary.Branch)
	}
	if summary.IsClean {
		t.Error("expected IsClean=false")
	}
	if summary.Staged != 2 {
		t.Errorf("expected Staged=2, got %d", summary.Staged)
	}
	if summary.Unstaged != 1 {
		t.Errorf("expected Unstaged=1, got %d", summary.Unstaged)
	}
	if summary.Untracked != 0 {
		t.Errorf("expected Untracked=0, got %d", summary.Untracked)
	}
	if len(summary.RecentCommits) != 3 {
		t.Errorf("expected 3 commits, got %d", len(summary.RecentCommits))
	}
	if summary.RecentCommits[0].Hash != "abc1234" {
		t.Errorf("expected first commit hash=abc1234, got %q", summary.RecentCommits[0].Hash)
	}
	if summary.RecentCommits[0].Author != "Subash" {
		t.Errorf("expected first commit author=Subash, got %q", summary.RecentCommits[0].Author)
	}
}

func TestSim_Context_GitSummaryEmptyPathReturnsZero(t *testing.T) {
	deps := mockGitDeps()
	engine := NewContextEngine(deps)
	ctx := context.Background()

	summary := engine.GitSummary(ctx, "")
	if summary.Branch != "" {
		t.Errorf("expected empty branch for empty path, got %q", summary.Branch)
	}
}

func TestSim_Context_AssembleIntegration(t *testing.T) {
	deps := mockGitDeps()
	engine := NewContextEngine(deps)
	ctx := context.Background()

	pc := engine.Assemble(ctx, "/mock/project", "")
	if pc.ActiveProject != "/mock/project" {
		t.Errorf("expected ActiveProject=/mock/project, got %q", pc.ActiveProject)
	}
	if pc.RecentGit.Branch != "main" {
		t.Errorf("expected git branch=main, got %q", pc.RecentGit.Branch)
	}
	if pc.RecentGit.Staged != 2 {
		t.Errorf("expected staged=2, got %d", pc.RecentGit.Staged)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. Edge Cases
// ──────────────────────────────────────────────────────────────────────────────

func TestSim_Edge_EmptyInput(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "")
	// Should not panic, should return some response
	if resp.Text == "" {
		t.Error("expected non-empty response for empty input")
	}
}

func TestSim_Edge_LongInput(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	// 1500 characters of input
	longInput := strings.Repeat("a", 1500)
	resp := p.Ask(ctx, longInput)
	if resp.Text == "" {
		t.Error("expected non-empty response for long input")
	}
}

func TestSim_Edge_SpecialCharacters(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	specialInputs := []string{
		"what is claude doing? 😀🚀",
		"git status\n\twith newlines",
		"<script>alert('xss')</script>",
		"search for auth && rm -rf /",
		"what's up with 100% cpu?",
		"null \x00 byte",
	}

	for _, input := range specialInputs {
		resp := p.Ask(ctx, input)
		if resp.Text == "" {
			t.Errorf("expected non-empty response for special input %q", input[:20])
		}
	}
}

func TestSim_Edge_RapidSequentialAsks(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	// 10 rapid sequential asks
	for i := 0; i < 10; i++ {
		resp := p.Ask(ctx, "what is claude doing")
		if resp.Text == "" {
			t.Errorf("ask %d returned empty text", i)
		}
	}

	history := p.GetHistory()
	if len(history) != 20 {
		t.Errorf("expected 20 messages after 10 asks, got %d", len(history))
	}

	// Final state should be idle
	state := p.GetState()
	if state.PillState != PillIdle {
		t.Errorf("expected idle after rapid asks, got %q", state.PillState)
	}
}

func TestSim_Edge_ConcurrentAsks(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp := p.Ask(ctx, "what is claude doing")
			if resp.Text == "" {
				t.Error("concurrent ask returned empty text")
			}
		}()
	}
	wg.Wait()

	// Should not panic, history should have entries
	history := p.GetHistory()
	if len(history) == 0 {
		t.Error("expected non-empty history after concurrent asks")
	}
}

func TestSim_Edge_NilPersona(t *testing.T) {
	var p *Persona

	// All methods must not panic.
	state := p.GetState()
	if state.PillState != PillIdle {
		t.Errorf("expected PillIdle from nil Persona, got %q", state.PillState)
	}

	history := p.GetHistory()
	if len(history) != 0 {
		t.Errorf("expected empty history from nil Persona, got %d", len(history))
	}

	ctx := context.Background()
	resp := p.Ask(ctx, "hello")
	if resp.Text == "" {
		t.Error("expected non-empty response from nil Persona")
	}

	p.SetProjectPath("/test")
	_ = p.SetTrust("any", TierClaude)
	tier := p.GetTrust("any")
	if tier != TierObserve {
		t.Errorf("expected TierObserve from nil Persona, got %d", tier)
	}

	pc := p.GetContext(ctx)
	if pc.ActiveProject != "" {
		t.Errorf("expected empty ActiveProject from nil Persona, got %q", pc.ActiveProject)
	}
}

func TestSim_Edge_WhitespaceOnlyInput(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	resp := p.Ask(ctx, "   \t\n  ")
	if resp.Text == "" {
		t.Error("expected non-empty response for whitespace-only input")
	}
}

func TestSim_Edge_RepeatedIdenticalQueries(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	var responses []string
	for i := 0; i < 5; i++ {
		resp := p.Ask(ctx, "what is claude doing")
		responses = append(responses, resp.Text)
	}

	// All responses to the same question should be consistent
	for i := 1; i < len(responses); i++ {
		if responses[i] != responses[0] {
			t.Errorf("response[%d] differs from response[0]:\n  [0]: %s\n  [%d]: %s",
				i, responses[0], i, responses[i])
		}
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Integration: Full conversation simulation
// ──────────────────────────────────────────────────────────────────────────────

func TestSim_FullConversation(t *testing.T) {
	deps := mockGitDeps()
	p, _, _ := simPersona(&deps)
	p.SetProjectPath("/mock/project")
	ctx := context.Background()

	// All queries now go to AI handler — verify non-empty, no "don't have a handler".
	steps := []string{
		"what is claude doing",
		"git status",
		"what changed",
		"how many terminals",
		"git log",
	}

	for _, input := range steps {
		resp := p.Ask(ctx, input)
		if resp.Text == "" {
			t.Errorf("step %q: expected non-empty response", input)
		}
		if strings.Contains(strings.ToLower(resp.Text), "i don't have a handler") {
			t.Errorf("step %q: got unexpected 'no handler' response: %s", input, resp.Text)
		}
	}

	// Verify full history is intact.
	history := p.GetHistory()
	expectedLen := len(steps) * 2
	if len(history) != expectedLen {
		t.Errorf("expected %d history entries, got %d", expectedLen, len(history))
	}

	// Verify state is idle at the end.
	state := p.GetState()
	if state.PillState != PillIdle {
		t.Errorf("expected idle after conversation, got %q", state.PillState)
	}
}

func TestSim_TrustEscalation_FullFlow(t *testing.T) {
	deps := mockGitDeps()
	p, _, _ := simPersona(&deps)
	projectID := "/mock/project"
	p.SetProjectPath(projectID)
	ctx := context.Background()

	// Phase 1: Observe (tier 0) — AI queries work, Claude control blocked.
	resp := p.Ask(ctx, "git status")
	simNotContains(t, resp, "trust tier")
	simNonEmpty(t, resp)

	resp = p.Ask(ctx, "start claude")
	simContains(t, resp, "trust tier")

	// Phase 2: Terminal (tier 1) — Claude control still blocked.
	_ = p.SetTrust(projectID, TierTerminal)
	resp = p.Ask(ctx, "open a terminal")
	simNotContains(t, resp, "trust tier")

	resp = p.Ask(ctx, "start claude")
	simContains(t, resp, "trust tier")

	// Phase 3: Claude (tier 2) — Claude control unblocked.
	_ = p.SetTrust(projectID, TierClaude)
	resp = p.Ask(ctx, "pause claude")
	simNotContains(t, resp, "trust tier")

	// Phase 4: Git (tier 3) — everything works.
	_ = p.SetTrust(projectID, TierGit)
	resp = p.Ask(ctx, "stop claude")
	simNotContains(t, resp, "trust tier")
}

func TestSim_HistoryTimestamps(t *testing.T) {
	p, _, _ := simPersona(nil)
	ctx := context.Background()

	before := time.Now()
	p.Ask(ctx, "what is claude doing")
	after := time.Now()

	history := p.GetHistory()
	if len(history) < 2 {
		t.Fatalf("expected at least 2 messages, got %d", len(history))
	}

	for i, msg := range history {
		if msg.Timestamp.Before(before) {
			t.Errorf("message[%d] timestamp %v is before test start %v", i, msg.Timestamp, before)
		}
		if msg.Timestamp.After(after) {
			t.Errorf("message[%d] timestamp %v is after test end %v", i, msg.Timestamp, after)
		}
	}
}
