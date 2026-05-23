# Phantom Persona Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the working foundation of Phantom Persona — Context Engine, Smart Router, Observe handlers, and Top Bar Pill UI — so the app can answer workspace questions like "What is Claude doing?" in <50ms via text input.

**Architecture:** Layer 1 (Context Engine) reads existing v2 services (session watcher, terminal manager, git, file graph). Layer 3 (Smart Router) classifies intent via keyword matching and dispatches to Layer 2 handlers. Layer 4 (PersonaPill + Dropdown) lives in the title bar. Voice, Claude Runtime, and LLM integration are separate follow-on plans.

**Tech Stack:** Go 1.25, SolidJS, Wails v2, vanilla-extract CSS, SQLite

**Codebase:** `/Users/subash.karki/phantom-os/v2`

---

## File Map

### Go Backend — New Files

| File | Responsibility |
|---|---|
| `internal/persona/types.go` | Shared types: PersonaState, Intent, Response, PersonaContext |
| `internal/persona/context.go` | Unified query layer over existing signals |
| `internal/persona/router.go` | Intent classification + handler dispatch |
| `internal/persona/handlers.go` | Handler interface + observe-tier implementations (status, git, search, workspace) |
| `internal/persona/persona.go` | Main Persona service: lifecycle, event subscriptions, Wails bindings |
| `internal/persona/trust.go` | Progressive trust tier management |
| `internal/persona/context_test.go` | Tests for context engine |
| `internal/persona/router_test.go` | Tests for intent classification |
| `internal/persona/handlers_test.go` | Tests for all handlers |
| `internal/persona/persona_test.go` | Integration tests |
| `internal/app/bindings_persona.go` | Wails bindings that delegate to Persona service |

### Go Backend — Modified Files

| File | Change |
|---|---|
| `internal/app/app.go` | Add `Persona` field + `SetPersona()` setter |
| `internal/app/events.go` | Add persona event constants |
| `main.go` | Wire Persona service in startup sequence |

### Frontend — New Files

| File | Responsibility |
|---|---|
| `frontend/src/core/persona/types.ts` | TypeScript types mirroring Go types |
| `frontend/src/core/persona/signals.ts` | SolidJS signals for persona state |
| `frontend/src/core/persona/bindings.ts` | Wails binding wrappers |
| `frontend/src/components/persona/PersonaPill.tsx` | Top bar status pill |
| `frontend/src/components/persona/PersonaPill.css.ts` | Pill styles (vanilla-extract) |
| `frontend/src/components/persona/PersonaDropdown.tsx` | Expanded chat/status panel |
| `frontend/src/components/persona/PersonaDropdown.css.ts` | Dropdown styles |
| `frontend/src/components/persona/PersonaInput.tsx` | Text input for queries |
| `frontend/src/components/persona/PersonaMessage.tsx` | Response message bubbles |
| `frontend/src/components/persona/PersonaQuickActions.tsx` | Contextual action chips |

### Frontend — Modified Files

| File | Change |
|---|---|
| `frontend/src/components/layout/WindowDragStrip.tsx` | Insert `<PersonaPill>` in center strip |

---

## Task 1: Go Types + Package Scaffold

**Files:**
- Create: `internal/persona/types.go`

- [ ] **Step 1: Create the persona package with shared types**

```go
// Author: Subash Karki
package persona

import "time"

type PillState string

const (
	PillIdle      PillState = "idle"
	PillObserving PillState = "observing"
	PillAttention PillState = "attention"
	PillListening PillState = "listening"
	PillSpeaking  PillState = "speaking"
)

type TrustTier int

const (
	TierObserve  TrustTier = 0
	TierTerminal TrustTier = 1
	TierClaude   TrustTier = 2
	TierGit      TrustTier = 3
)

type Lane string

const (
	LaneStateLookup   Lane = "state_lookup"
	LaneLocalReasoning Lane = "local_reasoning"
	LaneClaudeTask    Lane = "claude_task"
	LaneSystemAction  Lane = "system_action"
)

type Intent struct {
	Lane    Lane
	Handler string
	Method  string
	Args    map[string]string
	Raw     string
}

type Response struct {
	Text       string `json:"text"`
	Speak      string `json:"speak"`
	QuickActions []QuickAction `json:"quickActions,omitempty"`
}

type QuickAction struct {
	Label  string `json:"label"`
	Action string `json:"action"`
	Args   map[string]string `json:"args,omitempty"`
}

type PersonaState struct {
	PillState    PillState `json:"pillState"`
	StatusText   string    `json:"statusText"`
	ActiveProject string   `json:"activeProject"`
	Expanded     bool      `json:"expanded"`
}

type ClaudeSessionStatus struct {
	SessionID   string `json:"sessionId"`
	ProjectPath string `json:"projectPath"`
	LiveState   string `json:"liveState"`
	LastTool    string `json:"lastTool"`
	FilesChanged int   `json:"filesChanged"`
	StartedAt   time.Time `json:"startedAt"`
}

type TerminalStatus struct {
	ID       string `json:"id"`
	CWD      string `json:"cwd"`
	Attached bool   `json:"attached"`
	Title    string `json:"title"`
}

type GitSummary struct {
	Branch     string   `json:"branch"`
	IsClean    bool     `json:"isClean"`
	Staged     int      `json:"staged"`
	Unstaged   int      `json:"unstaged"`
	Untracked  int      `json:"untracked"`
	RecentCommits []CommitSummary `json:"recentCommits"`
}

type CommitSummary struct {
	Hash    string `json:"hash"`
	Message string `json:"message"`
	Author  string `json:"author"`
	When    time.Time `json:"when"`
}

type GraphSummary struct {
	FileCount   int `json:"fileCount"`
	SymbolCount int `json:"symbolCount"`
	EdgeCount   int `json:"edgeCount"`
}

type PersonaContext struct {
	ActiveProject    string                `json:"activeProject"`
	ClaudeSessions   []ClaudeSessionStatus `json:"claudeSessions"`
	TerminalSessions []TerminalStatus      `json:"terminalSessions"`
	RecentGit        GitSummary            `json:"recentGit"`
	FileGraph        GraphSummary          `json:"fileGraph"`
}

type Message struct {
	Role      string    `json:"role"`
	Text      string    `json:"text"`
	Timestamp time.Time `json:"timestamp"`
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/subash.karki/phantom-os/v2 && go build ./internal/persona/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add internal/persona/types.go
git commit -m "feat(persona): add types package scaffold"
```

---

## Task 2: Context Engine

**Files:**
- Create: `internal/persona/context.go`
- Create: `internal/persona/context_test.go`

- [ ] **Step 1: Write tests for the context engine**

