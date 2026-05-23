// Author: Subash Karki
package persona

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/composer"
)

// EmitFn is the callback used to push Wails events to the frontend.
type EmitFn func(eventName string, data interface{})

// PersonaDeps bundles everything Persona needs to start.
// All fields are optional — nil means unavailable; safe defaults are used.
type PersonaDeps struct {
	ContextDeps ContextDeps
	PrefGetter  PrefGetter
	PrefSetter  PrefSetter
	EmitFn      EmitFn
	ComposerMgr *composer.Manager // Composer V2 manager for Claude session control
	AICallFn    ClaudeFn          // optional: override AI handler's Claude call (for testing)
}

// maxHistory caps the number of conversation messages kept in memory.
const maxHistory = 100

// stickyClaudeTTL is how long a shell-intercept or stream-activity detection
// protects the pill from being overwritten by the 2s polling loop.
const stickyClaudeTTL = 30 * time.Second

// Persona is the top-level service tying context, routing, trust, and handlers.
type Persona struct {
	mu            sync.RWMutex
	state         PersonaState
	history       []Message
	engine        *ContextEngine
	router        *Router
	trust         *TrustManager
	handlers      map[string]Handler
	emitFn        EmitFn
	activeProject string

	// Sticky Claude detection: shell intercept fires OnClaudeDetectedInTerminal
	// which sets these fields. refreshStatus() skips overwriting the pill while
	// the detection is fresh (within stickyClaudeTTL).
	lastClaudeDetect time.Time
	lastClaudeLabel  string

	// lastActivity stores the most recent terminal:activity summary pushed
	// from the stream event hook so refreshStatus() can display real-time
	// tool info (e.g. "Claude: editing auth.ts") instead of stale DB data.
	lastActivityTime    time.Time
	lastActivitySummary string
}

// NewPersona creates a fully wired Persona from the given deps.
func NewPersona(deps PersonaDeps) *Persona {
	engine := NewContextEngine(deps.ContextDeps)
	router := NewRouter()
	trust := NewTrustManager(deps.PrefGetter, deps.PrefSetter)

	// Resolve the Claude CLI binary path for the AI handler.
	claudeBin := "claude"
	if resolved, err := composer.ResolveClaudeBin(); err == nil {
		claudeBin = resolved
	}

	var aiHandler Handler
	if deps.AICallFn != nil {
		aiHandler = NewAIHandlerWithFn(engine, deps.AICallFn)
	} else {
		aiHandler = NewAIHandler(engine, claudeBin)
	}

	handlers := map[string]Handler{
		"status":    NewStatusHandler(engine),
		"git":       NewGitHandler(engine),
		"search":    NewSearchHandler(engine),
		"workspace": NewWorkspaceHandler(engine),
		"ai":        aiHandler,
		"llm":       NewLLMHandler(),
	}

	emit := deps.EmitFn
	if emit == nil {
		emit = func(string, interface{}) {}
	}

	p := &Persona{
		state: PersonaState{
			PillState:  PillIdle,
			StatusText: "Ready",
		},
		history:  make([]Message, 0, maxHistory),
		engine:   engine,
		router:   router,
		trust:    trust,
		handlers: handlers,
		emitFn:   emit,
	}

	// Register ClaudeHandler if Composer Manager is available.
	if deps.ComposerMgr != nil {
		claudeHandler := NewClaudeHandler(deps.ComposerMgr, p.setPillState)
		p.handlers["claude"] = claudeHandler
	}

	return p
}

// Ask classifies input, checks trust, dispatches to the appropriate handler,
// records conversation history, and returns the response.
func (p *Persona) Ask(ctx context.Context, input string) Response {
	if p == nil {
		return Response{Text: "Persona is not initialized.", Speak: "Persona is not initialized."}
	}

	// Record user message.
	p.appendMessage("user", input)

	// Transition to listening while we process.
	p.setPillState(PillListening, "Processing...")

	// Classify intent.
	intent := p.router.Classify(input)

	// Check trust for action lanes.
	p.mu.RLock()
	project := p.activeProject
	p.mu.RUnlock()

	requiredTier := laneRequiredTier(intent.Lane)
	if !p.trust.IsAllowed(project, requiredTier) {
		p.setPillState(PillIdle, "Ready")
		resp := Response{
			Text:  "That action requires a higher trust tier for this project.",
			Speak: "Trust tier too low.",
		}
		p.appendMessage("assistant", resp.Text)
		p.emitFn("persona:response", resp)
		return resp
	}

	// Dispatch to handler.
	p.setPillState(PillSpeaking, "Responding...")

	handler, ok := p.handlers[intent.Handler]
	if !ok {
		p.setPillState(PillIdle, "Ready")
		resp := Response{
			Text:  "I don't have a handler for that yet.",
			Speak: "No handler available.",
		}
		p.appendMessage("assistant", resp.Text)
		p.emitFn("persona:response", resp)
		return resp
	}

	resp := handler.Handle(ctx, intent, project)

	// Record assistant response.
	p.appendMessage("assistant", resp.Text)

	// Return to idle.
	p.setPillState(PillIdle, "Ready")

	// Emit response event.
	p.emitFn("persona:response", resp)

	return resp
}

