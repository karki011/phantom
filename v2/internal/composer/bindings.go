// Author: Subash Karki
//
// bindings.go exposes Wails bindings for the Composer V2 subsystem.
// The frontend calls these via (window as any).go.app.App.<Method>.
// Each session emits events on channel "composer:event:{sessionID}".
package composer

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/orchestrator"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
)

// ContextEnricher abstracts the AI engine context injector so the V2 bindings
// can call it without depending on the full Composer V1 service.
type ContextEnricher interface {
	// EnrichForProject enriches a user message with codebase context for a
	// project directory. Returns the enriched prompt and strategy metadata.
	EnrichForProject(ctx context.Context, projectCwd, userMessage string) strategies.EnrichResult
}

// OpenRequest is the payload the frontend sends to start a new composer session.
type OpenRequest struct {
	SessionID      string `json:"session_id"`
	CWD            string `json:"cwd"`
	Mode           string `json:"mode"`
	ResumeID       string `json:"resume_id"`
	Model          string `json:"model"`
	PermissionMode string `json:"permission_mode"`
	Effort         string `json:"effort"`
	NoContext      bool   `json:"no_context"`
}

// SendRequest is the payload the frontend sends to write to a session's stdin.
type SendRequest struct {
	SessionID string          `json:"session_id"`
	Content   json.RawMessage `json:"content"`
}

// Bindings bridges the Manager to Wails event system.
type Bindings struct {
	ctx      context.Context
	manager  *Manager
	logger   *ComposerLogger
	enricher ContextEnricher // optional AI engine context injector
	service  *Service        // V1 Service for DB queries (ListSessions, History)

	// engineDeps provides the full orchestrator pipeline (assessor, strategy
	// registry, knowledge stores) for strategy selection. When set,
	// tryEnrichAndEmitStrategy calls orchestrator.Process instead of the
	// lightweight ContextInjector.EnrichForProject. Mirrors V1's service.go.
	engineDeps      orchestrator.Dependencies
	engineDepsSet   bool // true after SetEngineDeps is called
	indexerResolver IndexerResolver

	// Turn tracking for DB persistence — mirrors V1's per-turn state.
	turnMu       sync.Mutex
	turnIDs      map[string]string // sessionID → current turnID
	turnSeqs     map[string]int    // sessionID → event sequence counter
	turnTexts    map[string]string // sessionID → accumulated response text
}

// SetService injects the V1 Service so V2 bindings can access session
// history and listing from the shared SQLite database.
func (b *Bindings) SetService(svc *Service) {
	b.service = svc
}

// NewBindings creates a Bindings instance backed by the given Manager.
func NewBindings(manager *Manager) *Bindings {
	logDir := filepath.Join(os.Getenv("HOME"), ".phantom-os", "logs")
	logger, err := NewComposerLogger(logDir, false)
	if err != nil {
		log.Warn("composer: failed to create logger", "err", err)
	}
	return &Bindings{
		manager:   manager,
		logger:    logger,
		turnIDs:   make(map[string]string),
		turnSeqs:  make(map[string]int),
		turnTexts: make(map[string]string),
	}
}

// SetContext is called by Wails on application startup to inject the
// runtime context used for EventsEmit.
func (b *Bindings) SetContext(ctx context.Context) {
	b.ctx = ctx
}

// SetContextEnricher injects the AI engine context injector so sends
// can be enriched with codebase context and strategy metadata.
func (b *Bindings) SetContextEnricher(enricher ContextEnricher) {
	b.enricher = enricher
}

// SetEngineDeps injects the full orchestrator dependencies so V2 bindings
// can call orchestrator.Process for strategy selection — the same pipeline
// V1's service.go uses. When set, tryEnrichAndEmitStrategy prefers this
// over the lightweight ContextInjector.EnrichForProject.
func (b *Bindings) SetEngineDeps(deps orchestrator.Dependencies) {
	b.engineDeps = deps
	b.engineDepsSet = true
}

