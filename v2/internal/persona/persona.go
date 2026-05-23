// Author: Subash Karki
package persona

import (
	"context"
	"sync"
	"time"
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
}

// maxHistory caps the number of conversation messages kept in memory.
const maxHistory = 100

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
}

// NewPersona creates a fully wired Persona from the given deps.
func NewPersona(deps PersonaDeps) *Persona {
	engine := NewContextEngine(deps.ContextDeps)
	router := NewRouter()
	trust := NewTrustManager(deps.PrefGetter, deps.PrefSetter)

	handlers := map[string]Handler{
		"status":    NewStatusHandler(engine),
		"git":       NewGitHandler(engine),
		"search":    NewSearchHandler(engine),
		"workspace": NewWorkspaceHandler(engine),
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

// ─── internal helpers ───────────────────────────────────────────────────────

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