```go
// Author: Subash Karki
package persona

import (
	"context"
	"testing"
)

func TestContextEngine_ClaudeSessions_EmptyWhenNoWatcher(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	ctx := context.Background()
	sessions := ce.ClaudeSessions(ctx, "")
	if sessions == nil {
		t.Fatal("expected empty slice, got nil")
	}
	if len(sessions) != 0 {
		t.Fatalf("expected 0 sessions, got %d", len(sessions))
	}
}

func TestContextEngine_TerminalSessions_EmptyWhenNoManager(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	ctx := context.Background()
	sessions := ce.TerminalSessions(ctx)
	if len(sessions) != 0 {
		t.Fatalf("expected 0 sessions, got %d", len(sessions))
	}
}

func TestContextEngine_GitSummary_EmptyWhenNoGit(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	ctx := context.Background()
	summary := ce.GitSummary(ctx, "/nonexistent")
	if summary.Branch != "" {
		t.Fatalf("expected empty branch, got %q", summary.Branch)
	}
}

func TestContextEngine_GraphSummary_ZeroWhenNoIndexer(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	summary := ce.GraphSummary("")
	if summary.FileCount != 0 {
		t.Fatalf("expected 0 files, got %d", summary.FileCount)
	}
}

func TestContextEngine_Assemble_ReturnsAllFields(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	ctx := context.Background()
	pc := ce.Assemble(ctx, "/some/project", "")
	if pc.ActiveProject != "/some/project" {
		t.Fatalf("expected project path, got %q", pc.ActiveProject)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/persona/ -run TestContextEngine -v`
Expected: FAIL — `NewContextEngine` undefined

- [ ] **Step 3: Implement context engine**

```go
// Author: Subash Karki
package persona

import (
	"context"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/collector"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	gitpkg "github.com/subashkarki/phantom-os-v2/internal/git"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
)

type ContextDeps struct {
	DB               *db.DB
	Terminal         *terminal.Manager
	CollectorReg     *collector.Registry
	FileIndexers     map[string]*filegraph.Indexer
	GitStatusFn      func(ctx context.Context, path string) (*gitpkg.RepoStatus, error)
	GitLogFn         func(ctx context.Context, path string, limit int) ([]gitpkg.CommitInfo, error)
}

type ContextEngine struct {
	deps ContextDeps
}

func NewContextEngine(deps ContextDeps) *ContextEngine {
	return &ContextEngine{deps: deps}
}

func (ce *ContextEngine) ClaudeSessions(ctx context.Context, projectFilter string) []ClaudeSessionStatus {
	if ce.deps.DB == nil {
		return []ClaudeSessionStatus{}
	}
	queries := db.New(ce.deps.DB.Reader)
	rows, err := queries.ListActiveSessions(ctx)
	if err != nil {
		return []ClaudeSessionStatus{}
	}
	var result []ClaudeSessionStatus
	for _, r := range rows {
		if projectFilter != "" && !strings.HasPrefix(r.ProjectPath, projectFilter) {
			continue
		}
		result = append(result, ClaudeSessionStatus{
			SessionID:   r.SessionID,
			ProjectPath: r.ProjectPath,
			LiveState:   r.Status,
			LastTool:    r.LastToolName,
		})
	}
	if result == nil {
		return []ClaudeSessionStatus{}
	}
	return result
}

func (ce *ContextEngine) TerminalSessions(ctx context.Context) []TerminalStatus {
	if ce.deps.Terminal == nil {
		return []TerminalStatus{}
	}
	list := ce.deps.Terminal.List()
	result := make([]TerminalStatus, 0, len(list))
	for _, s := range list {
		result = append(result, TerminalStatus{
			ID:       s.ID,
			CWD:      s.CWD,
			Attached: s.Attached,
			Title:    s.Title,
		})
	}
	return result
}

func (ce *ContextEngine) GitSummary(ctx context.Context, repoPath string) GitSummary {
	if ce.deps.GitStatusFn == nil || repoPath == "" {
		return GitSummary{}
	}
	status, err := ce.deps.GitStatusFn(ctx, repoPath)
	if err != nil {
		return GitSummary{}
	}
	summary := GitSummary{
		Branch:    status.Branch,
		IsClean:   status.IsClean,
		Staged:    len(status.Staged),
		Unstaged:  len(status.Unstaged),
		Untracked: len(status.Untracked),
	}
	if ce.deps.GitLogFn != nil {
		commits, err := ce.deps.GitLogFn(ctx, repoPath, 5)
		if err == nil {
			for _, c := range commits {
				summary.RecentCommits = append(summary.RecentCommits, CommitSummary{
					Hash:    c.Hash,
					Message: c.Message,
					Author:  c.Author,
					When:    c.When,
				})
			}
		}
	}
	return summary
}

func (ce *ContextEngine) GraphSummary(projectCwd string) GraphSummary {
	if ce.deps.FileIndexers == nil {
		return GraphSummary{}
	}
	for _, ix := range ce.deps.FileIndexers {
		if strings.HasPrefix(projectCwd, ix.RootDir()) {
			fc, sc, ec := ix.Graph().Stats()
			return GraphSummary{FileCount: fc, SymbolCount: sc, EdgeCount: ec}
		}
	}
	return GraphSummary{}
}

func (ce *ContextEngine) Assemble(ctx context.Context, projectPath, worktreeID string) PersonaContext {
	return PersonaContext{
		ActiveProject:    projectPath,
		ClaudeSessions:   ce.ClaudeSessions(ctx, projectPath),
		TerminalSessions: ce.TerminalSessions(ctx),
		RecentGit:        ce.GitSummary(ctx, projectPath),
		FileGraph:        ce.GraphSummary(projectPath),
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/persona/ -run TestContextEngine -v`
Expected: PASS (all 5 tests — nil deps return safe empty defaults)

- [ ] **Step 5: Commit**

```bash
git add internal/persona/context.go internal/persona/context_test.go
git commit -m "feat(persona): add context engine with safe nil-dep defaults"
```

---

## Task 3: Smart Router

**Files:**
- Create: `internal/persona/router.go`
- Create: `internal/persona/router_test.go`

- [ ] **Step 1: Write router tests**

```go
// Author: Subash Karki
package persona

import "testing"

func TestRouter_ClaudeStatusQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("what is claude doing")
	if intent.Handler != "status" || intent.Method != "claudeStatus" {
		t.Fatalf("expected status.claudeStatus, got %s.%s", intent.Handler, intent.Method)
	}
	if intent.Lane != LaneStateLookup {
		t.Fatalf("expected state_lookup lane, got %s", intent.Lane)
	}
}

func TestRouter_GitStatusQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("git status")
	if intent.Handler != "git" || intent.Method != "query" {
		t.Fatalf("expected git.query, got %s.%s", intent.Handler, intent.Method)
	}
	if intent.Args["type"] != "status" {
		t.Fatalf("expected type=status, got %q", intent.Args["type"])
	}
}

func TestRouter_GitLogQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("show me git log")
	if intent.Handler != "git" || intent.Args["type"] != "log" {
		t.Fatalf("expected git.query type=log, got %s.%s type=%s", intent.Handler, intent.Method, intent.Args["type"])
	}
}

func TestRouter_OpenTerminal(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("open a terminal")
	if intent.Handler != "terminal" || intent.Method != "open" {
		t.Fatalf("expected terminal.open, got %s.%s", intent.Handler, intent.Method)
	}
	if intent.Lane != LaneSystemAction {
		t.Fatalf("expected system_action lane, got %s", intent.Lane)
	}
}

func TestRouter_WhatChanged(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("what changed")
	if intent.Handler != "git" || intent.Method != "recentChanges" {
		t.Fatalf("expected git.recentChanges, got %s.%s", intent.Handler, intent.Method)
	}
}

func TestRouter_WhyDidBuildFail(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("why did the build fail")
	if intent.Lane != LaneLocalReasoning {
		t.Fatalf("expected local_reasoning lane, got %s", intent.Lane)
	}
}

func TestRouter_SearchQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("search for authentication")
	if intent.Handler != "search" || intent.Args["query"] != "authentication" {
		t.Fatalf("expected search handler with query=authentication, got %s query=%q", intent.Handler, intent.Args["query"])
	}
}

func TestRouter_UnknownFallsToReasoning(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("explain the trade-offs of microservices vs monolith")
	if intent.Lane != LaneLocalReasoning {
		t.Fatalf("expected local_reasoning for unknown input, got %s", intent.Lane)
	}
}

func TestRouter_CaseInsensitive(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("What Is Claude Doing?")
	if intent.Handler != "status" {
		t.Fatalf("expected status handler for mixed case, got %s", intent.Handler)
	}
}

func TestRouter_HowManyTerminals(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("how many terminals are open")
	if intent.Handler != "status" || intent.Method != "terminalCount" {
		t.Fatalf("expected status.terminalCount, got %s.%s", intent.Handler, intent.Method)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/persona/ -run TestRouter -v`
