// Author: Subash Karki
//
// Package composer — agentic edit pane backed by the `claude` CLI.
//
// The service uses an optimised resume model: every pane gets a session ID
// allocated on first Send. The first turn spawns `claude -p` with
// `--session-id <uuid>` + `--input-format stream-json` (prompt sent as
// structured JSON on stdin). Subsequent turns use `--resume <uuid>` so the
// Anthropic API prompt cache is warm, giving 2-5x faster first-token.
//
// Streaming uses `--output-format stream-json --verbose` which produces a
// richer event protocol including `content_block_delta`, `message_start`,
// `message_stop`, and hook events alongside the existing `assistant`,
// `tool_result`, and `result` types.
//
// Edit detection (v0): every Write/Edit/MultiEdit tool_use produced by the
// agent yields a composer:edit-pending event. The user accepts a card to
// keep the on-disk change or discards it (which runs `git checkout -- file`).
// We do NOT veto tool calls — claude writes first, we render second.
package composer

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"

	"github.com/subashkarki/phantom-os-v2/internal/ai/evaluator"
	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/orchestrator"
	"github.com/subashkarki/phantom-os-v2/internal/ai/verifier"
	"github.com/subashkarki/phantom-os-v2/internal/conflict"
	"github.com/subashkarki/phantom-os-v2/internal/namegen"
)

// IndexerResolver resolves a turn's CWD to the file-graph indexer for the
// project that owns it. Returns nil when no project matches the cwd — the
// orchestrator handles a nil Indexer by skipping graph-derived signals.
//
// Called per-turn (not cached) because the user can switch active worktrees
// mid-session. Implementations should be cheap and non-blocking.
type IndexerResolver func(cwd string) *filegraph.Indexer

const (
	defaultModel = "opus"
	// maxResponseText caps the persisted assistant text per turn at 1 MiB.
	// Beyond that we silently drop further chunks so a runaway agent can't
	// balloon a single row to disk-busting size. The live stream UI still
	// gets every delta; only the persisted copy is truncated.
	maxResponseText = 1 << 20
)

// Service runs Composer turns per pane.
type Service struct {
	writer *sql.DB
	emit   func(name string, data interface{})

	// runs is keyed by paneID — value is a cancel func for the active run.
	mu   sync.Mutex
	runs map[string]context.CancelFunc

	// sessions remembers the claude --session-id assigned to each pane so
	// subsequent turns reuse the same session for context continuity.
	sessions map[string]string

	// sessionStarted tracks whether a pane's session has been used at least
	// once. First turn uses `--session-id <uuid>` to create. Subsequent
	// turns use `--resume <uuid>` because claude rejects --session-id reuse.
	sessionStarted map[string]bool

	// engineDeps wires Phantom's AI engine (orchestrator + knowledge stores
	// + verifier) into every Composer turn. When zero-valued, Send falls
	// back to the raw user prompt with no strategy enrichment and no
	// outcome recording — same behaviour as before this connection landed.
	engineDeps orchestrator.Dependencies

	// indexerResolver resolves a turn's CWD to the project's file-graph
	// indexer. When set, Send overlays the resolved Indexer onto a copy of
	// engineDeps before each orchestrator.Process call so graph-derived
	// signals (blast radius, related files) reach strategy selection.
	// nil resolver or nil result both leave Indexer unset — orchestrator
	// degrades gracefully.
	indexerResolver IndexerResolver

	// conflicts tracks active editing sessions and detects when multiple
	// Composer panes (or other sources) target the same repo or edit the
	// same files. Optional — nil means conflict detection is disabled.
	conflicts *conflict.Tracker
}

// NewService constructs a Composer service. emit should be wired to
// wailsRuntime.EventsEmit.
func NewService(writer *sql.DB, emit func(string, interface{})) *Service {
	return &Service{
		writer:         writer,
		emit:           emit,
		runs:           make(map[string]context.CancelFunc),
		sessions:       make(map[string]string),
		sessionStarted: make(map[string]bool),
	}
}

// SetEngineDeps wires Phantom's AI engine into the Composer service. Call
// this after construction, before Wails Startup completes. Passing a
// zero-valued Dependencies disables engine enrichment; orchestrator.Process
// degrades gracefully when individual fields (Decisions, Indexer, etc.) are
// nil so partial wiring is safe.
func (s *Service) SetEngineDeps(deps orchestrator.Dependencies) {
	s.engineDeps = deps
}

// SetIndexerResolver registers a per-turn lookup that maps the turn's CWD to
// a file-graph indexer. Pass nil to clear. The resolver runs on every Send
// call (the active worktree can change mid-session), so it must be cheap.
func (s *Service) SetIndexerResolver(resolve IndexerResolver) {
	s.indexerResolver = resolve
}

// SetConflictTracker wires the session conflict tracker into the Composer
// service. When set, Send registers each pane as an active session and
// maybeRecordEdit tracks file-level overlaps. Passing nil disables conflict
// detection.
func (s *Service) SetConflictTracker(t *conflict.Tracker) {
	s.conflicts = t
	if t == nil {
		return
	}
	t.OnConflict(func(c conflict.Conflict) {
		s.emit("composer:conflict", map[string]interface{}{
			"pane_id":  c.SessionA.ID,
			"conflict": c,
		})
		s.emit("composer:conflict", map[string]interface{}{
			"pane_id":  c.SessionB.ID,
			"conflict": c,
		})
	})
}

// ---------------------------------------------------------------------------
// Public API (called from Wails bindings)
// ---------------------------------------------------------------------------