// SetIndexerResolver injects a per-turn file-graph indexer resolver so the
// orchestrator sees graph context for whichever project the session's CWD
// belongs to. Mirrors V1's service.go indexerResolver.
func (b *Bindings) SetIndexerResolver(resolver IndexerResolver) {
	b.indexerResolver = resolver
}

// resolveIndexer returns the file-graph indexer for a CWD, or nil.
func (b *Bindings) resolveIndexer(cwd string) *filegraph.Indexer {
	if b.indexerResolver == nil || cwd == "" {
		return nil
	}
	return b.indexerResolver(cwd)
}

// ComposerV2Open opens a new session via the Manager and wires up event
// forwarding to the Wails frontend on channel "composer:event:{sessionID}".
// The event handler is passed into Open so it is registered BEFORE the
// subprocess spawns, preventing any early events from being lost.
func (b *Bindings) ComposerV2Open(req OpenRequest) (ManagerSessionInfo, error) {
	opts := SessionOptions{
		ClaudeSessionID: req.ResumeID,
		Mode:            req.Mode,
		Logger:          b.logger,
		Model:           req.Model,
		PermissionMode:  req.PermissionMode,
		Effort:          req.Effort,
		NoContext:        req.NoContext,
		MaxTurns:         100,
		FallbackModel:   "sonnet",
	}

	// Build the Wails event forwarder before opening so it can be
	// registered on the session prior to subprocess spawn.
	channel := "composer:event:" + req.SessionID
	handler := func(ev StreamEvent) {
		if b.logger != nil {
			b.logger.LogEvent(req.SessionID, ev)
		}
		if b.ctx != nil {
			runtime.EventsEmit(b.ctx, channel, ev)
		}

		// ── DB persistence (fire-and-forget) ──────────────────────
		sess, _ := b.manager.Get(req.SessionID)
		b.persistStreamEvent(req.SessionID, sess, ev)
	}

	info, err := b.manager.Open(req.SessionID, req.CWD, opts, handler)
	if err != nil {
		return ManagerSessionInfo{}, fmt.Errorf("open session: %w", err)
	}

	return info, nil
}

// ComposerV2Send writes content to a running session's stdin.
// If the AI engine enricher is available, user messages are enriched with
// codebase context and a strategy event is emitted to the frontend before
// the message is forwarded to the CLI subprocess.
func (b *Bindings) ComposerV2Send(req SendRequest) error {
	session, ok := b.manager.Get(req.SessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", req.SessionID)
	}

	// Extract user message text for turn persistence (same parse as tryEnrichAndEmitStrategy).
	userText := b.extractUserText(req.Content)
	if userText != "" {
		b.startTurn(req.SessionID, session, userText)
	}

	// Attempt AI engine strategy selection + prompt enrichment for user messages.
	// The enriched content replaces the raw user message with codebase context
	// and strategy guidance prepended — matching V1's service.go behaviour.
	content := req.Content
	if b.ctx != nil && (b.engineDepsSet || b.enricher != nil) {
		if enriched := b.tryEnrichAndEmitStrategy(session, req); enriched != nil {
			content = enriched
		}
	} else {
		log.Debug("composer: AI engine skipped", "ctx", b.ctx != nil, "engineDeps", b.engineDepsSet, "enricher", b.enricher != nil)
	}

	return session.Send(content)
}

// extractUserText parses the send payload envelope and returns the first
// text block from a user message, or "" if not a user message.
func (b *Bindings) extractUserText(content json.RawMessage) string {
	type cBlock struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	type msgBody struct {
		Role    string   `json:"role"`
		Content []cBlock `json:"content"`
	}
	type envelope struct {
		Type    string  `json:"type"`
		Message msgBody `json:"message"`
	}

	var env envelope
	if err := json.Unmarshal(content, &env); err != nil {
		return ""
	}
	if env.Type != "user" || env.Message.Role != "user" {
		return ""
	}
	for _, block := range env.Message.Content {
		if block.Type == "text" && block.Text != "" {
			return block.Text
		}
	}
	return ""
}