Expected: FAIL — `NewRouter` undefined

- [ ] **Step 3: Implement the router**

```go
// Author: Subash Karki
package persona

import (
	"regexp"
	"strings"
)

type rule struct {
	pattern *regexp.Regexp
	lane    Lane
	handler string
	method  string
	argExtractors map[string]int // capture group index → arg name
}

type Router struct {
	rules []rule
}

func NewRouter() *Router {
	r := &Router{}
	r.rules = []rule{
		// Claude status
		{
			pattern: regexp.MustCompile(`(?i)what\s+is\s+claude\s+doing`),
			lane: LaneStateLookup, handler: "status", method: "claudeStatus",
		},
		{
			pattern: regexp.MustCompile(`(?i)claude\s+status`),
			lane: LaneStateLookup, handler: "status", method: "claudeStatus",
		},
		// Terminal count
		{
			pattern: regexp.MustCompile(`(?i)how\s+many\s+terminal`),
			lane: LaneStateLookup, handler: "status", method: "terminalCount",
		},
		// Git queries
		{
			pattern: regexp.MustCompile(`(?i)git\s+(status|log|diff|blame)`),
			lane: LaneStateLookup, handler: "git", method: "query",
			argExtractors: map[string]int{"type": 1},
		},
		{
			pattern: regexp.MustCompile(`(?i)what\s+changed`),
			lane: LaneStateLookup, handler: "git", method: "recentChanges",
		},
		{
			pattern: regexp.MustCompile(`(?i)show\s+(me\s+)?git\s+(status|log|diff|blame)`),
			lane: LaneStateLookup, handler: "git", method: "query",
			argExtractors: map[string]int{"type": 2},
		},
		// Terminal actions
		{
			pattern: regexp.MustCompile(`(?i)open\s+(a\s+)?(terminal|tab|shell)`),
			lane: LaneSystemAction, handler: "terminal", method: "open",
		},
		{
			pattern: regexp.MustCompile(`(?i)^run\s+(.+)`),
			lane: LaneSystemAction, handler: "terminal", method: "runCommand",
			argExtractors: map[string]int{"command": 1},
		},
		// Search
		{
			pattern: regexp.MustCompile(`(?i)(?:search|find)\s+(?:for\s+)?(.+)`),
			lane: LaneStateLookup, handler: "search", method: "search",
			argExtractors: map[string]int{"query": 1},
		},
		// Workspace
		{
			pattern: regexp.MustCompile(`(?i)switch\s+to\s+(?:project\s+)?(.+)`),
			lane: LaneSystemAction, handler: "workspace", method: "switchProject",
			argExtractors: map[string]int{"project": 1},
		},
		// Claude task spawn
		{
			pattern: regexp.MustCompile(`(?i)(?:start\s+claude|help\s+me\s+with)\s*(.+)?`),
			lane: LaneClaudeTask, handler: "claude", method: "spawn",
			argExtractors: map[string]int{"task": 1},
		},
		// Failure analysis (must be before generic patterns)
		{
			pattern: regexp.MustCompile(`(?i)why\s+did\s+.*\s*fail`),
			lane: LaneLocalReasoning, handler: "llm", method: "analyzeFailure",
		},
		{
			pattern: regexp.MustCompile(`(?i)(?:explain|summarize|describe)\s+.+`),
			lane: LaneLocalReasoning, handler: "llm", method: "reason",
		},
	}
	return r
}

func (r *Router) Classify(input string) Intent {
	trimmed := strings.TrimSpace(input)
	for _, rule := range r.rules {
		matches := rule.pattern.FindStringSubmatch(trimmed)
		if matches == nil {
			continue
		}
		intent := Intent{
			Lane:    rule.lane,
			Handler: rule.handler,
			Method:  rule.method,
			Args:    make(map[string]string),
			Raw:     trimmed,
		}
		for argName, groupIdx := range rule.argExtractors {
			if groupIdx < len(matches) {
				intent.Args[argName] = strings.TrimSpace(matches[groupIdx])
			}
		}
		return intent
	}
	return Intent{
		Lane:    LaneLocalReasoning,
		Handler: "llm",
		Method:  "reason",
		Args:    map[string]string{"query": trimmed},
		Raw:     trimmed,
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/persona/ -run TestRouter -v`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add internal/persona/router.go internal/persona/router_test.go
git commit -m "feat(persona): add smart router with keyword intent classification"
```

---

## Task 4: Observe Handlers

**Files:**
- Create: `internal/persona/handlers.go`
- Create: `internal/persona/handlers_test.go`

- [ ] **Step 1: Write handler tests**

```go
// Author: Subash Karki
package persona

import (
	"context"
	"testing"
)

func TestStatusHandler_ClaudeStatus_NoSessions(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	h := NewStatusHandler(ce)
	resp := h.Handle(context.Background(), Intent{Method: "claudeStatus"}, "")
	if resp.Text == "" {
		t.Fatal("expected non-empty response")
	}
	if !containsAny(resp.Text, "no claude", "no active", "not running") {
		t.Fatalf("expected idle message, got %q", resp.Text)
	}
}

func TestStatusHandler_TerminalCount_Zero(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	h := NewStatusHandler(ce)
	resp := h.Handle(context.Background(), Intent{Method: "terminalCount"}, "")
	if !containsAny(resp.Text, "no terminal", "0 terminal") {
		t.Fatalf("expected zero terminals message, got %q", resp.Text)
	}
}

func TestGitHandler_Status_NoGit(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	h := NewGitHandler(ce)
	resp := h.Handle(context.Background(), Intent{Method: "query", Args: map[string]string{"type": "status"}}, "/tmp")
	if resp.Text == "" {
		t.Fatal("expected non-empty response")
	}
}

func TestGitHandler_RecentChanges_NoGit(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	h := NewGitHandler(ce)
	resp := h.Handle(context.Background(), Intent{Method: "recentChanges"}, "/tmp")
	if resp.Text == "" {
		t.Fatal("expected non-empty response")
	}
}

func TestSearchHandler_EmptyQuery(t *testing.T) {
	ce := NewContextEngine(ContextDeps{})
	h := NewSearchHandler(ce)
	resp := h.Handle(context.Background(), Intent{Method: "search", Args: map[string]string{"query": ""}}, "")
	if resp.Text == "" {
		t.Fatal("expected non-empty response for empty query")
	}
}

func containsAny(s string, subs ...string) bool {
	lower := strings.ToLower(s)
	for _, sub := range subs {
		if strings.Contains(lower, sub) {
			return true
		}
	}
	return false
}
```

Note: add `"strings"` to imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/persona/ -run "TestStatusHandler|TestGitHandler|TestSearchHandler" -v`
Expected: FAIL — handler types undefined