// Send starts a new turn. Returns the new turn ID. Streaming events flow on
// "composer:event" and edit cards on "composer:edit-pending".
func (s *Service) Send(ctx context.Context, args SendArgs) (string, error) {
	if strings.TrimSpace(args.Prompt) == "" && len(args.Mentions) == 0 {
		return "", fmt.Errorf("composer: empty prompt")
	}
	if args.Model == "" {
		args.Model = defaultModel
	}

	cliPath, err := ResolveClaudeBin()
	if err != nil {
		s.emit("composer:event", Event{PaneID: args.PaneID, Type: "error", Content: "claude CLI not found in PATH"})
		return "", fmt.Errorf("composer: claude CLI not found: %w", err)
	}

	// Cancel any in-flight run for this pane (one run per pane).
	log.Info("composer: Send called", "pane_id", args.PaneID, "prompt_len", len(args.Prompt))
	s.cancelExisting(args.PaneID)

	turnID := uuid.New().String()
	now := time.Now().Unix()

	// Allocate / re-use a session ID per pane so claude --resume works.
	// First turn uses --session-id (creates). Subsequent uses --resume.
	s.mu.Lock()
	sessionID, ok := s.sessions[args.PaneID]
	if !ok {
		sessionID = uuid.New().String()
		s.sessions[args.PaneID] = sessionID
	}
	isResume := s.sessionStarted[args.PaneID]
	// Mark started before spawn so a fast re-send on the same pane uses --resume.
	s.sessionStarted[args.PaneID] = true
	s.mu.Unlock()

	// When starting a brand-new session, eagerly insert a row into the
	// `sessions` table with a generated Pokémon name so the sidebar picks
	// it up immediately (before the session watcher sees the JSONL file).
	// Uses INSERT OR IGNORE so it's idempotent if the watcher beats us.
	if !isResume {
		existing := s.queryExistingSessionNames(ctx)
		sessionName := namegen.GenerateUnique(existing)
		if err := s.ensureSessionRow(ctx, sessionID, sessionName, args.CWD, args.Model, args.Prompt); err != nil {
			log.Warn("composer: ensureSessionRow failed", "err", err)
		}
		// Notify the frontend immediately so the sidebar shows the session
		// name before any AI response arrives.
		s.emit("composer:event", Event{
			PaneID:      args.PaneID,
			Type:        "session_started",
			SessionID:   sessionID,
			SessionName: sessionName,
		})
	}

	// Persist the turn row up front.
	if err := s.insertTurn(ctx, &Turn{
		ID:        turnID,
		PaneID:    args.PaneID,
		SessionID: sessionID,
		CWD:       args.CWD,
		Prompt:    args.Prompt,
		Model:     args.Model,
		Status:    "running",
		StartedAt: now,
	}); err != nil {
		log.Warn("composer: insertTurn failed", "err", err)
	}

	// Build the prompt with @file mentions inlined as <file> tags.
	prompt := buildPromptWithMentions(args.Prompt, args.Mentions, args.CWD)

	// Route through Phantom's AI engine: pick a strategy, gather graph
	// context, record a decision. Skipped entirely in NoContext mode (the
	// user explicitly asked for no workspace awareness) or when the engine
	// isn't wired. The orchestrator returns a deterministic enriched prompt
	// in result.Output.Text — we prepend it as a directive prelude so the
	// CLI sees strategy guidance before the user's raw goal.
	var decisionID string
	if !args.NoContext {
		// Resolve the per-turn file-graph indexer from cwd. The base deps
		// are immutable across turns; we only overlay Indexer here so each
		// Send sees the correct project graph (the user can switch active
		// worktrees mid-session).
		turnDeps := s.engineDeps
		if s.indexerResolver != nil && args.CWD != "" {
			if ix := s.indexerResolver(args.CWD); ix != nil {
				turnDeps.Indexer = ix
			}
		}
		if result, err := orchestrator.Process(ctx, turnDeps, orchestrator.ProcessInput{
			Goal:        args.Prompt,
			ActiveFiles: mentionPaths(args.Mentions, args.CWD),
		}); err == nil && result != nil {
			if result.Learning != nil {
				decisionID = result.Learning.DecisionID
			}
			if directive := strings.TrimSpace(result.Output.Text); directive != "" && directive != strings.TrimSpace(args.Prompt) {
				prompt = directive + "\n\n" + prompt
			}
			// Emit strategy metadata so the frontend can render it as a
			// collapsible chip in the turn. Fires once per turn, before
			// the CLI run starts.
			s.emit("composer:event", Event{
				PaneID:             args.PaneID,
				TurnID:             turnID,
				Type:               "strategy",
				StrategyName:       result.Strategy.Name,
				StrategyConfidence: result.Confidence,
				TaskComplexity:     result.TaskContext.Complexity,
				TaskRisk:           result.TaskContext.Risk,
				BlastRadius:        result.Context.BlastRadius,
			})
		} else if err != nil {
			// Surface but don't bypass — KISS, fail loud.
			log.Warn("composer: orchestrator process failed", "err", err)
		}
	}

	// Register this pane as an active conflict-tracking session. The tracker
	// fires repo-level conflict callbacks synchronously inside Register,
	// which in turn emits "composer:conflict" events to both panes.
	if s.conflicts != nil && args.CWD != "" {
		s.conflicts.Register(conflict.Session{
			ID:        args.PaneID,
			SessionID: sessionID,
			Name:      "",
			Source:    "composer",
			RepoCWD:   args.CWD,
			StartedAt: time.Now(),
		})
	}

	runCtx, cancel := context.WithCancel(ctx)
	s.mu.Lock()
	s.runs[args.PaneID] = cancel
	s.mu.Unlock()

	go s.run(runCtx, cliPath, args, sessionID, isResume, turnID, prompt, decisionID)
	return turnID, nil
}

// mentionPaths flattens Mentions into absolute paths for the orchestrator.
// Empty / unresolved entries are dropped — empty input is fine, the
// orchestrator handles it.
func mentionPaths(mentions []Mention, cwd string) []string {
	if len(mentions) == 0 {
		return nil
	}
	out := make([]string, 0, len(mentions))
	for _, m := range mentions {
		p := m.Path
		if p == "" {
			continue
		}
		if !filepath.IsAbs(p) && cwd != "" {
			p = filepath.Join(cwd, p)
		}
		out = append(out, p)
	}
	return out
}