// startTurn inserts a new turn row and ensures the session row exists.
// Fire-and-forget — errors are logged but never block the send.
func (b *Bindings) startTurn(sessionID string, session *Session, userText string) {
	if b.service == nil {
		return
	}

	// Use the Claude CLI session UUID for DB persistence, not the frontend's
	// internal session key (cv2_xxx). The CLI UUID is what --resume expects
	// and what the sessions table uses.
	claudeSessionID := session.SessionID()
	if claudeSessionID == "" {
		claudeSessionID = sessionID // fallback before handshake completes
	}

	turnID := uuid.New().String()
	now := time.Now().Unix()

	b.turnMu.Lock()
	b.turnIDs[sessionID] = turnID
	b.turnSeqs[sessionID] = 0
	b.turnTexts[sessionID] = ""
	b.turnMu.Unlock()

	model := session.opts.Model
	if model == "" {
		model = "sonnet"
	}

	log.Info("composer: v2 startTurn", "internalID", sessionID, "claudeID", claudeSessionID, "turnID", turnID, "prompt", userText[:min(len(userText), 50)])
	if err := b.service.insertTurn(b.ctx, &Turn{
		ID:        turnID,
		PaneID:    "v2_" + sessionID,
		SessionID: claudeSessionID,
		CWD:       session.CWD,
		Prompt:    userText,
		Model:     model,
		Status:    "running",
		StartedAt: now,
	}); err != nil {
		log.Warn("composer: v2 insertTurn failed", "err", err)
	}

	if err := b.service.ensureSessionRow(b.ctx, claudeSessionID, session.Name, session.CWD, model, userText); err != nil {
		log.Warn("composer: v2 ensureSessionRow failed", "err", err)
	}
}