- [ ] **Step 3: Implement handlers**

```go
// Author: Subash Karki
package persona

import (
	"context"
	"fmt"
	"strings"
)

type Handler interface {
	Handle(ctx context.Context, intent Intent, projectPath string) Response
}

// StatusHandler answers queries about Claude sessions and terminal state.
type StatusHandler struct {
	ctx *ContextEngine
}

func NewStatusHandler(ce *ContextEngine) *StatusHandler {
	return &StatusHandler{ctx: ce}
}

func (h *StatusHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	switch intent.Method {
	case "claudeStatus":
		return h.claudeStatus(ctx, projectPath)
	case "terminalCount":
		return h.terminalCount(ctx)
	default:
		return Response{Text: "I'm not sure what status you're asking about."}
	}
}

func (h *StatusHandler) claudeStatus(ctx context.Context, projectPath string) Response {
	sessions := h.ctx.ClaudeSessions(ctx, projectPath)
	if len(sessions) == 0 {
		return Response{
			Text:  "No active Claude sessions right now.",
			Speak: "No Claude sessions running.",
		}
	}
	var lines []string
	for _, s := range sessions {
		line := fmt.Sprintf("Session %s: %s", s.SessionID[:8], s.LiveState)
		if s.LastTool != "" {
			line += fmt.Sprintf(" (last tool: %s)", s.LastTool)
		}
		lines = append(lines, line)
	}
	text := fmt.Sprintf("%d Claude session(s) active:\n%s", len(sessions), strings.Join(lines, "\n"))
	speak := fmt.Sprintf("%d Claude sessions active.", len(sessions))
	if len(sessions) == 1 {
		speak = fmt.Sprintf("Claude is %s.", sessions[0].LiveState)
	}
	return Response{Text: text, Speak: speak}
}

func (h *StatusHandler) terminalCount(ctx context.Context) Response {
	terminals := h.ctx.TerminalSessions(ctx)
	count := len(terminals)
	if count == 0 {
		return Response{Text: "No terminals open.", Speak: "No terminals open."}
	}
	text := fmt.Sprintf("%d terminal(s) open.", count)
	return Response{Text: text, Speak: text}
}

// GitHandler answers git-related queries.
type GitHandler struct {
	ctx *ContextEngine
}

func NewGitHandler(ce *ContextEngine) *GitHandler {
	return &GitHandler{ctx: ce}
}

func (h *GitHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	switch intent.Method {
	case "query":
		return h.query(ctx, intent.Args["type"], projectPath)
	case "recentChanges":
		return h.recentChanges(ctx, projectPath)
	default:
		return Response{Text: "I'm not sure what git info you need."}
	}
}

func (h *GitHandler) query(ctx context.Context, qType, projectPath string) Response {
	summary := h.ctx.GitSummary(ctx, projectPath)
	if summary.Branch == "" {
		return Response{Text: "No git repository detected for the active project."}
	}
	switch qType {
	case "status":
		if summary.IsClean {
			return Response{
				Text:  fmt.Sprintf("On branch %s. Working tree is clean.", summary.Branch),
				Speak: fmt.Sprintf("Branch %s is clean.", summary.Branch),
			}
		}
		return Response{
			Text: fmt.Sprintf("On branch %s. %d staged, %d unstaged, %d untracked.",
				summary.Branch, summary.Staged, summary.Unstaged, summary.Untracked),
			Speak: fmt.Sprintf("Branch %s has %d staged and %d unstaged changes.",
				summary.Branch, summary.Staged, summary.Unstaged),
		}
	case "log":
		if len(summary.RecentCommits) == 0 {
			return Response{Text: "No recent commits found."}
		}
		var lines []string
		for _, c := range summary.RecentCommits {
			lines = append(lines, fmt.Sprintf("%s %s — %s", c.Hash[:7], c.Message, c.Author))
		}
		return Response{
			Text:  fmt.Sprintf("Recent commits on %s:\n%s", summary.Branch, strings.Join(lines, "\n")),
			Speak: fmt.Sprintf("%d recent commits on %s.", len(summary.RecentCommits), summary.Branch),
		}
	default:
		return Response{Text: fmt.Sprintf("Git %s query not yet supported.", qType)}
	}
}

func (h *GitHandler) recentChanges(ctx context.Context, projectPath string) Response {
	summary := h.ctx.GitSummary(ctx, projectPath)
	if summary.Branch == "" {
		return Response{Text: "No git repository detected."}
	}
	total := summary.Staged + summary.Unstaged + summary.Untracked
	if total == 0 && len(summary.RecentCommits) == 0 {
		return Response{Text: "Nothing has changed.", Speak: "No changes detected."}
	}
	var parts []string
	if total > 0 {
		parts = append(parts, fmt.Sprintf("%d file(s) changed in working tree", total))
	}
	if len(summary.RecentCommits) > 0 {
		parts = append(parts, fmt.Sprintf("%d recent commit(s)", len(summary.RecentCommits)))
	}
	text := strings.Join(parts, ". ") + "."
	return Response{Text: text, Speak: text}
}

// SearchHandler answers file graph and symbol queries.
type SearchHandler struct {
	ctx *ContextEngine
}

func NewSearchHandler(ce *ContextEngine) *SearchHandler {
	return &SearchHandler{ctx: ce}
}

func (h *SearchHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	query := intent.Args["query"]
	if query == "" {
		return Response{Text: "What would you like to search for?"}
	}
	gs := h.ctx.GraphSummary(projectPath)
	if gs.FileCount == 0 {
		return Response{Text: fmt.Sprintf("File graph is empty for this project. Try searching after the indexer finishes.")}
	}
	return Response{
		Text: fmt.Sprintf("Searching for %q across %d indexed files...", query, gs.FileCount),
	}
}

// WorkspaceHandler answers project/workspace queries.
type WorkspaceHandler struct{}

func NewWorkspaceHandler() *WorkspaceHandler {
	return &WorkspaceHandler{}
}

func (h *WorkspaceHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	switch intent.Method {
	case "switchProject":
		project := intent.Args["project"]
		return Response{Text: fmt.Sprintf("Switching to project %q is not yet enabled. Unlock the terminal tier first.", project)}
	default:
		return Response{Text: "I'm not sure what workspace action you need."}
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/persona/ -run "TestStatusHandler|TestGitHandler|TestSearchHandler" -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add internal/persona/handlers.go internal/persona/handlers_test.go
git commit -m "feat(persona): add observe-tier handlers (status, git, search, workspace)"
```

---

## Task 5: Trust Tier Manager

**Files:**
- Create: `internal/persona/trust.go`

- [ ] **Step 1: Implement trust tier manager**