// IsRunning returns true when the pane has an in-flight run (a context
// cancel func registered in the runs map). Used by the frontend on pane
// remount so it can re-subscribe to events and keep the "running" indicator
// alive instead of treating the session as dead.
func (s *Service) IsRunning(paneID string) bool {
	s.mu.Lock()
	_, ok := s.runs[paneID]
	s.mu.Unlock()
	return ok
}

// NewConversation drops the cached session for a pane so the next Send
// starts a fresh claude conversation (next call uses --session-id again).
// Cancels any in-flight run first.
func (s *Service) NewConversation(paneID string) {
	log.Info("composer: NewConversation called", "pane_id", paneID)
	s.cancelExisting(paneID)
	s.mu.Lock()
	delete(s.sessions, paneID)
	delete(s.sessionStarted, paneID)
	s.mu.Unlock()
	// Clear conflict state for the old session.
	if s.conflicts != nil {
		s.conflicts.UnregisterFiles(paneID)
		s.conflicts.Unregister(paneID)
	}
}

// Cancel kills the active run on a pane (if any).
func (s *Service) Cancel(paneID string) {
	log.Info("composer: Cancel called", "pane_id", paneID)
	s.cancelExisting(paneID)
}

// DecideEdit applies the user's accept/discard choice to a pending edit.
//
//	accept=true   → mark accepted (file already on disk; nothing else to do)
//	accept=false  → run `git checkout -- <path>` to revert to HEAD
func (s *Service) DecideEdit(ctx context.Context, editID string, accept bool) error {
	row, err := s.getEdit(ctx, editID)
	if err != nil {
		return err
	}
	if row.Status != EditPending {
		return fmt.Errorf("composer: edit %s already decided (%s)", editID, row.Status)
	}

	if !accept && row.Path != "" {
		// Best-effort revert. If the file isn't tracked, `git checkout` will
		// fail — fall back to writing the captured OldContent (may be empty
		// for newly-created files, in which case we delete).
		if err := revertFile(row.Path, row.OldContent); err != nil {
			log.Warn("composer: revert failed", "path", row.Path, "err", err)
		}
	}

	now := time.Now().Unix()
	status := EditAccepted
	if !accept {
		status = EditDiscarded
	}
	if err := s.updateEditStatus(ctx, editID, status, now); err != nil {
		return err
	}

	// Notify any open panes so they can update their card UI.
	s.emit("composer:edit-decided", map[string]interface{}{
		"id":     editID,
		"status": status,
	})
	return nil
}

// History returns all turns for a pane plus every edit grouped by turn.
// Used on pane mount to rehydrate the conversation feed so users don't
// see a blank slate after re-opening a Composer.
type HistoryTurn struct {
	Turn  Turn   `json:"turn"`
	Edits []Edit `json:"edits"`
}

func (s *Service) History(ctx context.Context, paneID string) ([]HistoryTurn, error) {
	turns, err := s.queryTurnsForPane(ctx, paneID)
	if err != nil {
		return nil, err
	}
	out := make([]HistoryTurn, 0, len(turns))
	for _, t := range turns {
		edits, err := s.queryEditsForTurn(ctx, t.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, HistoryTurn{Turn: t, Edits: edits})
	}
	return out, nil
}

// ListPending returns all pending edit cards for a pane.
func (s *Service) ListPending(ctx context.Context, paneID string) ([]Edit, error) {
	return s.queryPendingEdits(ctx, paneID)
}

// ListSessions returns the 50 most recently active claude sessions known
// to Composer, in descending last-activity order. Drives the "Past
// Sessions" sidebar so users can resume work across panes.
func (s *Service) ListSessions(ctx context.Context) ([]SessionSummary, error) {
	return s.querySessionSummaries(ctx, 50)
}

// HistoryBySession is the session-keyed analogue of History — returns every
// turn that touched the given claude session_id, regardless of which pane
// originated it. Used when re-opening a past session in a fresh pane so the
// new pane sees the full conversation, not just turns it produced.
func (s *Service) HistoryBySession(ctx context.Context, sessionID string) ([]HistoryTurn, error) {
	turns, err := s.queryTurnsForSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	out := make([]HistoryTurn, 0, len(turns))
	for _, t := range turns {
		edits, err := s.queryEditsForTurn(ctx, t.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, HistoryTurn{Turn: t, Edits: edits})
	}
	return out, nil
}

// ResumeSession pre-populates the in-memory session map for a pane so the
// next Send issues `claude --resume <sessionID>` instead of allocating a
// fresh session. Idempotent and OVERWRITES any prior pane→session mapping
// (the user explicitly asked to resume this one).
func (s *Service) ResumeSession(paneID, sessionID string) {
	if paneID == "" || sessionID == "" {
		return
	}
	s.mu.Lock()
	s.sessions[paneID] = sessionID
	s.sessionStarted[paneID] = true
	s.mu.Unlock()
}

// DeleteSession hard-deletes every turn + edit for the given session_id and
// detaches any pane currently bound to it. If a pane is mid-run on this
// session, the run is cancelled. Returns nil on missing session — "delete
// nothing" is success. The caller is responsible for clearing UI state.
func (s *Service) DeleteSession(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return fmt.Errorf("composer: empty session id")
	}

	// Detach in-memory session bindings + collect panes that need their
	// in-flight runs cancelled. We snapshot under the lock then cancel
	// outside it so cancelExisting's own lock acquisition can't deadlock.
	s.mu.Lock()
	var paneIDs []string
	for paneID, sid := range s.sessions {
		if sid == sessionID {
			paneIDs = append(paneIDs, paneID)
			delete(s.sessions, paneID)
			delete(s.sessionStarted, paneID)
		}
	}
	s.mu.Unlock()

	for _, paneID := range paneIDs {
		s.cancelExisting(paneID)
	}

	return s.deleteSession(ctx, sessionID)
}