// persistStreamEvent persists a streaming event to the DB and handles
// turn completion (result_success, result_error). Fire-and-forget.
func (b *Bindings) persistStreamEvent(sessionID string, session *Session, ev StreamEvent) {
	if b.service == nil {
		return
	}

	// Use Claude CLI UUID for DB, not frontend internal ID
	claudeSessionID := ""
	if session != nil {
		claudeSessionID = session.SessionID()
	}
	if claudeSessionID == "" {
		claudeSessionID = sessionID
	}

	b.turnMu.Lock()
	turnID := b.turnIDs[sessionID]
	b.turnMu.Unlock()

	if turnID == "" {
		return // no active turn for this session
	}

	// When system_init arrives, it carries the real Claude session UUID in
	// ev.SessionID. Update the turn and session rows that were inserted with
	// the fallback internal ID. Also set it on the session object for future use.
	if ev.Kind == EventSystemInit && ev.SessionID != "" && ev.SessionID != sessionID {
		realID := ev.SessionID
		if session != nil {
			session.mu.Lock()
			session.sessionID = realID
			session.mu.Unlock()
		}
		claudeSessionID = realID
		const fixQ = `UPDATE composer_turns SET session_id = ? WHERE session_id = ?`
		if res, err := b.service.writer.ExecContext(b.ctx, fixQ, realID, sessionID); err != nil {
			log.Debug("composer: v2 fixup turn session_id failed", "err", err)
		} else {
			n, _ := res.RowsAffected()
			log.Info("composer: v2 session ID fixup", "from", sessionID, "to", realID, "rows", n)
		}
		b.service.ensureSessionRow(b.ctx, realID, session.Name, session.CWD, session.opts.Model, "")
	}

	// Persist important event types to composer_events.
	switch ev.Kind {
	case EventAssistant, EventToolResult, EventStreamEvent,
		EventResultSuccess, EventResultError, EventError,
		EventSystemInit, EventSystemStatus, EventCompactBoundary:

		b.turnMu.Lock()
		b.turnSeqs[sessionID]++
		seq := b.turnSeqs[sessionID]
		b.turnMu.Unlock()

		// Build content from the event for replay.
		content := ev.Text
		if content == "" && ev.Result != "" {
			content = ev.Result
		}
		if content == "" && len(ev.Raw) > 0 {
			content = string(ev.Raw)
		}

		if err := b.service.insertEvent(b.ctx, &EventRecord{
			TurnID:    turnID,
			SessionID: claudeSessionID,
			Seq:       seq,
			Type:      ev.RawType,
			Subtype:   ev.RawSubtype,
			ToolName:  ev.ToolName,
			ToolUseID: ev.ToolUseID,
			Content:   content,
			CreatedAt: time.Now().Unix(),
		}); err != nil {
			log.Debug("composer: v2 persistEvent failed", "type", ev.RawType, "err", err)
		}
	}

	// Accumulate response text from assistant/streaming deltas.
	if ev.Text != "" && (ev.Kind == EventAssistant || ev.Kind == EventStreamEvent) {
		// Only accumulate text deltas, not thinking deltas.
		if ev.RawSubtype != "thinking_delta" && ev.RawSubtype != "thinking_start" && ev.RawSubtype != "thinking_complete" {
			b.turnMu.Lock()
			b.turnTexts[sessionID] += ev.Text
			b.turnMu.Unlock()
		}
	}

	// Mark turn done on result or error.
	switch ev.Kind {
	case EventResultSuccess:
		b.turnMu.Lock()
		responseText := b.turnTexts[sessionID]
		delete(b.turnIDs, sessionID)
		delete(b.turnSeqs, sessionID)
		delete(b.turnTexts, sessionID)
		b.turnMu.Unlock()

		b.service.markTurnDone(b.ctx, turnID, "done", 0, 0, 0, responseText)

	case EventResultError:
		b.turnMu.Lock()
		responseText := b.turnTexts[sessionID]
		delete(b.turnIDs, sessionID)
		delete(b.turnSeqs, sessionID)
		delete(b.turnTexts, sessionID)
		b.turnMu.Unlock()

		b.service.markTurnDone(b.ctx, turnID, "error", 0, 0, 0, responseText)
	}
}