```go
// Author: Subash Karki
package persona

import (
	"fmt"
	"sync"
)

type PrefGetter interface {
	GetPreference(key string) string
}

type PrefSetter interface {
	SetPreference(key, value string) error
}

type TrustManager struct {
	mu    sync.RWMutex
	tiers map[string]TrustTier // projectID → max unlocked tier
	prefs PrefGetter
	save  PrefSetter
}

func NewTrustManager(prefs PrefGetter, save PrefSetter) *TrustManager {
	return &TrustManager{
		tiers: make(map[string]TrustTier),
		prefs: prefs,
		save:  save,
	}
}

func (tm *TrustManager) GetTier(projectID string) TrustTier {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	if tier, ok := tm.tiers[projectID]; ok {
		return tier
	}
	if tm.prefs != nil {
		val := tm.prefs.GetPreference(fmt.Sprintf("persona_trust_%s", projectID))
		switch val {
		case "1":
			return TierTerminal
		case "2":
			return TierClaude
		case "3":
			return TierGit
		}
	}
	return TierObserve
}

func (tm *TrustManager) SetTier(projectID string, tier TrustTier) error {
	tm.mu.Lock()
	tm.tiers[projectID] = tier
	tm.mu.Unlock()
	if tm.save != nil {
		return tm.save.SetPreference(
			fmt.Sprintf("persona_trust_%s", projectID),
			fmt.Sprintf("%d", tier),
		)
	}
	return nil
}

func (tm *TrustManager) IsAllowed(projectID string, requiredTier TrustTier) bool {
	return tm.GetTier(projectID) >= requiredTier
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/subash.karki/phantom-os/v2 && go build ./internal/persona/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add internal/persona/trust.go
git commit -m "feat(persona): add progressive trust tier manager"
```

---

## Task 6: Persona Service + Wails Bindings

**Files:**
- Create: `internal/persona/persona.go`
- Create: `internal/app/bindings_persona.go`
- Modify: `internal/app/app.go` — add Persona field
- Modify: `internal/app/events.go` — add persona events

- [ ] **Step 1: Add persona events to events.go**

Add after the last event constant in `internal/app/events.go`:

```go
EventPersonaState     = "persona:state"
EventPersonaResponse  = "persona:response"
```

- [ ] **Step 2: Add Persona field to App struct in app.go**

Add to the App struct fields (after `ComposerV2Bind`):

```go
Persona *persona.Persona
```

Add a setter method (after the existing setter methods):

```go
func (a *App) SetPersona(p *persona.Persona) { a.Persona = p }
```

Add the import for `"github.com/subashkarki/phantom-os-v2/internal/persona"`.

- [ ] **Step 3: Create the Persona service**

```go
// Author: Subash Karki
package persona

import (
	"context"
	"sync"
	"time"
)

type Persona struct {
	mu       sync.RWMutex
	state    PersonaState
	ctx      *ContextEngine
	router   *Router
	trust    *TrustManager
	handlers map[string]Handler
	history  []Message
	emitFn   func(eventName string, data interface{})

	projectPath string
}

type PersonaDeps struct {
	ContextDeps ContextDeps
	Prefs       PrefGetter
	PrefSave    PrefSetter
	EmitFn      func(eventName string, data interface{})
}

func NewPersona(deps PersonaDeps) *Persona {
	ce := NewContextEngine(deps.ContextDeps)
	trust := NewTrustManager(deps.Prefs, deps.PrefSave)
	router := NewRouter()

	p := &Persona{
		state: PersonaState{PillState: PillIdle, StatusText: "Phantom"},
		ctx:     ce,
		router:  router,
		trust:   trust,
		handlers: make(map[string]Handler),
		emitFn:  deps.EmitFn,
	}

	p.handlers["status"] = NewStatusHandler(ce)
	p.handlers["git"] = NewGitHandler(ce)
	p.handlers["search"] = NewSearchHandler(ce)
	p.handlers["workspace"] = NewWorkspaceHandler()

	return p
}

func (p *Persona) SetProjectPath(path string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.projectPath = path
}

func (p *Persona) GetState() PersonaState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state
}

func (p *Persona) updateState(pill PillState, text string) {
	p.mu.Lock()
	p.state.PillState = pill
	p.state.StatusText = text
	state := p.state
	p.mu.Unlock()
	if p.emitFn != nil {
		p.emitFn("persona:state", state)
	}
}

func (p *Persona) Ask(ctx context.Context, input string) Response {
	p.mu.Lock()
	p.history = append(p.history, Message{Role: "user", Text: input, Timestamp: time.Now()})
	projectPath := p.projectPath
	p.mu.Unlock()

	intent := p.router.Classify(input)

	requiredTier := TierObserve
	switch intent.Handler {
	case "terminal":
		requiredTier = TierTerminal
	case "claude":
		requiredTier = TierClaude
	case "git":
		if intent.Method != "query" && intent.Method != "recentChanges" {
			requiredTier = TierGit
		}
	}

	if !p.trust.IsAllowed(projectPath, requiredTier) {
		resp := Response{
			Text:  "That action requires a higher trust tier. Enable it in Settings → Persona.",
			Speak: "That action is not yet enabled for this project.",
		}
		p.recordResponse(resp)
		return resp
	}

	handler, ok := p.handlers[intent.Handler]
	if !ok {
		resp := Response{
			Text:  "I'm not sure how to help with that yet.",
			Speak: "I don't know how to do that yet.",
		}
		p.recordResponse(resp)
		return resp
	}

	resp := handler.Handle(ctx, intent, projectPath)
	p.recordResponse(resp)
	return resp
}

func (p *Persona) recordResponse(resp Response) {
	p.mu.Lock()
	p.history = append(p.history, Message{Role: "phantom", Text: resp.Text, Timestamp: time.Now()})
	if len(p.history) > 100 {
		p.history = p.history[len(p.history)-100:]
	}
	p.mu.Unlock()
	if p.emitFn != nil {
		p.emitFn("persona:response", resp)
	}
}

func (p *Persona) GetHistory() []Message {
	p.mu.RLock()
	defer p.mu.RUnlock()
	result := make([]Message, len(p.history))
	copy(result, p.history)
	return result
}

func (p *Persona) GetContext(ctx context.Context) PersonaContext {
	p.mu.RLock()
	projectPath := p.projectPath
	p.mu.RUnlock()
	return p.ctx.Assemble(ctx, projectPath, "")
}

func (p *Persona) SetTrust(projectID string, tier TrustTier) error {
	return p.trust.SetTier(projectID, tier)
}

func (p *Persona) GetTrust(projectID string) TrustTier {
	return p.trust.GetTier(projectID)
}
```

- [ ] **Step 4: Create Wails bindings**

```go
// Author: Subash Karki
package app

import "context"

func (a *App) PersonaAsk(input string) map[string]interface{} {
	if a.Persona == nil {
		return map[string]interface{}{"text": "Persona not initialized.", "speak": ""}
	}
	resp := a.Persona.Ask(context.Background(), input)
	return map[string]interface{}{
		"text":         resp.Text,
		"speak":        resp.Speak,
		"quickActions": resp.QuickActions,
	}
}

func (a *App) PersonaGetState() map[string]interface{} {
	if a.Persona == nil {
		return map[string]interface{}{"pillState": "idle", "statusText": "Phantom"}
	}
	s := a.Persona.GetState()
	return map[string]interface{}{
		"pillState":     string(s.PillState),
		"statusText":    s.StatusText,
		"activeProject": s.ActiveProject,
		"expanded":      s.Expanded,
	}
}

func (a *App) PersonaGetHistory() interface{} {
	if a.Persona == nil {
		return []interface{}{}
	}
	return a.Persona.GetHistory()
}

func (a *App) PersonaGetContext() interface{} {
	if a.Persona == nil {
		return map[string]interface{}{}
	}
	return a.Persona.GetContext(context.Background())
}

func (a *App) PersonaSetTrust(projectID string, tier int) error {
	if a.Persona == nil {
		return nil
	}
	return a.Persona.SetTrust(projectID, persona.TrustTier(tier))
}

func (a *App) PersonaGetTrust(projectID string) int {
	if a.Persona == nil {
		return 0
	}
	return int(a.Persona.GetTrust(projectID))
}
```

