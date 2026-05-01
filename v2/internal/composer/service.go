// Author: Subash Karki
//
// Package composer — agentic edit pane backed by the `claude` CLI.
//
// The service spawns `claude -p` per turn with --output-format=stream-json,
// streams tool_use / thinking / text / result blocks back to the frontend on
// the "composer:event" channel, and persists Turn + Edit rows so a paused
// pane can resume via `claude --resume <session_id>`.
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
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"

	"github.com/subashkarki/phantom-os-v2/internal/ai/orchestrator"
)

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

	cliPath, err := exec.LookPath("claude")
	if err != nil {
		s.emit("composer:event", Event{PaneID: args.PaneID, Type: "error", Content: "claude CLI not found in PATH"})
		return "", fmt.Errorf("composer: claude CLI not found: %w", err)
	}

	// Cancel any in-flight run for this pane (one run per pane).
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
		if result, err := orchestrator.Process(ctx, s.engineDeps, orchestrator.ProcessInput{
			Goal:        args.Prompt,
			ActiveFiles: mentionPaths(args.Mentions, args.CWD),
		}); err == nil && result != nil {
			if result.Learning != nil {
				decisionID = result.Learning.DecisionID
			}
			if directive := strings.TrimSpace(result.Output.Text); directive != "" && directive != strings.TrimSpace(args.Prompt) {
				prompt = directive + "\n\n" + prompt
			}
		} else if err != nil {
			// Surface but don't bypass — KISS, fail loud.
			log.Warn("composer: orchestrator process failed", "err", err)
		}
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

// NewConversation drops the cached session for a pane so the next Send
// starts a fresh claude conversation (next call uses --session-id again).
// Cancels any in-flight run first.
func (s *Service) NewConversation(paneID string) {
	s.cancelExisting(paneID)
	s.mu.Lock()
	delete(s.sessions, paneID)
	delete(s.sessionStarted, paneID)
	s.mu.Unlock()
}

// Cancel kills the active run on a pane (if any).
func (s *Service) Cancel(paneID string) {
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
	// Decision-keyed verifier outcome runs in Connection #2; threaded through
	// the run goroutine so the close-the-loop call has the same lifecycle.
	_ = decisionID

	// First turn: --session-id <id> creates the session.
	// Subsequent turns: --resume <id> attaches to the existing one.
	// claude rejects --session-id reuse with "Session ID is already in use".
	sessionFlag := "--session-id"
	if isResume {
		sessionFlag = "--resume"
	}

	cliArgs := []string{
		"-p", prompt,
		"--output-format", "stream-json",
		"--verbose",
		"--include-partial-messages",
		"--permission-mode", "acceptEdits",
		sessionFlag, sessionID,
		"--model", args.Model,
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

		switch typ {
		case "assistant":
			s.handleAssistant(ctx, args.PaneID, turnID, args.CWD, raw["message"], &responseText)
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
		}
	}

	if err := cmd.Wait(); err != nil && ctx.Err() == nil {
		errMsg := stderrBuf.String()
		if errMsg == "" {
			errMsg = err.Error()
		}
		log.Warn("composer: cli wait", "err", err)
		s.emit("composer:event", Event{PaneID: args.PaneID, TurnID: turnID, Type: "error", Content: errMsg})
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

	case "Edit":
		var e struct {
			FilePath  string `json:"file_path"`
			OldString string `json:"old_string"`
			NewString string `json:"new_string"`
		}
		if json.Unmarshal(input, &e) != nil || e.FilePath == "" {
			return
		}
		old, _ := readFileSafe(e.FilePath)
		// "new" content reconstruction is best-effort — for simple Edits we
		// have the post-write file already on disk via fsnotify-style polling.
		// v0: emit the file's *current* state as the new content.
		newContent, _ := readFileSafe(e.FilePath)
		s.emitEdit(ctx, paneID, turnID, cwd, e.FilePath, old, newContent)

	case "MultiEdit":
		var m struct {
			FilePath string `json:"file_path"`
		}
		if json.Unmarshal(input, &m) != nil || m.FilePath == "" {
			return
		}
		old, _ := readFileSafe(m.FilePath)
		newContent, _ := readFileSafe(m.FilePath)
		s.emitEdit(ctx, paneID, turnID, cwd, m.FilePath, old, newContent)
	}
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
		cancel()
	}
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