// tryEnrichAndEmitStrategy attempts to extract the user message text,
// run it through the full AI engine orchestrator (matching V1 behaviour),
// and emit a strategy event to the frontend. Returns the modified JSON
// envelope with the enriched prompt injected, or nil if enrichment fails
// (caller falls back to the raw content). Falls back to the lightweight
// ContextInjector when orchestrator deps are not wired. Errors are silently
// ignored so the send always succeeds even if the engine is unavailable.
func (b *Bindings) tryEnrichAndEmitStrategy(session *Session, req SendRequest) json.RawMessage {
	// Parse the send payload to extract user message text.
	type contentBlock struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	type messageBody struct {
		Role    string         `json:"role"`
		Content []contentBlock `json:"content"`
	}
	type userEnvelope struct {
		Type    string      `json:"type"`
		Message messageBody `json:"message"`
	}

	var envelope userEnvelope
	if err := json.Unmarshal(req.Content, &envelope); err != nil {
		return nil
	}
	if envelope.Type != "user" || envelope.Message.Role != "user" {
		return nil
	}

	// Collect user message text from content blocks.
	var userText string
	var textBlockIdx int
	for i, block := range envelope.Message.Content {
		if block.Type == "text" && block.Text != "" {
			userText = block.Text
			textBlockIdx = i
			break
		}
	}
	if userText == "" {
		return nil
	}

	truncated := userText
	if len(truncated) > 50 {
		truncated = truncated[:50]
	}

	// injectEnrichedText replaces the user message text in the JSON envelope
	// with the enriched version and returns the re-serialized envelope.
	injectEnrichedText := func(enrichedText string) json.RawMessage {
		envelope.Message.Content[textBlockIdx] = contentBlock{
			Type: "text",
			Text: enrichedText,
		}
		modified, err := json.Marshal(envelope)
		if err != nil {
			log.Warn("composer: failed to marshal enriched envelope", "err", err)
			return nil
		}
		log.Info("composer: injecting enriched prompt", "chars", len(enrichedText))
		b.emitEnrichedPrompt(req.SessionID, enrichedText, userText)
		return modified
	}

	// --- Full orchestrator path (V1 parity) ---
	if b.engineDepsSet {
		log.Info("composer: orchestrator calling", "cwd", session.CWD, "text", truncated)

		// Resolve the per-turn file-graph indexer from the session's CWD.
		// The base deps are immutable across turns; we only overlay Indexer
		// here so each send sees the correct project graph.
		turnDeps := b.engineDeps
		resolvedIndexer := b.resolveIndexer(session.CWD)
		if resolvedIndexer != nil {
			turnDeps.Indexer = resolvedIndexer
		}

		// Build ActiveFiles from symbol inference — mirrors V1 service.go
		// lines 298-306. Without this, blast radius is always 0 and the
		// orchestrator can't differentiate a simple question from a
		// multi-file refactor.
		var activeFiles []string
		if resolvedIndexer != nil {
			if inferred := InferFilesFromPrompt(resolvedIndexer, userText); len(inferred) > 0 {
				activeFiles = append(activeFiles, inferred...)
				log.Info("composer: symbol inference",
					"symbols_found", len(inferred),
					"files", inferred,
				)
			}
		}

		result, err := orchestrator.Process(b.ctx, turnDeps, orchestrator.ProcessInput{
			Goal:        userText,
			CWD:         session.CWD,
			ActiveFiles: activeFiles,
		})
		if err == nil && result != nil && result.Strategy.Name != "" {
			log.Info("composer: orchestrator result", "strategy", result.Strategy.Name, "confidence", result.Confidence, "complexity", result.TaskContext.Complexity, "risk", result.TaskContext.Risk, "blast_radius", result.Context.BlastRadius)

			// Emit strategy event with full data — mirrors V1's service.go.
			channel := "composer:event:" + req.SessionID
			ev := StreamEvent{
				Kind:               EventStrategy,
				RawType:            "strategy",
				StrategyName:       result.Strategy.Name,
				StrategyConfidence: result.Confidence,
				TaskComplexity:     result.TaskContext.Complexity,
				TaskRisk:           result.TaskContext.Risk,
				BlastRadius:        result.Context.BlastRadius,
			}
			if b.logger != nil {
				b.logger.LogEvent(req.SessionID, ev)
			}
			runtime.EventsEmit(b.ctx, channel, ev)

			// Inject the enriched directive into the message envelope —
			// prepend it to the user's raw text so Claude sees strategy
			// guidance, codebase context, and blast radius before the goal.
			if directive := strings.TrimSpace(result.Output.Text); directive != "" && directive != strings.TrimSpace(userText) {
				enrichedText := directive + "\n\n" + userText
				return injectEnrichedText(enrichedText)
			}
			return nil
		}
		if err != nil {
			log.Warn("composer: orchestrator process failed", "err", err)
		} else if result == nil {
			log.Debug("composer: orchestrator returned nil result")
		}
		// Fall through to enricher path on failure.
	}

	// --- Lightweight enricher fallback ---
	if b.enricher != nil {
		log.Info("composer: enricher calling", "cwd", session.CWD, "text", truncated)

		enrichResult := b.enricher.EnrichForProject(b.ctx, session.CWD, userText)
		log.Info("composer: enricher result", "strategy", enrichResult.StrategyName)

		if enrichResult.StrategyName != "" {
			channel := "composer:event:" + req.SessionID
			ev := StreamEvent{
				Kind:               EventStrategy,
				RawType:            "strategy",
				StrategyName:       enrichResult.StrategyName,
				StrategyConfidence: 0,
				TaskComplexity:     "",
				TaskRisk:           "",
				BlastRadius:        0,
			}
			if b.logger != nil {
				b.logger.LogEvent(req.SessionID, ev)
			}
			runtime.EventsEmit(b.ctx, channel, ev)
		}

		// Inject the enricher's enriched prompt regardless of strategy name —
		// even without a named strategy, the enricher may have prepended
		// useful codebase context.
		if enriched := strings.TrimSpace(enrichResult.EnrichedPrompt); enriched != "" && enriched != strings.TrimSpace(userText) {
			return injectEnrichedText(enriched)
		}
	}

	return nil
}