Add import `"github.com/subashkarki/phantom-os-v2/internal/persona"` at top.

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/subash.karki/phantom-os/v2 && go build ./...`
Expected: no errors (bindings_persona.go may warn about unused import — the import is needed once Persona is wired in main.go)

- [ ] **Step 6: Commit**

```bash
git add internal/persona/persona.go internal/app/bindings_persona.go
git add -p internal/app/app.go internal/app/events.go
git commit -m "feat(persona): add Persona service with Wails bindings and event constants"
```

---

## Task 7: Wire Persona into main.go

**Files:**
- Modify: `main.go`

- [ ] **Step 1: Find the startup wiring section in main.go**

Look for where services like Composer, Terminal, Stream are created and passed to `app.Set*()`. Add Persona wiring after the existing services.

- [ ] **Step 2: Add Persona initialization**

Add after the existing service wiring (near where `app.SetComposer` or similar is called):

```go
personaSvc := persona.NewPersona(persona.PersonaDeps{
    ContextDeps: persona.ContextDeps{
        DB:           database,
        Terminal:     termMgr,
        FileIndexers: app.FileIndexers(),
        GitStatusFn: func(ctx context.Context, path string) (*git.RepoStatus, error) {
            return git.StatusFast(ctx, path)
        },
        GitLogFn: func(ctx context.Context, path string, limit int) ([]git.CommitInfo, error) {
            return git.LogFast(ctx, path, limit)
        },
    },
    Prefs:    app,
    PrefSave: app,
    EmitFn: func(eventName string, data interface{}) {
        wailsRuntime.EventsEmit(app.Ctx(), eventName, data)
    },
})
app.SetPersona(personaSvc)
```

Add imports for `"github.com/subashkarki/phantom-os-v2/internal/persona"`.

Note: exact variable names (`database`, `termMgr`, `app`) depend on what exists in main.go — read the file first and adapt to the actual names.

- [ ] **Step 3: Build and verify**

Run: `cd /Users/subash.karki/phantom-os/v2 && go build ./...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add -p main.go
git commit -m "feat(persona): wire Persona service into app startup"
```

---

## Task 8: Frontend Types + Bindings

**Files:**
- Create: `frontend/src/core/persona/types.ts`
- Create: `frontend/src/core/persona/bindings.ts`

- [ ] **Step 1: Create TypeScript types**

```ts
// Author: Subash Karki

export type PillState = 'idle' | 'observing' | 'attention' | 'listening' | 'speaking';

export interface PersonaState {
  pillState: PillState;
  statusText: string;
  activeProject: string;
  expanded: boolean;
}

export interface PersonaResponse {
  text: string;
  speak: string;
  quickActions?: QuickAction[];
}

export interface QuickAction {
  label: string;
  action: string;
  args?: Record<string, string>;
}

export interface Message {
  role: 'user' | 'phantom';
  text: string;
  timestamp: string;
}

export interface ClaudeSessionStatus {
  sessionId: string;
  projectPath: string;
  liveState: string;
  lastTool: string;
  filesChanged: number;
  startedAt: string;
}

export interface PersonaContext {
  activeProject: string;
  claudeSessions: ClaudeSessionStatus[];
  terminalSessions: { id: string; cwd: string; attached: boolean; title: string }[];
  recentGit: { branch: string; isClean: boolean; staged: number; unstaged: number; untracked: number };
  fileGraph: { fileCount: number; symbolCount: number; edgeCount: number };
}
```

- [ ] **Step 2: Create binding wrappers**

```ts
// Author: Subash Karki

import type { PersonaResponse, PersonaState, PersonaContext, Message } from './types';

const app = () => (window as any).go?.app?.App;

export async function personaAsk(input: string): Promise<PersonaResponse> {
  try {
    const result = await app()?.PersonaAsk(input);
    return result ?? { text: 'Persona unavailable.', speak: '' };
  } catch (err) {
    console.error('[persona] ask error:', err);
    return { text: 'Something went wrong.', speak: '' };
  }
}

export async function personaGetState(): Promise<PersonaState> {
  try {
    const result = await app()?.PersonaGetState();
    return result ?? { pillState: 'idle', statusText: 'Phantom', activeProject: '', expanded: false };
  } catch {
    return { pillState: 'idle', statusText: 'Phantom', activeProject: '', expanded: false };
  }
}

export async function personaGetHistory(): Promise<Message[]> {
  try {
    const result = await app()?.PersonaGetHistory();
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export async function personaGetContext(): Promise<PersonaContext | null> {
  try {
    return await app()?.PersonaGetContext() ?? null;
  } catch {
    return null;
  }
}

export async function personaSetTrust(projectId: string, tier: number): Promise<void> {
  try {
    await app()?.PersonaSetTrust(projectId, tier);
  } catch (err) {
    console.error('[persona] setTrust error:', err);
  }
}

export async function personaGetTrust(projectId: string): Promise<number> {
  try {
    return (await app()?.PersonaGetTrust(projectId)) ?? 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/core/persona/types.ts frontend/src/core/persona/bindings.ts
git commit -m "feat(persona): add frontend types and Wails binding wrappers"
```

---

## Task 9: Frontend Signals

**Files:**
- Create: `frontend/src/core/persona/signals.ts`

- [ ] **Step 1: Create persona signals**

```ts
// Author: Subash Karki

import { createSignal, createMemo, onMount } from 'solid-js';
import type { PillState, PersonaState, PersonaResponse, Message } from './types';
import { personaGetState, personaGetHistory, personaAsk } from './bindings';

const [personaState, setPersonaState] = createSignal<PersonaState>({
  pillState: 'idle',
  statusText: 'Phantom',
  activeProject: '',
  expanded: false,
});

const [messages, setMessages] = createSignal<Message[]>([]);
const [isExpanded, setIsExpanded] = createSignal(false);
const [lastResponse, setLastResponse] = createSignal<PersonaResponse | null>(null);

export const pillState = createMemo<PillState>(() => personaState().pillState);
export const statusText = createMemo(() => personaState().statusText);
export const personaMessages = messages;
export const personaExpanded = isExpanded;
export const togglePersonaExpanded = () => setIsExpanded((v) => !v);
export const closePersona = () => setIsExpanded(false);
export const openPersona = () => setIsExpanded(true);

export async function sendToPersona(input: string): Promise<PersonaResponse> {
  const userMsg: Message = { role: 'user', text: input, timestamp: new Date().toISOString() };
  setMessages((prev) => [...prev, userMsg]);

  const resp = await personaAsk(input);

  const phantomMsg: Message = { role: 'phantom', text: resp.text, timestamp: new Date().toISOString() };
  setMessages((prev) => [...prev, phantomMsg]);
  setLastResponse(resp);
  return resp;
}

export function initPersonaSignals() {
  personaGetState().then(setPersonaState);
  personaGetHistory().then((h) => {
    if (h.length > 0) setMessages(h);
  });

  if (typeof window !== 'undefined' && (window as any).runtime) {
    (window as any).runtime.EventsOn('persona:state', (data: PersonaState) => {
      setPersonaState(data);
    });
    (window as any).runtime.EventsOn('persona:response', (data: PersonaResponse) => {
      setLastResponse(data);
    });
  }
}

// Double-tap ⌘ detection
let lastMetaDown = 0;

export function setupDoubleTapMeta() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Meta' && !e.repeat) {
      const now = Date.now();
      if (now - lastMetaDown < 300) {
        e.preventDefault();
        setIsExpanded((v) => !v);
        lastMetaDown = 0;
      } else {
        lastMetaDown = now;
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Meta') {
      lastMetaDown = 0;
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/core/persona/signals.ts
git commit -m "feat(persona): add SolidJS signals with double-tap meta detection"
```

---

## Task 10: PersonaPill Component

**Files:**
- Create: `frontend/src/components/persona/PersonaPill.css.ts`
- Create: `frontend/src/components/persona/PersonaPill.tsx`
- Modify: `frontend/src/components/layout/WindowDragStrip.tsx`

- [ ] **Step 1: Create pill styles**

```ts
// Author: Subash Karki
import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const pulse = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 1 },
});

export const pillContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 12px',
  borderRadius: '100px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  border: `1px solid transparent`,
  userSelect: 'none',
  ':hover': {
    background: 'rgba(0, 212, 255, 0.08)',
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
});

export const pillDot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
  transition: 'all 0.3s ease',
});

