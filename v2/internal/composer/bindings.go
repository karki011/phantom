// Author: Subash Karki
//
// bindings.go exposes Wails bindings for the Composer V2 subsystem.
// The frontend calls these via (window as any).go.app.App.<Method>.
// Each session emits events on channel "composer:event:{sessionID}".
package composer

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
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

	// onStrategySelected is called after each strategy selection. Used by the
	// strategy monitor TUI to receive real-time events.
	onStrategySelected func(name string, confidence float64, complexity, risk string, blastRadius int)

	// Turn tracking for DB persistence — mirrors V1's per-turn state.
	turnMu       sync.Mutex
	turnIDs      map[string]string // sessionID → current turnID
	turnSeqs     map[string]int    // sessionID → event sequence counter
	turnTexts    map[string]string // sessionID → accumulated response text
}

// SetStrategyCallback registers a function called after each strategy selection.
func (b *Bindings) SetStrategyCallback(fn func(name string, confidence float64, complexity, risk string, blastRadius int)) {
	b.onStrategySelected = fn
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

// GetPerformanceStore returns the performance store for strategy monitoring.
func (b *Bindings) GetPerformanceStore() *strategies.PerformanceStore {
	if !b.engineDepsSet {
		return nil
	}
	return b.engineDeps.Performance
}

// GetRegistry returns the strategy registry for introspection.
func (b *Bindings) GetRegistry() *strategies.Registry {
	if !b.engineDepsSet {
		return nil
	}
	return b.engineDeps.Registry
}

// GetAutoTune returns the auto-tune tracker for monitoring.
func (b *Bindings) GetAutoTune() *strategies.ThresholdTracker {
	if !b.engineDepsSet {
		return nil
	}
	return b.engineDeps.AutoTune
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

	// Reset the watchdog before enrichment so the CLI subprocess isn't killed
	// while we're preparing the enriched prompt.
	session.ResetWatchdog()

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

	// Reset again after enrichment so the CLI has a full 120s to process.
	session.ResetWatchdog()

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
	// Cap total enrichment time to keep first-token latency low. If
	// enrichment takes longer than this, fall through to sending the raw
	// prompt. 2s is enough for warm caches; cold vector-store queries
	// gracefully degrade to unenriched prompts.
	enrichCtx, enrichCancel := context.WithTimeout(b.ctx, 2*time.Second)
	defer enrichCancel()

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
			inferCh := make(chan []string, 1)
			go func() { inferCh <- InferFilesFromPrompt(resolvedIndexer, userText) }()
			select {
			case inferred := <-inferCh:
				if len(inferred) > 0 {
					activeFiles = append(activeFiles, inferred...)
					log.Info("composer: symbol inference",
						"symbols_found", len(inferred),
						"files", inferred,
					)
				}
			case <-enrichCtx.Done():
				log.Warn("composer: symbol inference timed out, proceeding without active files")
			}
		}

		result, err := orchestrator.Process(enrichCtx, turnDeps, orchestrator.ProcessInput{
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

			if b.onStrategySelected != nil {
				b.onStrategySelected(result.Strategy.Name, result.Confidence, result.TaskContext.Complexity, result.TaskContext.Risk, result.Context.BlastRadius)
			}

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

// cliSessionFile is the JSON shape written by the Claude CLI to
// ~/.claude/sessions/<pid>.json. Fields are optional — the CLI writes
// them progressively as the session evolves.
type cliSessionFile struct {
	PID       int64  `json:"pid"`
	SessionID string `json:"sessionId"`
	CWD       string `json:"cwd"`
	StartedAt int64  `json:"startedAt"` // milliseconds since epoch
	UpdatedAt int64  `json:"updatedAt"` // milliseconds since epoch
	Status    string `json:"status"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
}

// ComposerListSessions reads the Claude CLI's own session files from
// ~/.claude/sessions/ (the same source the VSCode extension uses) and
// enriches them with names/first_prompt from the local DB. This avoids
// the timing issues that made the DB-only approach unreliable — the CLI
// files are the ground truth for active sessions.
func (b *Bindings) ComposerListSessions() []SessionSummary {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Warn("composer: ComposerListSessions cannot resolve home dir", "err", err)
		return nil
	}
	sessionsDir := filepath.Join(home, ".claude", "sessions")

	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		// Directory doesn't exist yet — not an error, just no sessions.
		if os.IsNotExist(err) {
			return nil
		}
		log.Warn("composer: ComposerListSessions readdir failed", "err", err)
		return nil
	}

	// Deduplicate by sessionID — multiple PID files can reference the same
	// session (e.g. after a CLI restart). Keep the one with the latest activity.
	seen := make(map[string]int) // sessionID → index in sessions slice
	var sessions []SessionSummary

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(sessionsDir, entry.Name()))
		if err != nil {
			continue // file may have been removed between ReadDir and ReadFile
		}

		var info cliSessionFile
		if json.Unmarshal(data, &info) != nil || info.SessionID == "" {
			continue
		}

		// Use updatedAt for recency; fall back to startedAt.
		activityMs := info.UpdatedAt
		if activityMs == 0 {
			activityMs = info.StartedAt
		}
		activitySec := activityMs / 1000

		if idx, exists := seen[info.SessionID]; exists {
			// Keep the entry with the most recent activity.
			if activitySec > sessions[idx].LastActivity {
				sessions[idx].LastActivity = activitySec
				if info.Name != "" {
					sessions[idx].Name = info.Name
				}
				if info.CWD != "" {
					sessions[idx].Cwd = info.CWD
				}
			}
			continue
		}

		seen[info.SessionID] = len(sessions)
		sessions = append(sessions, SessionSummary{
			SessionID:    info.SessionID,
			Name:         info.Name,
			Cwd:          info.CWD,
			LastActivity: activitySec,
			Source:       "cli",
		})
	}

	// Enrich ALL sessions with ai-title from JSONL project files.
	// The Name field from ~/.claude/sessions/ is a Pokémon name — not useful.
	// Derive the project dir from each session's CWD individually.
	for i := range sessions {
		if sessions[i].FirstPrompt != "" {
			continue
		}
		cwd := sessions[i].Cwd
		if cwd == "" {
			continue
		}
		var cwdBuf strings.Builder
		for _, ch := range cwd {
			if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' {
				cwdBuf.WriteRune(ch)
			} else {
				cwdBuf.WriteByte('-')
			}
		}
		jsonlPath := filepath.Join(home, ".claude", "projects", cwdBuf.String(), sessions[i].SessionID+".jsonl")
		if title := extractAITitle(jsonlPath); title != "" {
			sessions[i].FirstPrompt = title
		}
	}

	// Sort by last activity descending (most recent first).
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].LastActivity > sessions[j].LastActivity
	})

	// Cap at 50.
	if len(sessions) > 50 {
		sessions = sessions[:50]
	}

	// Also include sessions from composer_turns DB (completed sessions whose
	// CLI process has exited — no longer in ~/.claude/sessions/).
	if b.service != nil && b.ctx != nil {
		const dbQ = `SELECT DISTINCT session_id, COALESCE(cwd, ''), COALESCE(prompt, ''),
			COALESCE(model, ''), MAX(started_at) as last
			FROM composer_turns
			WHERE session_id IS NOT NULL AND session_id != '' AND session_id NOT LIKE 'cv2_%'
			GROUP BY session_id
			ORDER BY last DESC LIMIT 50`
		if rows, err := b.service.writer.QueryContext(b.ctx, dbQ); err == nil {
			defer rows.Close()
			for rows.Next() {
				var sid, cwd, prompt, model string
				var lastAt int64
				if rows.Scan(&sid, &cwd, &prompt, &model, &lastAt) != nil {
					continue
				}
				if _, exists := seen[sid]; exists {
					continue // already from CLI files
				}
				seen[sid] = len(sessions)
				label := prompt
				if len(label) > 50 {
					label = label[:50]
				}
				sessions = append(sessions, SessionSummary{
					SessionID:    sid,
					Name:         label,
					Cwd:          cwd,
					FirstPrompt:  prompt,
					LastActivity: lastAt,
					Source:       "phantom",
				})
			}
		}
	}

	// Re-sort after merging both sources.
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].LastActivity > sessions[j].LastActivity
	})
	if len(sessions) > 50 {
		sessions = sessions[:50]
	}

	// Enrich with names and first_prompt from the DB (populated by session_watcher).
	sessions = b.enrichSessionsFromDB(sessions)

	log.Info("composer: ComposerListSessions", "count", len(sessions))
	return sessions
}

// enrichSessionsFromDB looks up each session in the local SQLite DB to fill
// in Name and FirstPrompt when the CLI file didn't provide them. Also filters
// out sessions the user has hidden. Gracefully skips enrichment if the DB is
// unavailable.
func (b *Bindings) enrichSessionsFromDB(sessions []SessionSummary) []SessionSummary {
	if b.service == nil || b.ctx == nil || len(sessions) == 0 {
		return sessions
	}

	// Build a set of session IDs to look up in one query.
	placeholders := make([]string, len(sessions))
	for i, s := range sessions {
		placeholders[i] = "'" + strings.ReplaceAll(s.SessionID, "'", "''") + "'"
	}
	q := fmt.Sprintf(
		`SELECT id, COALESCE(name, ''), COALESCE(first_prompt, ''), COALESCE(status, '')
		 FROM sessions WHERE id IN (%s)`,
		strings.Join(placeholders, ","),
	)

	rows, err := b.service.writer.QueryContext(b.ctx, q)
	if err != nil {
		log.Debug("composer: enrichSessionsFromDB query failed", "err", err)
		return sessions
	}
	defer rows.Close()

	type dbRow struct {
		name        string
		firstPrompt string
		status      string
	}
	lookup := make(map[string]dbRow)
	for rows.Next() {
		var id, name, prompt, status string
		if rows.Scan(&id, &name, &prompt, &status) == nil {
			lookup[id] = dbRow{name: name, firstPrompt: prompt, status: status}
		}
	}

	// Apply DB data and filter out hidden sessions.
	out := sessions[:0]
	for i := range sessions {
		row, ok := lookup[sessions[i].SessionID]
		if ok {
			// Skip sessions the user has dismissed.
			if row.status == "hidden" {
				continue
			}
			// CLI file name takes precedence; DB fills the gap.
			if sessions[i].Name == "" && row.name != "" {
				sessions[i].Name = row.name
			}
			if row.firstPrompt != "" {
				sessions[i].FirstPrompt = row.firstPrompt
			}
			sessions[i].WasInterrupted = row.status == "error" || row.status == "interrupted"
		}
		out = append(out, sessions[i])
	}

	return out
}

// ComposerHistoryBySession returns all turns for a session from the DB.
// Delegates to V1 Service.HistoryBySession.
func (b *Bindings) ComposerHistoryBySession(sessionID string) []HistoryTurn {
	if b.service == nil || b.ctx == nil {
		return nil
	}
	turns, err := b.service.HistoryBySession(b.ctx, sessionID)
	if err != nil {
		log.Warn("composer: HistoryBySession failed", "sessionID", sessionID, "err", err)
		return nil
	}
	log.Info("composer: HistoryBySession", "sessionID", sessionID, "turns", len(turns))
	return turns
}

// ComposerDeleteSession removes all data for a session from the DB.
func (b *Bindings) ComposerDeleteSession(sessionID string) bool {
	if b.service == nil || b.ctx == nil {
		return false
	}
	// Mark session as hidden (not deleted — session_watcher would re-create it).
	// Also clean up composer turn/event data.
	_, _ = b.service.writer.ExecContext(b.ctx, `UPDATE sessions SET status = 'hidden' WHERE id = ?`, sessionID)
	_ = b.service.deleteSession(b.ctx, sessionID)

	// Delete the JSONL transcript from ~/.claude/projects/{path}/ so the
	// session doesn't reappear in the sidebar from the JSONL scanner.
	if home, err := os.UserHomeDir(); err == nil {
		projectsDir := filepath.Join(home, ".claude", "projects")
		if entries, err := os.ReadDir(projectsDir); err == nil {
			for _, dir := range entries {
				if !dir.IsDir() {
					continue
				}
				jsonlPath := filepath.Join(projectsDir, dir.Name(), sessionID+".jsonl")
				if err := os.Remove(jsonlPath); err == nil {
					log.Info("composer: deleted JSONL transcript", "session_id", sessionID, "path", jsonlPath)
					break
				}
			}
		}
	}

	return true
}

// ── Control Request bindings ────────────────────────────────────────────
// These methods send mid-session control requests to the Claude CLI subprocess
// using the control_request/control_response protocol. Each wraps
// Session.ControlRequest with the appropriate subtype and payload.

// ComposerV2SetModel changes the active model mid-session.
// Example subtypes: "opus", "sonnet", "haiku", or full model IDs.
func (b *Bindings) ComposerV2SetModel(sessionID, model string) error {
	session, ok := b.manager.Get(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	_, err := session.ControlRequest("set_model", map[string]interface{}{
		"model": model,
	})
	return err
}

// ComposerV2SetThinking adjusts the thinking token budget mid-session.
// Pass 0 to disable thinking, or a positive value (e.g. 16384) to set the cap.
func (b *Bindings) ComposerV2SetThinking(sessionID string, maxTokens int) error {
	session, ok := b.manager.Get(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	_, err := session.ControlRequest("set_max_thinking_tokens", map[string]interface{}{
		"max_thinking_tokens": maxTokens,
	})
	return err
}

// ComposerV2SetPermissionMode changes the permission mode mid-session.
// Valid modes: "ask", "auto", "bypassPermissions".
func (b *Bindings) ComposerV2SetPermissionMode(sessionID, mode string) error {
	session, ok := b.manager.Get(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	_, err := session.ControlRequest("set_permission_mode", map[string]interface{}{
		"permission_mode": mode,
	})
	return err
}

// ComposerV2GenerateTitle asks the CLI to auto-generate a session title
// based on conversation context. Returns the generated title string.
func (b *Bindings) ComposerV2GenerateTitle(sessionID string) (string, error) {
	session, ok := b.manager.Get(sessionID)
	if !ok {
		return "", fmt.Errorf("session not found: %s", sessionID)
	}
	resp, err := session.ControlRequest("generate_session_title", map[string]interface{}{})
	if err != nil {
		return "", err
	}
	if title, ok := resp["title"].(string); ok {
		return title, nil
	}
	return "", nil
}

// ComposerV2Interrupt sends an interrupt control request to stop the CLI's
// current processing without killing the session.
func (b *Bindings) ComposerV2Interrupt(sessionID string) error {
	session, ok := b.manager.Get(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	_, err := session.ControlRequest("interrupt", map[string]interface{}{})
	return err
}

// ClaudeProjectSession is one entry from the ~/.claude/projects/{path}/ JSONL
// history. It is returned by ListClaudeProjectSessions.
type ClaudeProjectSession struct {
	SessionID    string `json:"session_id"`
	Title        string `json:"title"`
	LastActivity int64  `json:"last_activity"` // unix seconds
	Size         int64  `json:"size"`          // file size in bytes
}

// ListClaudeProjectSessions scans ~/.claude/projects/{cwd-as-path}/ for
// *.jsonl session transcript files and returns a summary of the 50 most
// recent ones, sorted by file mtime descending.
//
// Only top-level JSONL files are scanned — UUID sub-directories that contain
// sub-agent transcripts are skipped entirely. At most the first 50 lines of
// each file are read to locate the optional "ai-title" event; the rest of the
// transcript is not loaded into memory.
func (b *Bindings) ListClaudeProjectSessions(cwd string) []ClaudeProjectSession {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Warn("composer: ListClaudeProjectSessions cannot resolve home dir", "err", err)
		return nil
	}

	// Convert CWD to the Claude projects directory path.
	// Claude CLI replaces every non-alphanumeric character (except -) with -.
	// e.g. /Users/subash.karki/CZ/feature-web-apps → -Users-subash-karki-CZ-feature-web-apps
	var buf strings.Builder
	for _, ch := range cwd {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' {
			buf.WriteRune(ch)
		} else {
			buf.WriteByte('-')
		}
	}
	projectDir := filepath.Join(home, ".claude", "projects", buf.String())

	entries, err := os.ReadDir(projectDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		log.Warn("composer: ListClaudeProjectSessions readdir failed", "err", err, "dir", projectDir)
		return nil
	}

	type candidate struct {
		id    string
		mtime int64
		path  string
	}
	var candidates []candidate
	cutoff := time.Now().Add(-24 * time.Hour).Unix()

	for _, entry := range entries {
		// Skip sub-directories (sub-agent UUID dirs).
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".jsonl") {
			continue
		}
		id := strings.TrimSuffix(name, ".jsonl")
		info, err := entry.Info()
		if err != nil {
			continue
		}
		// Skip absurdly large files.
		if info.Size() > 100*1024*1024 {
			continue
		}
		// Only include sessions from the last 24 hours.
		if info.ModTime().Unix() < cutoff {
			continue
		}
		candidates = append(candidates, candidate{
			id:    id,
			mtime: info.ModTime().Unix(),
			path:  filepath.Join(projectDir, name),
		})
	}

	// Sort by mtime descending, cap at 50.
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].mtime > candidates[j].mtime
	})
	if len(candidates) > 50 {
		candidates = candidates[:50]
	}

	// For each candidate, read at most 50 lines looking for ai-title.
	results := make([]ClaudeProjectSession, 0, len(candidates))
	for _, c := range candidates {
		title := extractAITitle(c.path)
		info, err := os.Stat(c.path)
		var size int64
		if err == nil {
			size = info.Size()
		}
		results = append(results, ClaudeProjectSession{
			SessionID:    c.id,
			Title:        title,
			LastActivity: c.mtime,
			Size:         size,
		})
	}

	log.Info("composer: ListClaudeProjectSessions", "cwd", cwd, "count", len(results))
	return results
}

// extractAITitle reads a JSONL file looking for an ai-title event.
// Falls back to the first user message if no ai-title is found.
func extractAITitle(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	type aiTitleEvent struct {
		Type    string `json:"type"`
		AITitle string `json:"aiTitle"`
	}
	type userMsgEvent struct {
		Type    string      `json:"type"`
		Message interface{} `json:"message"`
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 128*1024), 128*1024)
	lines := 0
	firstUserMsg := ""
	for scanner.Scan() {
		lines++
		if lines > 200 {
			break
		}
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		lineStr := string(line)
		if strings.Contains(lineStr, "ai-title") {
			var ev aiTitleEvent
			if json.Unmarshal(line, &ev) == nil && ev.Type == "ai-title" && ev.AITitle != "" {
				return ev.AITitle
			}
		}
		if firstUserMsg == "" && strings.Contains(lineStr, `"type":"user"`) {
			var um userMsgEvent
			if json.Unmarshal(line, &um) == nil && um.Type == "user" {
				switch msg := um.Message.(type) {
				case string:
					firstUserMsg = msg
				case map[string]interface{}:
					if c, ok := msg["content"].(string); ok {
						firstUserMsg = c
					}
				}
				if len(firstUserMsg) > 80 {
					firstUserMsg = firstUserMsg[:80] + "…"
				}
			}
		}
	}
	return firstUserMsg
}

// claudeProjectDir returns the ~/.claude/projects/{path}/ directory for the
// first CWD found in active CLI sessions, or "" if unavailable.
func (b *Bindings) claudeProjectDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	sessionsDir := filepath.Join(home, ".claude", "sessions")
	entries, _ := os.ReadDir(sessionsDir)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(sessionsDir, entry.Name()))
		if err != nil {
			continue
		}
		var info cliSessionFile
		if json.Unmarshal(data, &info) == nil && info.CWD != "" {
			var buf strings.Builder
			for _, ch := range info.CWD {
				if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' {
					buf.WriteRune(ch)
				} else {
					buf.WriteByte('-')
				}
			}
			dir := filepath.Join(home, ".claude", "projects", buf.String())
			if _, err := os.Stat(dir); err == nil {
				return dir
			}
		}
	}
	return ""
}

// JSONLMessage is a user or assistant message extracted from a Claude session JSONL.
type JSONLMessage struct {
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
}

// ReadSessionJSONL reads a Claude session JSONL file and returns user + assistant
// text messages for rehydrating the composer UI.
func (b *Bindings) ReadSessionJSONL(cwd, sessionID string) []JSONLMessage {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	var pathBuf strings.Builder
	for _, ch := range cwd {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' {
			pathBuf.WriteRune(ch)
		} else {
			pathBuf.WriteByte('-')
		}
	}
	path := filepath.Join(home, ".claude", "projects", pathBuf.String(), sessionID+".jsonl")

	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	type jsonlEntry struct {
		Type      string      `json:"type"`
		Message   interface{} `json:"message"`
		Timestamp string      `json:"timestamp"`
	}

	var messages []JSONLMessage
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 256*1024), 256*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var entry jsonlEntry
		if json.Unmarshal(line, &entry) != nil {
			continue
		}

		if entry.Type != "user" && entry.Type != "assistant" {
			continue
		}

		var text string
		switch msg := entry.Message.(type) {
		case string:
			text = msg
		case map[string]interface{}:
			if content, ok := msg["content"]; ok {
				switch c := content.(type) {
				case string:
					text = c
				case []interface{}:
					for _, block := range c {
						if bm, ok := block.(map[string]interface{}); ok {
							if bm["type"] == "text" {
								if t, ok := bm["text"].(string); ok {
									text += t + "\n"
								}
							}
						}
					}
				}
			}
		}

		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}

		role := "user"
		if entry.Type == "assistant" {
			role = "assistant"
		}
		messages = append(messages, JSONLMessage{
			Role:      role,
			Content:   text,
			Timestamp: entry.Timestamp,
		})
	}

	return messages
}