// ---------------------------------------------------------------------------
// Internal — run loop
// ---------------------------------------------------------------------------

func (s *Service) run(ctx context.Context, cliPath string, args SendArgs, sessionID string, isResume bool, turnID, prompt, decisionID string) {
	defer func() {
		s.mu.Lock()
		delete(s.runs, args.PaneID)
		s.mu.Unlock()
	}()
	// Close the learning loop: after every Composer turn (success, error, or
	// cancel) run the project verifier and write the outcome to ai_outcomes.
	// Async + best-effort — must never block the next user prompt.
	defer s.recordVerifierOutcome(decisionID, args.CWD)

	// Capture the response text via pointer so the evaluator defer (registered
	// before the run-loop builds responseText) sees the final accumulated
	// string. Diagnostic-only — runs alongside the verifier, never gates it.
	var responseTextRef *strings.Builder
	defer func() {
		if responseTextRef == nil {
			return
		}
		s.recordEvaluatorOutcome(decisionID, args.CWD, responseTextRef.String())
	}()

	// First turn: --session-id <id> creates the session.
	// Subsequent turns: --resume <id> attaches to the existing one.
	// claude rejects --session-id reuse with "Session ID is already in use".
	sessionFlag := "--session-id"
	if isResume {
		sessionFlag = "--resume"
	}

	// Prompt is passed as a CLI argument to -p. The --resume flag on
	// subsequent turns keeps the Anthropic API prompt cache warm (2-5x
	// faster first-token). --output-format stream-json gives us the rich
	// event protocol for tool calls, thinking, and content deltas.
	cliArgs := []string{
		"-p", prompt,
		"--output-format", "stream-json",
		"--verbose",
		"--include-partial-messages",
		"--include-hook-events",
		"--permission-mode", "acceptEdits",
		sessionFlag, sessionID,
		"--model", args.Model,
	}
	// Effort level — "auto" or empty means "don't pass the flag" (default).
	if args.Effort != "" && args.Effort != "auto" {
		cliArgs = append(cliArgs, "--effort", args.Effort)
	}
	// "No project context" mode — strip every source of workspace awareness
	// so the agent answers from its own knowledge only. Mirrors the legacy
	// Chat pane behaviour. Default behaviour (no flag) is unchanged.
	if args.NoContext {
		cliArgs = append(cliArgs, "--setting-sources", "")
	}
	cmd := exec.CommandContext(ctx, cliPath, cliArgs...)

	// CWD selection:
	//   - NoContext: always a fresh temp dir so no CLAUDE.md / .claude/
	//     in any ancestor of the user's worktree leaks into the run.
	//   - Default:  active worktree's project root, falling back to a temp
	//     dir when the pane has no associated worktree yet.
	switch {
	case args.NoContext:
		tmp, _ := os.MkdirTemp("", "composer-noctx-*")
		cmd.Dir = tmp
		defer os.RemoveAll(tmp)
	case args.CWD != "":
		cmd.Dir = args.CWD
	default:
		tmp, _ := os.MkdirTemp("", "phantom-composer-*")
		cmd.Dir = tmp
		defer os.RemoveAll(tmp)
	}

	// Inject ANTHROPIC_API_KEY when a BYOK key is present. NOTE: never log
	// cmd.Env — the slice contains the bare secret. See redactEnv() below.
	cmd.Env = os.Environ()
	if key, ok := GetAnthropicAPIKey(); ok {
		cmd.Env = append(cmd.Env, "ANTHROPIC_API_KEY="+key)
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		s.emit("composer:event", Event{PaneID: args.PaneID, Type: "error", Content: fmt.Sprintf("stdin pipe: %v", err)})
		s.markTurnError(ctx, turnID)
		return
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		s.emit("composer:event", Event{PaneID: args.PaneID, Type: "error", Content: fmt.Sprintf("stdout pipe: %v", err)})
		s.markTurnError(ctx, turnID)
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		s.emit("composer:event", Event{PaneID: args.PaneID, Type: "error", Content: fmt.Sprintf("stderr pipe: %v", err)})
		s.markTurnError(ctx, turnID)
		return
	}

	if err := cmd.Start(); err != nil {
		s.emit("composer:event", Event{PaneID: args.PaneID, Type: "error", Content: fmt.Sprintf("start: %v", err)})
		s.markTurnError(ctx, turnID)
		return
	}

	// Close stdin immediately — prompt was passed as CLI arg to -p.
	_ = stdin.Close()

	var stderrBuf strings.Builder
	go func() {
		sc := bufio.NewScanner(stderr)
		for sc.Scan() {
			stderrBuf.WriteString(sc.Text())
			stderrBuf.WriteString("\n")
		}
	}()

	var totalIn, totalOut int64
	var totalCost float64
	// Accumulate the assistant's streamed text so we can flush it to the
	// composer_turns row at done/error/cancelled. Capped by maxResponseText
	// so a runaway agent can't balloon the row past SQLite's friendly size.
	var responseText strings.Builder
	// Expose responseText to the evaluator defer registered above. The defer
	// reads via pointer after the run loop completes so it sees the final
	// accumulated text regardless of which exit path (done / error / cancel)
	// run() takes.
	responseTextRef = &responseText

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		var typ string
		_ = json.Unmarshal(raw["type"], &typ)

		// stream_event is an envelope — unwrap the inner event object.
		if typ == "stream_event" {
			if innerRaw, ok := raw["event"]; ok {
				var inner map[string]json.RawMessage
				if json.Unmarshal(innerRaw, &inner) == nil {
					raw = inner
					_ = json.Unmarshal(inner["type"], &typ)
				}
			}
		}

		switch typ {
		// ---- Legacy / primary event types (always present) ----
		case "assistant":
			s.handleAssistant(ctx, args.PaneID, turnID, args.CWD, raw["message"], &responseText)
		case "tool_result":
			s.handleToolResult(args.PaneID, turnID, raw)
		case "result":
			in, out, cost := parseResult(raw)
			totalIn, totalOut, totalCost = in, out, cost
			var resultText string
			_ = json.Unmarshal(raw["result"], &resultText)
			s.emit("composer:event", Event{
				PaneID:       args.PaneID,
				TurnID:       turnID,
				Type:         "result",
				Content:      resultText,
				InputTokens:  in,
				OutputTokens: out,
				CostUSD:      cost,
			})
		case "error":
			var msg string
			_ = json.Unmarshal(raw["error"], &msg)
			s.emit("composer:event", Event{PaneID: args.PaneID, TurnID: turnID, Type: "error", Content: msg})

		// ---- Richer stream-json events (from --input-format stream-json) ----
		// content_block_delta carries incremental text/thinking chunks that
		// supplement (or in some CLI versions replace) the batched "assistant"
		// events. We handle them so streaming feels instant.
		case "content_block_delta":
			s.handleContentBlockDelta(args.PaneID, turnID, raw, &responseText)

		// content_block_start can carry tool_use blocks; handle the same way
		// as the assistant-level tool_use for edit tracking.
		case "content_block_start":
			s.handleContentBlockStart(ctx, args.PaneID, turnID, args.CWD, raw)

		// message_start / message_stop / content_block_stop are structural
		// markers — pass through as typed events so the frontend can use
		// them for lifecycle UI (typing indicator, etc.) if it wants.
		case "message_start", "message_stop", "content_block_stop":
			s.emit("composer:event", Event{PaneID: args.PaneID, TurnID: turnID, Type: typ})

		// system events carry hook lifecycle info — already handled by
		// --include-hook-events, just forward for observability.
		case "system":
			// No-op: hook events are informational, don't surface to user.

		// Unknown types: silently drop. The CLI may add new event types in
		// future versions; crashing on them would be worse than ignoring.
		default:
			log.Debug("composer: unknown stream event type", "type", typ)
		}
	}

	if err := cmd.Wait(); err != nil && ctx.Err() == nil {
		errMsg := strings.TrimSpace(stderrBuf.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		log.Warn("composer: cli wait", "err", err, "stderr", strings.TrimSpace(stderrBuf.String()))
		s.emit("composer:event", Event{PaneID: args.PaneID, TurnID: turnID, Type: "error", Content: friendlyComposerError(errMsg)})
		s.markTurnError(ctx, turnID)
		return
	}

	// Flush the accumulated assistant text along with the final status so
	// re-opened sessions can show the full conversation. We use a fresh
	// background context for the write because the caller's ctx may have
	// already been cancelled (cancellation path) — a 5s deadline keeps
	// shutdown predictable even if the writer pool is contended.
	finalText := responseText.String()
	flushCtx, flushCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer flushCancel()
	if ctx.Err() != nil {
		// User cancelled.
		s.markTurnDone(flushCtx, turnID, "cancelled", totalIn, totalOut, totalCost, finalText)
	} else {
		s.markTurnDone(flushCtx, turnID, "done", totalIn, totalOut, totalCost, finalText)
	}
	s.emit("composer:event", Event{
		PaneID:       args.PaneID,
		TurnID:       turnID,
		Type:         "done",
		InputTokens:  totalIn,
		OutputTokens: totalOut,
		CostUSD:      totalCost,
	})
}