export const pillDotIdle = style({
  background: vars.color.textMuted,
});

export const pillDotObserving = style({
  background: vars.color.accent,
  boxShadow: `0 0 6px ${vars.color.accent}`,
});

export const pillDotAttention = style({
  background: vars.color.warning,
  boxShadow: `0 0 6px ${vars.color.warning}`,
  animation: `${pulse} 2s ease-in-out infinite`,
});

export const pillDotListening = style({
  background: vars.color.success,
  boxShadow: `0 0 6px ${vars.color.success}`,
});

export const pillText = style({
  fontSize: '10px',
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  maxWidth: '140px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  transition: 'color 0.2s ease',
});

export const pillShortcut = style({
  fontSize: '9px',
  color: vars.color.textMuted,
  fontFamily: vars.font.mono,
  padding: '1px 6px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: '3px',
  marginLeft: '2px',
});
```

- [ ] **Step 2: Create pill component**

```tsx
// Author: Subash Karki
import { Component, createMemo } from 'solid-js';
import { pillState, statusText, togglePersonaExpanded, personaExpanded } from '../../core/persona/signals';
import * as css from './PersonaPill.css';

export const PersonaPill: Component = () => {
  const dotClass = createMemo(() => {
    switch (pillState()) {
      case 'observing': return css.pillDotObserving;
      case 'attention': return css.pillDotAttention;
      case 'listening': return css.pillDotListening;
      case 'speaking': return css.pillDotListening;
      default: return css.pillDotIdle;
    }
  });

  return (
    <div
      class={css.pillContainer}
      onClick={togglePersonaExpanded}
      title="Phantom Persona (double-tap ⌘)"
    >
      <div class={`${css.pillDot} ${dotClass()}`} />
      <span class={css.pillText}>{statusText()}</span>
      <span class={css.pillShortcut}>⌘⌘</span>
    </div>
  );
};
```

- [ ] **Step 3: Add PersonaPill to WindowDragStrip**

In `frontend/src/components/layout/WindowDragStrip.tsx`, find the center div (the `windowDragStripCenter` class area with the session indicator). Import and add `<PersonaPill />`:

Add import at top:
```ts
import { PersonaPill } from '../persona/PersonaPill';
import { initPersonaSignals, setupDoubleTapMeta } from '../../core/persona/signals';
import { onMount } from 'solid-js';
```

Add initialization inside the component function (before the return):
```ts
onMount(() => {
  initPersonaSignals();
  setupDoubleTapMeta();
});
```

Add `<PersonaPill />` in the center strip area, next to the existing session/status indicators.

- [ ] **Step 4: Verify with `wails dev`**

Run: `cd /Users/subash.karki/phantom-os/v2 && ~/go/bin/wails dev`
Expected: pill visible in top bar showing "Phantom" with dim dot

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/persona/PersonaPill.css.ts frontend/src/components/persona/PersonaPill.tsx
git add -p frontend/src/components/layout/WindowDragStrip.tsx
git commit -m "feat(persona): add PersonaPill component to top bar"
```

---

## Task 11: PersonaDropdown + Input + Messages

**Files:**
- Create: `frontend/src/components/persona/PersonaDropdown.css.ts`
- Create: `frontend/src/components/persona/PersonaDropdown.tsx`
- Create: `frontend/src/components/persona/PersonaInput.tsx`
- Create: `frontend/src/components/persona/PersonaMessage.tsx`
- Create: `frontend/src/components/persona/PersonaQuickActions.tsx`

- [ ] **Step 1: Create dropdown styles**

```ts
// Author: Subash Karki
import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const slideDown = keyframes({
  from: { opacity: 0, transform: 'translateY(-8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
});

export const dropdown = style({
  position: 'fixed',
  top: '44px',
  right: '120px',
  width: '400px',
  maxHeight: '480px',
  background: vars.color.bgSecondary,
  border: `1px solid rgba(0, 212, 255, 0.2)`,
  borderRadius: '12px',
  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 24px rgba(0, 212, 255, 0.06)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  zIndex: 9999,
  animation: `${slideDown} 0.15s ease-out`,
});

export const statusBanner = style({
  padding: '10px 14px',
  borderBottom: `1px solid ${vars.color.border}`,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  background: 'rgba(0, 212, 255, 0.04)',
});

export const statusDot = style({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  background: `radial-gradient(circle, ${vars.color.accent}, #0088aa)`,
  flexShrink: 0,
});

export const statusInfo = style({
  flex: 1,
});

export const statusTitle = style({
  fontSize: '11px',
  fontWeight: 500,
  color: vars.color.textPrimary,
});

export const statusSub = style({
  fontSize: '10px',
  color: vars.color.textMuted,
  marginTop: '2px',
});

export const chatArea = style({
  flex: 1,
  overflowY: 'auto',
  padding: '10px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxHeight: '300px',
});

export const inputArea = style({
  padding: '10px 14px',
  borderTop: `1px solid ${vars.color.border}`,
});

export const messageUser = style({
  alignSelf: 'flex-end',
  maxWidth: '85%',
  background: 'rgba(0, 212, 255, 0.1)',
  border: '1px solid rgba(0, 212, 255, 0.15)',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '12px',
  color: vars.color.textPrimary,
});

export const messagePhantom = style({
  alignSelf: 'flex-start',
  maxWidth: '85%',
  background: vars.color.bgCard,
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '12px',
  color: vars.color.textSecondary,
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
});

export const inputBox = style({
  background: vars.color.bgCard,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '12px',
  color: vars.color.textPrimary,
  width: '100%',
  outline: 'none',
  fontFamily: vars.font.body,
  '::placeholder': {
    color: vars.color.textMuted,
  },
  selectors: {
    '&:focus': {
      borderColor: vars.color.accent,
    },
  },
});

export const quickActionsBar = style({
  padding: '8px 14px',
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  borderBottom: `1px solid ${vars.color.border}`,
});

export const quickActionChip = style({
  padding: '4px 10px',
  background: vars.color.bgCard,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '6px',
  fontSize: '10px',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  ':hover': {
    borderColor: vars.color.accent,
    color: vars.color.textPrimary,
  },
});
```

- [ ] **Step 2: Create PersonaMessage component**

```tsx
// Author: Subash Karki
import { Component } from 'solid-js';
import type { Message } from '../../core/persona/types';
import * as css from './PersonaDropdown.css';