// emitEnrichedPrompt sends the enriched prompt text to the frontend so the
// UI can display what was actually sent to Claude. Fire-and-forget — errors
// are logged but never block the send path. No-ops when no enrichment
// happened (enrichedText is empty or identical to the original).
func (b *Bindings) emitEnrichedPrompt(sessionID string, enrichedText string, originalText string) {
	if enrichedText == "" || enrichedText == originalText {
		return // No enrichment happened
	}
	channel := "composer:event:" + sessionID
	ev := StreamEvent{
		Kind:         EventEnrichedPrompt,
		RawType:      "enriched_prompt",
		EnrichedText: enrichedText,
	}
	if b.logger != nil {
		b.logger.LogEvent(sessionID, ev)
	}
	runtime.EventsEmit(b.ctx, channel, ev)
}

// ComposerV2Stop sends a graceful stop signal to the session subprocess.
func (b *Bindings) ComposerV2Stop(sessionID string) {
	session, ok := b.manager.Get(sessionID)
	if !ok {
		return
	}
	session.Stop()
}

// ComposerV2Close removes a session from the Manager, stopping it first
// if still running. Any in-flight turn is marked as error.
func (b *Bindings) ComposerV2Close(sessionID string) {
	// Mark any in-flight turn as error before closing.
	b.turnMu.Lock()
	turnID := b.turnIDs[sessionID]
	responseText := b.turnTexts[sessionID]
	delete(b.turnIDs, sessionID)
	delete(b.turnSeqs, sessionID)
	delete(b.turnTexts, sessionID)
	b.turnMu.Unlock()

	if turnID != "" && b.service != nil {
		b.service.markTurnDone(b.ctx, turnID, "error", 0, 0, 0, responseText)
	}

	b.manager.Close(sessionID)
}

// ComposerV2List returns info for all active sessions.
func (b *Bindings) ComposerV2List() []ManagerSessionInfo {
	return b.manager.List()
}

// ComposerListSessions returns the 50 most recently active sessions from the
// shared SQLite database. Delegates to V1 Service.ListSessions.
func (b *Bindings) ComposerListSessions() []SessionSummary {
	if b.service == nil {
		log.Warn("composer: ComposerListSessions — service is nil")
		return nil
	}
	if b.ctx == nil {
		log.Warn("composer: ComposerListSessions — ctx is nil")
		return nil
	}
	list, err := b.service.ListSessions(b.ctx)
	if err != nil {
		log.Warn("composer: ComposerListSessions failed", "err", err)
		return nil
	}
	log.Info("composer: ComposerListSessions", "count", len(list))
	return list
}

// ComposerHistoryBySession returns all turns for a session from the DB.
// Delegates to V1 Service.HistoryBySession.
func (b *Bindings) ComposerHistoryBySession(sessionID string) []HistoryTurn {
	if b.service == nil || b.ctx == nil {
		return nil
	}
	turns, err := b.service.HistoryBySession(b.ctx, sessionID)
	if err != nil {
		return nil
	}
	return turns
}

// ComposerDeleteSession removes all data for a session from the DB.
func (b *Bindings) ComposerDeleteSession(sessionID string) bool {
	if b.service == nil || b.ctx == nil {
		return false
	}
	return b.service.deleteSession(b.ctx, sessionID) == nil
}