// friendlyComposerError translates raw claude CLI error output into
// user-readable messages for common failure modes.
func friendlyComposerError(raw string) string {
	lower := strings.ToLower(raw)
	switch {
	case strings.Contains(lower, "connectionrefused") || strings.Contains(lower, "connection refused"):
		return "Unable to connect to the Anthropic API. Check your internet connection and API key, then try again."
	case strings.Contains(lower, "401") || strings.Contains(lower, "unauthorized") || strings.Contains(lower, "authentication"):
		return "Authentication failed. Check your ANTHROPIC_API_KEY or run `claude login`."
	case strings.Contains(lower, "429") || strings.Contains(lower, "rate limit"):
		return "Rate limit reached. Please wait a moment before trying again."
	case strings.Contains(lower, "context deadline exceeded") || strings.Contains(lower, "timeout"):
		return "The request timed out. Try again in a moment."
	default:
		return raw
	}
}

// writeStreamJSONPrompt sends a user_message as stream-json on stdin, then
// closes the writer so the CLI knows the message is complete. The message
// format matches the official Claude Code extension protocol:
//
//	{"type":"user_message","content":"<prompt>"}
func writeStreamJSONPrompt(stdin io.WriteCloser, prompt string) error {
	msg := struct {
		Type    string `json:"type"`
		Content string `json:"content"`
	}{
		Type:    "user_message",
		Content: prompt,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		_ = stdin.Close()
		return fmt.Errorf("marshal prompt: %w", err)
	}
	// Write the JSON line + newline, then close stdin.
	data = append(data, '\n')
	if _, err := stdin.Write(data); err != nil {
		_ = stdin.Close()
		return fmt.Errorf("write stdin: %w", err)
	}
	return stdin.Close()
}

// handleContentBlockDelta processes incremental text/thinking chunks from the
// richer stream-json protocol. These arrive more frequently than batched
// "assistant" events, providing sub-second streaming granularity.
func (s *Service) handleContentBlockDelta(paneID, turnID string, raw map[string]json.RawMessage, responseText *strings.Builder) {
	var delta struct {
		Delta struct {
			Type     string `json:"type"`
			Text     string `json:"text,omitempty"`
			Thinking string `json:"thinking,omitempty"`
		} `json:"delta"`
	}
	line, _ := json.Marshal(raw)
	if json.Unmarshal(line, &delta) != nil {
		return
	}

	switch delta.Delta.Type {
	case "text_delta":
		if delta.Delta.Text != "" {
			s.emit("composer:event", Event{PaneID: paneID, TurnID: turnID, Type: "delta", Content: delta.Delta.Text})
			if responseText != nil && responseText.Len() < maxResponseText {
				remain := maxResponseText - responseText.Len()
				if len(delta.Delta.Text) <= remain {
					responseText.WriteString(delta.Delta.Text)
				} else {
					responseText.WriteString(delta.Delta.Text[:remain])
				}
			}
		}
	case "thinking_delta":
		if delta.Delta.Thinking != "" {
			s.emit("composer:event", Event{PaneID: paneID, TurnID: turnID, Type: "thinking", Content: delta.Delta.Thinking})
		}
	}
}