// GetState returns the current persona state (pill, status, project, expanded).
func (p *Persona) GetState() PersonaState {
	if p == nil {
		return PersonaState{PillState: PillIdle, StatusText: "Not initialized"}
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state
}

// SetProjectPath updates the active project path.
func (p *Persona) SetProjectPath(path string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	p.activeProject = path
	p.state.ActiveProject = path
	state := p.state
	p.mu.Unlock()
	p.emitFn("persona:state", state)
}

// GetHistory returns conversation history, capped at maxHistory.
func (p *Persona) GetHistory() []Message {
	if p == nil {
		return []Message{}
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]Message, len(p.history))
	copy(out, p.history)
	return out
}

// GetContext delegates to the context engine for the active project.
func (p *Persona) GetContext(ctx context.Context) PersonaContext {
	if p == nil {
		return PersonaContext{}
	}
	p.mu.RLock()
	project := p.activeProject
	p.mu.RUnlock()
	return p.engine.Assemble(ctx, project, "")
}

// SetTrust delegates trust tier changes to the trust manager.
func (p *Persona) SetTrust(projectID string, tier TrustTier) error {
	if p == nil {
		return nil
	}
	return p.trust.SetTier(projectID, tier)
}

// GetTrust returns the trust tier for a project.
func (p *Persona) GetTrust(projectID string) TrustTier {
	if p == nil {
		return TierObserve
	}
	return p.trust.GetTier(projectID)
}

// OnClaudeDetectedInTerminal is called by the terminal subsystem when the
// shell integration detects the user ran `claude` in a Phantom terminal.
// It sets the pill to observing state with the given label and marks a
// sticky timestamp so refreshStatus() won't overwrite it for stickyClaudeTTL.
func (p *Persona) OnClaudeDetectedInTerminal(label string) {
	if p == nil {
		return
	}
	p.mu.Lock()
	p.lastClaudeDetect = time.Now()
	p.lastClaudeLabel = label
	p.mu.Unlock()

	p.setPillState(PillObserving, label)
}

// OnTerminalActivity is called from the stream event hook when real-time
// tool activity is detected in a Claude session. The summary is a formatted
// string like "Editing auth.ts" or "Running: npm test".
func (p *Persona) OnTerminalActivity(summary string) {
	if p == nil || summary == "" {
		return
	}
	p.mu.Lock()
	p.lastActivityTime = time.Now()
	p.lastActivitySummary = summary
	// Also refresh sticky detect so real-time activity extends the window.
	p.lastClaudeDetect = time.Now()
	p.lastClaudeLabel = fmt.Sprintf("Claude: %s", summary)
	p.mu.Unlock()

	p.setPillState(PillObserving, fmt.Sprintf("Claude: %s", summary))
}

// ─── proactive status polling ───────────────────────────────────────────────

// Start launches the background polling loop. Cancel ctx to stop it.
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
	projectPath := p.activeProject
	stickyFresh := time.Since(p.lastClaudeDetect) < stickyClaudeTTL
	activityFresh := time.Since(p.lastActivityTime) < stickyClaudeTTL
	activitySummary := p.lastActivitySummary
	p.mu.RUnlock()

	// If shell intercept or stream activity fired recently, don't overwrite.
	// The pill already shows the real-time label from OnClaudeDetectedInTerminal
	// or OnTerminalActivity — polling would clobber it with stale DB data.
	if stickyFresh {
		return
	}

	sessions := p.engine.ClaudeSessions(ctx, projectPath)
	terminals := p.engine.TerminalSessions(ctx)

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

	// Prefer recent stream activity summary over DB-level tool info.
	if activeClaude > 0 && activityFresh && activitySummary != "" {
		p.setPillState(PillObserving, fmt.Sprintf("Claude: %s", activitySummary))
		return
	}

	switch {
	case activeClaude > 0 && lastTool != "":
		p.setPillState(PillObserving, fmt.Sprintf("Claude: %s", lastTool))
	case activeClaude > 0:
		p.setPillState(PillObserving, fmt.Sprintf("%d Claude session(s)", activeClaude))
	case len(terminals) > 0:
		p.setPillState(PillIdle, fmt.Sprintf("%d terminal(s)", len(terminals)))
	default:
		p.setPillState(PillIdle, "Phantom")
	}
}

// ─── internal helpers ───────────────────────────────────────────────────────

// SetPillStateExternal is the exported version of setPillState, called by
// frontend-driven voice state transitions via the App binding layer.
func (p *Persona) SetPillStateExternal(pill PillState, status string) {
	p.setPillState(pill, status)
}

// setPillState updates the pill state + status text and emits a state event.
func (p *Persona) setPillState(pill PillState, status string) {
	p.mu.Lock()
	p.state.PillState = pill
	p.state.StatusText = status
	state := p.state
	p.mu.Unlock()
	p.emitFn("persona:state", state)
}

// appendMessage adds a message to history, trimming oldest when over cap.
func (p *Persona) appendMessage(role, text string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	msg := Message{
		Role:      role,
		Text:      text,
		Timestamp: time.Now(),
	}
	p.history = append(p.history, msg)
	if len(p.history) > maxHistory {
		p.history = p.history[len(p.history)-maxHistory:]
	}
}

// laneRequiredTier maps a lane to the minimum trust tier needed.
func laneRequiredTier(lane Lane) TrustTier {
	switch lane {
	case LaneStateLookup:
		return TierObserve
	case LaneLocalReasoning:
		return TierObserve
	case LaneClaudeTask:
		return TierClaude
	case LaneSystemAction:
		return TierTerminal
	default:
		return TierObserve
	}
}