export const PersonaMessage: Component<{ message: Message }> = (props) => {
  return (
    <div class={props.message.role === 'user' ? css.messageUser : css.messagePhantom}>
      {props.message.text}
    </div>
  );
};
```

- [ ] **Step 3: Create PersonaInput component**

```tsx
// Author: Subash Karki
import { Component, createSignal } from 'solid-js';
import { sendToPersona } from '../../core/persona/signals';
import * as css from './PersonaDropdown.css';

export const PersonaInput: Component = () => {
  const [value, setValue] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async () => {
    const input = value().trim();
    if (!input || loading()) return;
    setValue('');
    setLoading(true);
    await sendToPersona(input);
    setLoading(false);
  };

  return (
    <div class={css.inputArea}>
      <input
        class={css.inputBox}
        placeholder={loading() ? 'Thinking...' : 'Ask Phantom...'}
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        disabled={loading()}
      />
    </div>
  );
};
```

- [ ] **Step 4: Create PersonaQuickActions component**

```tsx
// Author: Subash Karki
import { Component } from 'solid-js';
import { sendToPersona } from '../../core/persona/signals';
import * as css from './PersonaDropdown.css';

const defaultActions = [
  { label: 'Claude status', query: 'what is claude doing' },
  { label: 'Git status', query: 'git status' },
  { label: 'What changed', query: 'what changed' },
  { label: 'Terminals', query: 'how many terminals are open' },
];

export const PersonaQuickActions: Component = () => {
  return (
    <div class={css.quickActionsBar}>
      {defaultActions.map((a) => (
        <button
          class={css.quickActionChip}
          onClick={() => sendToPersona(a.query)}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 5: Create PersonaDropdown component**

```tsx
// Author: Subash Karki
import { Component, Show, For, createEffect, onMount } from 'solid-js';
import {
  personaExpanded,
  closePersona,
  personaMessages,
  statusText,
  pillState,
} from '../../core/persona/signals';
import { PersonaMessage } from './PersonaMessage';
import { PersonaInput } from './PersonaInput';
import { PersonaQuickActions } from './PersonaQuickActions';
import * as css from './PersonaDropdown.css';

export const PersonaDropdown: Component = () => {
  let chatRef: HTMLDivElement | undefined;

  createEffect(() => {
    const msgs = personaMessages();
    if (chatRef && msgs.length > 0) {
      chatRef.scrollTop = chatRef.scrollHeight;
    }
  });

  return (
    <Show when={personaExpanded()}>
      <div class={css.overlay} onClick={closePersona} />
      <div class={css.dropdown}>
        <div class={css.statusBanner}>
          <div class={css.statusDot} />
          <div class={css.statusInfo}>
            <div class={css.statusTitle}>{statusText()}</div>
            <div class={css.statusSub}>
              {pillState() === 'idle' ? 'Ready to help' : 'Monitoring workspace'}
            </div>
          </div>
        </div>
        <PersonaQuickActions />
        <div class={css.chatArea} ref={chatRef}>
          <For each={personaMessages()}>
            {(msg) => <PersonaMessage message={msg} />}
          </For>
        </div>
        <PersonaInput />
      </div>
    </Show>
  );
};
```

- [ ] **Step 6: Add PersonaDropdown to the app shell**

In `WindowDragStrip.tsx` (or the top-level `App.tsx` if dropdowns are rendered at root level), add:

```tsx
import { PersonaDropdown } from '../persona/PersonaDropdown';
```

And render `<PersonaDropdown />` at the end of the component (it uses fixed positioning so placement in the tree doesn't matter, but it must be rendered).

- [ ] **Step 7: Test with `wails dev`**

Run: `cd /Users/subash.karki/phantom-os/v2 && ~/go/bin/wails dev`

Verify:
1. Pill visible in top bar
2. Click pill → dropdown appears with status banner, quick actions, chat area, input
3. Type "what is claude doing" → get response "No active Claude sessions right now."
4. Type "git status" → get git response
5. Click quick action chip → fires query
6. Double-tap ⌘ → dropdown toggles
7. Click outside dropdown → closes

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/persona/
git add -p frontend/src/components/layout/WindowDragStrip.tsx
git commit -m "feat(persona): add PersonaDropdown with chat, quick actions, and input"
```

---

## Task 12: Proactive Status Updates

**Files:**
- Modify: `internal/persona/persona.go`

- [ ] **Step 1: Add event subscription for Claude session changes**

Add a `Start()` method to Persona that subscribes to existing Wails events and updates pill state:

```go
func (p *Persona) Start(ctx context.Context) {
	go p.watchLoop(ctx)
}

func (p *Persona) watchLoop(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.refreshStatus(ctx)
		}
	}
}

func (p *Persona) refreshStatus(ctx context.Context) {
	p.mu.RLock()
	projectPath := p.projectPath
	p.mu.RUnlock()

	sessions := p.ctx.ClaudeSessions(ctx, projectPath)
	terminals := p.ctx.TerminalSessions(ctx)

	var activeClaude int
	var lastTool string
	for _, s := range sessions {
		if s.LiveState == "running" || s.LiveState == "waiting" {
			activeClaude++
			if s.LastTool != "" {
				lastTool = s.LastTool
			}
		}
	}

	switch {
	case activeClaude > 0 && lastTool != "":
		p.updateState(PillObserving, fmt.Sprintf("Claude: %s", lastTool))
	case activeClaude > 0:
		p.updateState(PillObserving, fmt.Sprintf("%d Claude session(s)", activeClaude))
	case len(terminals) > 0:
		p.updateState(PillIdle, fmt.Sprintf("%d terminal(s)", len(terminals)))
	default:
		p.updateState(PillIdle, "Phantom")
	}
}
```

Add `"fmt"` to imports if not already present.

- [ ] **Step 2: Call Start() in the app startup wiring**

In `main.go`, after creating the Persona, add:

```go
personaSvc.Start(ctx)
```

Where `ctx` is the app context available at that point.

- [ ] **Step 3: Test with `wails dev`**

Run: `cd /Users/subash.karki/phantom-os/v2 && ~/go/bin/wails dev`

Verify: With an active Claude session, the pill text changes to show Claude's activity. Without sessions, shows "Phantom" or terminal count.

- [ ] **Step 4: Commit**

```bash
git add -p internal/persona/persona.go main.go
git commit -m "feat(persona): add proactive status polling with 2s refresh"
```

---

## Summary

This plan delivers:
- **Context Engine** reading 6 existing signal sources
- **Smart Router** with 13 pattern rules covering ~80% of queries
- **4 Observe handlers** (status, git, search, workspace)
- **Trust tier manager** with per-project persistence
- **Persona service** with Wails bindings and event emission
- **PersonaPill** in the top bar with 4 visual states
- **PersonaDropdown** with chat, quick actions, and text input
- **Double-tap ⌘** activation
- **Proactive 2s status polling** updating the pill live

**Not in this plan** (separate follow-on plans):
- Voice engine (wake word, STT, TTS)
- Claude Runtime (managed sessions, shell intercept)
- Local LLM integration (Ollama, MLX, llama.cpp)
- Terminal/Git action handlers (tier 1-3 unlocks)