// handleContentBlockStart processes the start of a new content block. When
// the block is a tool_use, it fires the same tool_use event + edit tracking
// that handleAssistant does, ensuring Write/Edit/MultiEdit detection works
// regardless of which event path the CLI version uses.
func (s *Service) handleContentBlockStart(ctx context.Context, paneID, turnID, cwd string, raw map[string]json.RawMessage) {
	var block struct {
		ContentBlock struct {
			Type  string          `json:"type"`
			Name  string          `json:"name,omitempty"`
			ID    string          `json:"id,omitempty"`
			Input json.RawMessage `json:"input,omitempty"`
		} `json:"content_block"`
	}
	line, _ := json.Marshal(raw)
	if json.Unmarshal(line, &block) != nil {
		return
	}
	if block.ContentBlock.Type == "tool_use" && block.ContentBlock.Name != "" {
		s.emit("composer:event", Event{
			PaneID:    paneID,
			TurnID:    turnID,
			Type:      "tool_use",
			ToolName:  block.ContentBlock.Name,
			ToolInput: string(block.ContentBlock.Input),
			ToolUseID: block.ContentBlock.ID,
		})
		s.maybeRecordEdit(ctx, paneID, turnID, cwd, block.ContentBlock.Name, block.ContentBlock.Input)
	}
}

// handleAssistant unpacks an "assistant" event's content blocks into stream
// events + edit cards. responseText accumulates the rendered text blocks so
// run() can persist them at end-of-turn; nil-safe for callers that don't
// care about persistence.
func (s *Service) handleAssistant(ctx context.Context, paneID, turnID, cwd string, raw json.RawMessage, responseText *strings.Builder) {
	if len(raw) == 0 {
		return
	}
	var msg struct {
		Content []struct {
			Type     string          `json:"type"`
			Text     string          `json:"text,omitempty"`
			Thinking string          `json:"thinking,omitempty"`
			Name     string          `json:"name,omitempty"`
			Input    json.RawMessage `json:"input,omitempty"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	for _, block := range msg.Content {
		switch block.Type {
		case "text":
			if block.Text != "" {
				s.emit("composer:event", Event{PaneID: paneID, TurnID: turnID, Type: "delta", Content: block.Text})
				if responseText != nil && responseText.Len() < maxResponseText {
					remain := maxResponseText - responseText.Len()
					if len(block.Text) <= remain {
						responseText.WriteString(block.Text)
					} else {
						responseText.WriteString(block.Text[:remain])
					}
				}
			}
		case "thinking":
			if block.Thinking != "" {
				s.emit("composer:event", Event{PaneID: paneID, TurnID: turnID, Type: "thinking", Content: block.Thinking})
			}
		case "tool_use":
			s.emit("composer:event", Event{
				PaneID:    paneID,
				TurnID:    turnID,
				Type:      "tool_use",
				ToolName:  block.Name,
				ToolInput: string(block.Input),
			})
			s.maybeRecordEdit(ctx, paneID, turnID, cwd, block.Name, block.Input)
		}
	}
}

// handleToolResult unpacks a top-level "tool_result" JSONL line from the CLI
// and emits a "composer:event" with type "tool_result" so the frontend can
// update the matching tool_use chip with the result content and status. This
// is the missing link that lets Agent responses, Bash output, and other tool
// results surface in the Composer UI.
func (s *Service) handleToolResult(paneID, turnID string, raw map[string]json.RawMessage) {
	var msg struct {
		Content   json.RawMessage `json:"content"`
		ToolUseID string          `json:"tool_use_id"`
		IsError   bool            `json:"is_error"`
	}
	line, _ := json.Marshal(raw)
	if json.Unmarshal(line, &msg) != nil {
		return
	}

	// Content can be a string or an array of content blocks.
	var contentStr string
	if json.Unmarshal(msg.Content, &contentStr) != nil {
		var blocks []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if json.Unmarshal(msg.Content, &blocks) == nil {
			var parts []string
			for _, b := range blocks {
				if b.Type == "text" {
					parts = append(parts, b.Text)
				}
			}
			contentStr = strings.Join(parts, "\n")
		}
	}

	// Truncate very large results (agent responses can be huge).
	if len(contentStr) > 50000 {
		contentStr = contentStr[:50000] + "\n... (truncated)"
	}

	s.emit("composer:event", Event{
		PaneID:    paneID,
		TurnID:    turnID,
		Type:      "tool_result",
		Content:   contentStr,
		ToolUseID: msg.ToolUseID,
		IsError:   msg.IsError,
	})
}

// maybeRecordEdit inspects a tool_use input and, if it represents a file
// edit, persists an Edit row + emits "composer:edit-pending".
func (s *Service) maybeRecordEdit(ctx context.Context, paneID, turnID, cwd, toolName string, input json.RawMessage) {
	switch toolName {
	case "Write":
		var w struct {
			FilePath string `json:"file_path"`
			Content  string `json:"content"`
		}
		if json.Unmarshal(input, &w) != nil || w.FilePath == "" {
			return
		}
		old, _ := readFileSafe(w.FilePath)
		s.emitEdit(ctx, paneID, turnID, cwd, w.FilePath, old, w.Content)
		s.trackConflictFile(paneID, cwd, w.FilePath)

	case "Edit":
		var e struct {
			FilePath  string `json:"file_path"`
			OldString string `json:"old_string"`
			NewString string `json:"new_string"`
		}
		if json.Unmarshal(input, &e) != nil || e.FilePath == "" {
			return
		}
		// The CLI writes edits to disk before emitting tool_use, so the file
		// already contains NewString. Reconstruct the pre-edit content by
		// reversing the substitution.
		newContent, _ := readFileSafe(e.FilePath)
		old := strings.Replace(newContent, e.NewString, e.OldString, 1)
		s.emitEdit(ctx, paneID, turnID, cwd, e.FilePath, old, newContent)
		s.trackConflictFile(paneID, cwd, e.FilePath)

	case "MultiEdit":
		var m struct {
			FilePath string `json:"file_path"`
			Edits    []struct {
				OldString string `json:"old_string"`
				NewString string `json:"new_string"`
			} `json:"edits"`
		}
		if json.Unmarshal(input, &m) != nil || m.FilePath == "" {
			return
		}
		// File already has all edits applied. Reverse them in reverse order
		// to reconstruct the original content.
		newContent, _ := readFileSafe(m.FilePath)
		old := newContent
		for i := len(m.Edits) - 1; i >= 0; i-- {
			old = strings.Replace(old, m.Edits[i].NewString, m.Edits[i].OldString, 1)
		}
		s.emitEdit(ctx, paneID, turnID, cwd, m.FilePath, old, newContent)
		s.trackConflictFile(paneID, cwd, m.FilePath)
	}
}

// trackConflictFile registers a file edit with the conflict tracker. Resolves
// relative paths against cwd before registering. The tracker's OnConflict
// handler fires synchronously when a file-level conflict is detected.
func (s *Service) trackConflictFile(paneID, cwd, filePath string) {
	if s.conflicts == nil || filePath == "" {
		return
	}
	if !filepath.IsAbs(filePath) && cwd != "" {
		filePath = filepath.Join(cwd, filePath)
	}
	s.conflicts.RegisterFile(paneID, filePath)
}

func (s *Service) emitEdit(ctx context.Context, paneID, turnID, cwd, path, oldContent, newContent string) {
	if !filepath.IsAbs(path) && cwd != "" {
		path = filepath.Join(cwd, path)
	}
	added, removed := diffLineCounts(oldContent, newContent)
	edit := Edit{
		ID:           uuid.New().String(),
		TurnID:       turnID,
		PaneID:       paneID,
		Path:         path,
		OldContent:   oldContent,
		NewContent:   newContent,
		LinesAdded:   added,
		LinesRemoved: removed,
		Status:       EditPending,
		CreatedAt:    time.Now().Unix(),
	}
	if err := s.insertEdit(ctx, &edit); err != nil {
		log.Warn("composer: insertEdit failed", "err", err)
	}
	s.emit("composer:edit-pending", edit)
}

// ---------------------------------------------------------------------------
// Internal — helpers
// ---------------------------------------------------------------------------

func (s *Service) cancelExisting(paneID string) {
	s.mu.Lock()
	cancel, ok := s.runs[paneID]
	if ok {
		delete(s.runs, paneID)
	}
	s.mu.Unlock()
	if ok {
		log.Warn("composer: cancelling existing run", "pane_id", paneID)
		cancel()
	}
	// Clean up conflict tracking for the cancelled session.
	if s.conflicts != nil {
		s.conflicts.UnregisterFiles(paneID)
		s.conflicts.Unregister(paneID)
	}
}

// recordVerifierOutcome runs the project verifier (typecheck + tests) against
// the worktree the turn ran in and writes the result to ai_outcomes keyed
// by the orchestrator's decision ID. Spawned in a goroutine so the user's
// next prompt never blocks on test runs. No-ops cleanly when:
//   - the engine isn't wired (DecisionStore == nil)
//   - the orchestrator never recorded a decision (decisionID == "")
//   - the turn had no project root (NoContext mode, fresh temp dir, etc.)
//
// When the project type isn't recognised we still record an outcome so the
// learning loop sees signal — flagged via reason="verifier_unavailable".
func (s *Service) recordVerifierOutcome(decisionID, projectRoot string) {
	if s.engineDeps.Decisions == nil || decisionID == "" || strings.TrimSpace(projectRoot) == "" {
		return
	}
	go func() {
		// 5 minute ceiling: typecheck + tests should finish well under
		// this; the cap protects against a pathological project hanging
		// the verifier goroutine forever.
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		// Multi-module monorepos (e.g. ai-collector with proxy/, tap/) have no
		// marker at root; ResolveVerifyRoot scans one level deep so we don't
		// flag those as verifier_unavailable on every turn.
		if _, projectType := verifier.ResolveVerifyRoot(projectRoot); projectType == "" {
			_ = s.engineDeps.Decisions.RecordOutcome(decisionID, false, "verifier_unavailable")
			return
		}

		result := verifier.Verify(ctx, projectRoot)
		reason := summariseVerifier(result)
		if err := s.engineDeps.Decisions.RecordOutcome(decisionID, result.AllPassed, reason); err != nil {
			log.Warn("composer: record verifier outcome", "decision_id", decisionID, "err", err)
		}
	}()
}

// recordEvaluatorOutcome scans the assistant's accumulated response text for
// hallucinated file paths (paths that look like real file references but
// don't exist on disk) and writes a diagnostic outcome to ai_outcomes
// keyed by the orchestrator's decision ID. Spawned in a goroutine so the
// user's next prompt never blocks on the scan.
//
// Runs alongside (not instead of) the verifier: the verifier produces the
// ground-truth pass/fail signal that drives the learning loop; the evaluator
// is observability-only — its outcomes carry phase='evaluator' and are
// excluded from GetSuccessRate by design.
//
// No-ops cleanly when:
//   - the engine isn't wired (DecisionStore == nil)
//   - the orchestrator never recorded a decision (decisionID == "")
//   - the turn had no project root (path-existence checks need a base dir)
//   - the response text is empty (turn errored before producing output —
//     skipping keeps evaluator-phase counts honest).
func (s *Service) recordEvaluatorOutcome(decisionID, projectRoot, responseText string) {
	if s.engineDeps.Decisions == nil || decisionID == "" || strings.TrimSpace(projectRoot) == "" {
		return
	}
	if strings.TrimSpace(responseText) == "" {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Warn("composer: evaluator panic", "decision_id", decisionID, "panic", r)
				_ = s.engineDeps.Decisions.RecordEvaluatorOutcome(
					decisionID, false, fmt.Sprintf("evaluator_error: %v", r),
				)
			}
		}()

		check := evaluator.CheckResponse(responseText, projectRoot)
		success := !check.HasIssues
		reason := summariseEvaluator(check)
		if err := s.engineDeps.Decisions.RecordEvaluatorOutcome(decisionID, success, reason); err != nil {
			log.Warn("composer: record evaluator outcome", "decision_id", decisionID, "err", err)
		}
	}()
}

// summariseEvaluator collapses an evaluator.ResponseCheck into a short reason
// string. Returns empty when the response is clean (success rows don't need a
// reason). On hallucinations, extracts the path tails from the canonical
// "Referenced file may not exist: <path>" warning shape and joins them, so a
// later operator can grep `failure_reason LIKE 'hallucinated:%'` to find them.
func summariseEvaluator(check evaluator.ResponseCheck) string {
	if !check.HasIssues || len(check.Warnings) == 0 {
		return ""
	}
	const prefix = "Referenced file may not exist: "
	paths := make([]string, 0, len(check.Warnings))
	for _, w := range check.Warnings {
		paths = append(paths, strings.TrimPrefix(w, prefix))
	}
	return "hallucinated: " + strings.Join(paths, ", ")
}

// summariseVerifier flattens the per-command verifier results into a single
// short reason string. On success returns "verifier_passed"; on failure
// returns the first failing command + its truncated output (the verifier
// already caps Output at 500 chars).
func summariseVerifier(v verifier.ProjectVerification) string {
	if v.AllPassed {
		return "verifier_passed"
	}
	for _, r := range v.Results {
		if !r.Passed {
			out := strings.TrimSpace(r.Output)
			if out == "" {
				return fmt.Sprintf("verifier_failed:%s exit=%d", r.Command, r.ExitCode)
			}
			return fmt.Sprintf("verifier_failed:%s exit=%d %s", r.Command, r.ExitCode, out)
		}
	}
	// No commands ran but AllPassed=false (shouldn't happen, but stay safe).
	return "verifier_failed:no_results"
}

func parseResult(raw map[string]json.RawMessage) (int64, int64, float64) {
	var costUSD float64
	if v, ok := raw["total_cost_usd"]; ok {
		_ = json.Unmarshal(v, &costUSD)
	}
	var usage struct {
		InputTokens  int64 `json:"input_tokens"`
		OutputTokens int64 `json:"output_tokens"`
	}
	if v, ok := raw["usage"]; ok {
		_ = json.Unmarshal(v, &usage)
	}
	return usage.InputTokens, usage.OutputTokens, costUSD
}

// buildPromptWithMentions inlines @file mentions as <file> tags so claude
// can read them directly without a tool call. This matches the spec — v0
// does NOT use a fuzzy file picker; it accepts literal paths only.
func buildPromptWithMentions(prompt string, mentions []Mention, cwd string) string {
	if len(mentions) == 0 {
		return prompt
	}
	var sb strings.Builder
	for _, m := range mentions {
		path := m.Path
		if !filepath.IsAbs(path) && cwd != "" {
			path = filepath.Join(cwd, path)
		}
		content, err := readFileSafe(path)
		if err != nil || content == "" {
			continue
		}
		sb.WriteString(fmt.Sprintf("<file path=%q>\n%s\n</file>\n\n", m.Path, content))
	}
	sb.WriteString("USER:\n")
	sb.WriteString(prompt)
	return sb.String()
}

func readFileSafe(path string) (string, error) {
	if path == "" {
		return "", nil
	}
	// Cap at 1 MiB so a `Write` of a huge generated file does not balloon
	// memory in the Edit row.
	const cap = 1 << 20
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	defer f.Close()
	buf := make([]byte, cap)
	n, _ := f.Read(buf)
	return string(buf[:n]), nil
}

func diffLineCounts(oldS, newS string) (added, removed int) {
	oldLines := strings.Count(oldS, "\n")
	newLines := strings.Count(newS, "\n")
	if newLines >= oldLines {
		added = newLines - oldLines
	} else {
		removed = oldLines - newLines
	}
	// Always show at least 1 unit of churn when content differs.
	if oldS != newS && added == 0 && removed == 0 {
		added = 1
	}
	return added, removed
}

// ResolveClaudeBin locates the `claude` CLI binary. It checks PATH first,
// then probes well-known install locations. macOS GUI apps (launched from
// Finder/Dock) don't inherit the user's shell PATH, so ~/.local/bin — the
// standard Claude CLI install location — is invisible to exec.LookPath.
func ResolveClaudeBin() (string, error) {
	if p, err := exec.LookPath("claude"); err == nil {
		return p, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("claude CLI not found and cannot resolve home dir: %w", err)
	}
	candidates := []string{
		filepath.Join(home, ".local", "bin", "claude"),
		filepath.Join(home, ".claude", "local", "claude"),
		"/opt/homebrew/bin/claude",
		"/usr/local/bin/claude",
	}
	for _, p := range candidates {
		if _, statErr := os.Stat(p); statErr == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("claude CLI not found in PATH or common install locations")
}

func revertFile(path, oldContent string) error {
	// Prefer git if the file is tracked.
	cmd := exec.Command("git", "-c", "core.optionalLocks=false", "checkout", "--", path)
	cmd.Dir = filepath.Dir(path)
	if err := cmd.Run(); err == nil {
		return nil
	}
	// Untracked: write back captured oldContent (possibly empty → delete).
	if oldContent == "" {
		_ = os.Remove(path)
		return nil
	}
	return os.WriteFile(path, []byte(oldContent), 0o644)
}
