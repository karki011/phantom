# Composer V2 Rebuild — Phases 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2807-line ComposerPane monolith with a modular stream-JSON IPC composer backed by the `claude` CLI subprocess, covering Go backend (Phase 1), frontend store/reducers (Phase 2), and component tree (Phase 3).

**Architecture:** Go session manager spawns `claude --output-format stream-json --input-format stream-json --verbose` per session. Events flow over Wails event channels to a SolidJS `createStore`-based state layer. Reducers map stream events to path-style store patches. The component tree reads from the store with fine-grained reactivity — each leaf re-renders only what it owns.

**Tech Stack:** Go 1.25 (Wails v2.12.0), SolidJS 1.9, TypeScript, vanilla-extract CSS, SQLite (sqlc), marked 18, highlight.js 11, @tanstack/solid-virtual 3

**Companion spec:** `docs/superpowers/specs/2026-05-03-composer-rebuild-design.md`

**Parallelism:** Tracks A (Go) and B (Frontend store) are fully independent — run them simultaneously. Track C (components) depends on Track B types only.

---

## File Map

### Track A — Go Backend (`internal/composer/`)

| File | Responsibility |
|------|---------------|
| `internal/composer/events.go` | Stream-JSON envelope types, decoder, event kind constants |
| `internal/composer/events_test.go` | Table-driven tests for event decoding |
| `internal/composer/session.go` | Session struct, subprocess lifecycle (spawn, stop, resume) |
| `internal/composer/session_test.go` | Session lifecycle tests with mock subprocess |
| `internal/composer/manager.go` | SessionManager registry, multi-session supervisor |
| `internal/composer/manager_test.go` | Manager registry and concurrency tests |
| `internal/composer/bindings.go` | Wails bindings: Open, Send, Stop, Resume, List, Close |
| `internal/composer/persist.go` | NDJSON event log writer + reader for rehydration |
| `internal/composer/persist_test.go` | Persistence round-trip tests |
| `internal/composer/log.go` | Structured composer.ndjson log sink |
| `internal/db/migrations/016_composer_v2.up.sql` | V2 schema: `composer_v2_sessions` + `composer_v2_event_index` |
| `internal/db/migrations/016_composer_v2.down.sql` | Rollback migration |
| `internal/db/queries/composer_v2.sql` | sqlc queries for V2 tables |

### Track B — Frontend Store (`frontend/src/core/composer/`)

| File | Responsibility |
|------|---------------|
| `core/composer/types.ts` | All TypeScript types mirroring Go event envelope |
| `core/composer/store.ts` | `Map<sessionId, ComposerState>`, active session signal, `createStore` |
| `core/composer/reducers.ts` | Pure event→patch functions, one per event kind |
| `core/composer/reducers.test.ts` | Unit tests for every reducer |
| `core/composer/signals.ts` | Cross-pane signals: activeSessionId, streamingCount, pendingPermissions |
| `core/composer/bridge.ts` | Wails event listener → reducer dispatch glue |

### Track C — Component Tree (`frontend/src/components/composer/`)

| File | Responsibility |
|------|---------------|
| `components/composer/ComposerPaneV2.tsx` | Outer pane shell, sub-tab strip mount, session manager handle |
| `components/composer/ComposerPaneV2.css.ts` | vanilla-extract styles for pane shell |
| `components/composer/ComposerSubTabs.tsx` | Horizontal sub-tab strip with activity dots |
| `components/composer/ComposerSubTabs.css.ts` | Sub-tab strip styles |
| `components/composer/ComposerSession.tsx` | Content area for one active sub-tab (message list + input) |
| `components/composer/ComposerHeader.tsx` | Model, mode toggle, session menu |
| `components/composer/MessageList.tsx` | Virtualized scroller wrapping `<For each={messages}>` |
| `components/composer/MessageList.css.ts` | Message list styles |
| `components/composer/MessageBubble.tsx` | Wraps `<For each={message.content}>` over content blocks |
| `components/composer/MessageBubble.css.ts` | Bubble styles with `contain: layout style paint` |
| `components/composer/blocks/TextBlock.tsx` | Plain text or memo'd markdown (raw during stream, parsed on complete) |
| `components/composer/blocks/ThinkingBlock.tsx` | Collapsed by default, expandable thinking content |
| `components/composer/blocks/ThinkingBlock.css.ts` | Thinking block styles |
| `components/composer/blocks/ToolUseCard.tsx` | Reads `state.toolUses[id]`, never full map |
| `components/composer/blocks/ToolUseCard.css.ts` | Tool card styles |
| `components/composer/blocks/ErrorBlock.tsx` | Error rendering with retry action |
| `components/composer/input/ComposerInput.tsx` | Textarea + send/stop button + mode toggle |
| `components/composer/input/ComposerInput.css.ts` | Input area styles |
| `components/composer/input/ContextChips.tsx` | Current file, selection, attachments display |
| `components/composer/input/ModeToggle.tsx` | normal / plan / auto-accept selector |
| `components/composer/PermissionModal.tsx` | Gated on `state.permission`, inline approval card |
| `components/composer/PermissionModal.css.ts` | Permission modal styles |
| `components/composer/ComposerDrawer.tsx` | Global drawer (Cmd-J), reads same store |
| `components/composer/ComposerDrawer.css.ts` | Drawer styles |
| `components/composer/ComposerStatusPill.tsx` | Bottom-bar pill, mounts at app root |
| `components/composer/ComposerStatusPill.css.ts` | Status pill styles |

---

## Track A — Go Backend

### Task A1: Stream-JSON Event Types + Decoder

**Files:**
- Create: `v2/internal/composer/events.go`
- Create: `v2/internal/composer/events_test.go`

- [ ] **Step 1: Write failing tests for event decoding**

```go
// Author: Subash Karki
package composer

import (
	"testing"
)

func TestDecodeEvent_AssistantMessageDelta(t *testing.T) {
	raw := `{"type":"assistant","subtype":"message_delta","content_block":{"type":"text","text":"hello"}}`
	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventAssistantDelta {
		t.Errorf("expected kind %q, got %q", EventAssistantDelta, ev.Kind)
	}
	if ev.Text != "hello" {
		t.Errorf("expected text %q, got %q", "hello", ev.Text)
	}
}

func TestDecodeEvent_ToolUseStart(t *testing.T) {
	raw := `{"type":"tool_use","subtype":"start","tool_use_id":"tu_123","tool_name":"Read","input":{"file_path":"/foo.go"}}`
	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventToolUseStart {
		t.Errorf("expected kind %q, got %q", EventToolUseStart, ev.Kind)
	}
	if ev.ToolName != "Read" {
		t.Errorf("expected tool_name %q, got %q", "Read", ev.ToolName)
	}
	if ev.ToolUseID != "tu_123" {
		t.Errorf("expected tool_use_id %q, got %q", "tu_123", ev.ToolUseID)
	}
}

func TestDecodeEvent_PermissionRequest(t *testing.T) {
	raw := `{"type":"permission","subtype":"request","tool_name":"Bash","description":"run ls -la"}`
	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Kind != EventPermissionRequest {
		t.Errorf("expected kind %q, got %q", EventPermissionRequest, ev.Kind)
	}
}

func TestDecodeEvent_UnknownKind(t *testing.T) {
	raw := `{"type":"future_thing","subtype":"new_stuff","data":"value"}`
	ev, err := DecodeEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unknown kinds should not error: %v", err)
	}
	if ev.Kind != EventUnknown {
		t.Errorf("expected kind %q, got %q", EventUnknown, ev.Kind)
	}
}

func TestDecodeEvent_InvalidJSON(t *testing.T) {
	_, err := DecodeEvent([]byte(`not json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -run TestDecodeEvent -v`
Expected: FAIL — `DecodeEvent` not defined

- [ ] **Step 3: Implement event types and decoder**

```go
// Author: Subash Karki
package composer

import (
	"encoding/json"
	"fmt"
)

// EventKind is the discriminant for stream-JSON events from the claude CLI.
type EventKind string

const (
	EventAssistantDelta    EventKind = "assistant_message_delta"
	EventAssistantComplete EventKind = "assistant_message_complete"
	EventThinkingDelta     EventKind = "thinking_delta"
	EventThinkingComplete  EventKind = "thinking_complete"
	EventToolUseStart      EventKind = "tool_use_start"
	EventToolUseComplete   EventKind = "tool_use_complete"
	EventToolResult        EventKind = "tool_result"
	EventPermissionRequest EventKind = "permission_request"
	EventPermissionResponse EventKind = "permission_response"
	EventSessionResumed    EventKind = "session_resumed"
	EventSystemInfo        EventKind = "system_info"
	EventCancelled         EventKind = "cancelled"
	EventError             EventKind = "error"
	EventUnknown           EventKind = "unknown"
)

// StreamEvent is the typed envelope for every event from the claude CLI subprocess.
type StreamEvent struct {
	Kind        EventKind       `json:"kind"`
	RawType     string          `json:"type"`
	RawSubtype  string          `json:"subtype"`
	Text        string          `json:"text,omitempty"`
	ToolUseID   string          `json:"tool_use_id,omitempty"`
	ToolName    string          `json:"tool_name,omitempty"`
	ToolInput   json.RawMessage `json:"tool_input,omitempty"`
	ToolOutput  string          `json:"tool_output,omitempty"`
	IsError     bool            `json:"is_error,omitempty"`
	Description string          `json:"description,omitempty"`
	SessionID   string          `json:"session_id,omitempty"`
	MessageID   string          `json:"message_id,omitempty"`
	Raw         json.RawMessage `json:"-"`
}

// rawEnvelope is the wire format before we classify the event kind.
type rawEnvelope struct {
	Type         string          `json:"type"`
	Subtype      string          `json:"subtype"`
	ContentBlock json.RawMessage `json:"content_block"`
	ToolUseID    string          `json:"tool_use_id"`
	ToolName     string          `json:"tool_name"`
	Input        json.RawMessage `json:"input"`
	Output       string          `json:"output"`
	IsError      bool            `json:"is_error"`
	Description  string          `json:"description"`
	SessionID    string          `json:"session_id"`
	MessageID    string          `json:"message_id"`
	Text         string          `json:"text"`
	Error        string          `json:"error"`
}

type contentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// classifyKind maps the raw type+subtype pair to our internal EventKind.
func classifyKind(typ, sub string) EventKind {
	switch typ {
	case "assistant":
		switch sub {
		case "message_delta":
			return EventAssistantDelta
		case "message_complete":
			return EventAssistantComplete
		}
	case "thinking":
		switch sub {
		case "delta":
			return EventThinkingDelta
		case "complete":
			return EventThinkingComplete
		}
	case "tool_use":
		switch sub {
		case "start":
			return EventToolUseStart
		case "complete":
			return EventToolUseComplete
		}
	case "tool_result":
		return EventToolResult
	case "permission":
		switch sub {
		case "request":
			return EventPermissionRequest
		case "response":
			return EventPermissionResponse
		}
	case "session":
		if sub == "resumed" {
			return EventSessionResumed
		}
	case "system":
		if sub == "info" {
			return EventSystemInfo
		}
	case "cancelled":
		return EventCancelled
	case "error":
		return EventError
	}
	return EventUnknown
}

// DecodeEvent parses a single line of stream-JSON from the claude CLI stdout.
// Unknown event kinds are returned as EventUnknown — never an error.
// Only invalid JSON returns an error.
func DecodeEvent(line []byte) (StreamEvent, error) {
	var raw rawEnvelope
	if err := json.Unmarshal(line, &raw); err != nil {
		return StreamEvent{}, fmt.Errorf("decode stream event: %w", err)
	}

	ev := StreamEvent{
		Kind:        classifyKind(raw.Type, raw.Subtype),
		RawType:     raw.Type,
		RawSubtype:  raw.Subtype,
		ToolUseID:   raw.ToolUseID,
		ToolName:    raw.ToolName,
		ToolInput:   raw.Input,
		ToolOutput:  raw.Output,
		IsError:     raw.IsError,
		Description: raw.Description,
		SessionID:   raw.SessionID,
		MessageID:   raw.MessageID,
		Text:        raw.Text,
		Raw:         line,
	}

	// Extract text from content_block if present (assistant deltas).
	if len(raw.ContentBlock) > 0 {
		var cb contentBlock
		if err := json.Unmarshal(raw.ContentBlock, &cb); err == nil && cb.Text != "" {
			ev.Text = cb.Text
		}
	}

	// Error events may carry the message in "error" field.
	if ev.Kind == EventError && ev.Text == "" {
		ev.Text = raw.Error
	}

	return ev, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -run TestDecodeEvent -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add internal/composer/events.go internal/composer/events_test.go
git commit -m "feat(composer-v2): stream-JSON event types and decoder"
```

---

### Task A2: Session Struct + Subprocess Lifecycle

**Files:**
- Create: `v2/internal/composer/session.go`
- Create: `v2/internal/composer/session_test.go`

**Dependencies:** Task A1 (uses `StreamEvent`, `DecodeEvent`)

- [ ] **Step 1: Write failing tests for session lifecycle**

```go
// Author: Subash Karki
package composer

import (
	"context"
	"os"
	"os/exec"
	"sync"
	"testing"
	"time"
)

func TestNewSession(t *testing.T) {
	s := NewSession("test-id-1", "/tmp", SessionOptions{})
	if s.ID != "test-id-1" {
		t.Errorf("expected ID %q, got %q", "test-id-1", s.ID)
	}
	if s.CWD != "/tmp" {
		t.Errorf("expected CWD %q, got %q", "/tmp", s.CWD)
	}
	if s.Status() != StatusIdle {
		t.Errorf("expected status %q, got %q", StatusIdle, s.Status())
	}
}

func TestSession_SpawnAndStop_WithEcho(t *testing.T) {
	// Use a simple echo command as a mock subprocess.
	// It reads stdin line-by-line and echoes back as JSON.
	s := NewSession("echo-test", "/tmp", SessionOptions{
		CmdFactory: func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
			// Shell script: read lines from stdin, echo them to stdout as-is, exit on EOF.
			return exec.CommandContext(ctx, "sh", "-c", `while IFS= read -r line; do echo "$line"; done`)
		},
	})

	var received []StreamEvent
	var mu sync.Mutex
	s.OnEvent(func(ev StreamEvent) {
		mu.Lock()
		received = append(received, ev)
		mu.Unlock()
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("spawn failed: %v", err)
	}
	defer s.Stop()

	if s.Status() != StatusRunning {
		t.Errorf("expected status %q, got %q", StatusRunning, s.Status())
	}

	// Send a valid JSON line — the echo process bounces it back.
	s.Send([]byte(`{"type":"assistant","subtype":"message_delta","content_block":{"type":"text","text":"hi"}}`))

	// Wait briefly for the event to arrive.
	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	count := len(received)
	mu.Unlock()

	if count < 1 {
		t.Errorf("expected at least 1 event, got %d", count)
	}

	s.Stop()
	if s.Status() != StatusStopped {
		t.Errorf("expected status %q after stop, got %q", StatusStopped, s.Status())
	}
}

func TestSession_PIDFile(t *testing.T) {
	dir := t.TempDir()
	s := NewSession("pid-test", "/tmp", SessionOptions{
		SessionDir: dir,
		CmdFactory: func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
			return exec.CommandContext(ctx, "sleep", "10")
		},
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("spawn failed: %v", err)
	}
	defer s.Stop()

	pidFile := dir + "/pid.json"
	if _, err := os.Stat(pidFile); os.IsNotExist(err) {
		t.Error("pid.json was not created")
	}

	s.Stop()

	if _, err := os.Stat(pidFile); !os.IsNotExist(err) {
		t.Error("pid.json should be removed after stop")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -run TestNewSession -v`
Expected: FAIL — `NewSession`, `SessionOptions` not defined

- [ ] **Step 3: Implement Session struct and lifecycle**

```go
// Author: Subash Karki
package composer

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

type SessionStatus string

const (
	StatusIdle     SessionStatus = "idle"
	StatusRunning  SessionStatus = "running"
	StatusStopped  SessionStatus = "stopped"
	StatusCrashed  SessionStatus = "crashed"
	StatusPaused   SessionStatus = "paused"
)

type CmdFactory func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd

type SessionOptions struct {
	ClaudeSessionID string
	Mode            string // "normal" | "plan" | "auto-accept"
	SessionDir      string // directory for pid.json, events.ndjson
	CmdFactory      CmdFactory
}

type EventHandler func(StreamEvent)

type Session struct {
	ID  string
	CWD string

	mu       sync.RWMutex
	status   SessionStatus
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	ctx      context.Context
	cancel   context.CancelFunc
	opts     SessionOptions
	handlers []EventHandler
	pid      int

	CreatedAt    time.Time
	LastActiveAt time.Time
}

type pidInfo struct {
	PID          int    `json:"pid"`
	PGID         int    `json:"pgid"`
	ClaudeVersion string `json:"claude_version"`
	StartedAt    string `json:"started_at"`
	CmdlineHash  string `json:"cmdline_hash"`
}

func NewSession(id, cwd string, opts SessionOptions) *Session {
	return &Session{
		ID:        id,
		CWD:       cwd,
		status:    StatusIdle,
		opts:      opts,
		CreatedAt: time.Now(),
	}
}

func (s *Session) Status() SessionStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.status
}

func (s *Session) OnEvent(h EventHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handlers = append(s.handlers, h)
}

func (s *Session) emit(ev StreamEvent) {
	s.mu.RLock()
	handlers := make([]EventHandler, len(s.handlers))
	copy(handlers, s.handlers)
	s.mu.RUnlock()
	for _, h := range handlers {
		h(ev)
	}
}

func defaultCmdFactory(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
	args := []string{
		"--output-format", "stream-json",
		"--input-format", "stream-json",
		"--verbose",
	}
	if opts.ClaudeSessionID != "" {
		args = append(args, "--resume", opts.ClaudeSessionID)
	}

	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Dir = cwd
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd
}

func (s *Session) Spawn() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.status == StatusRunning {
		return fmt.Errorf("session %s already running", s.ID)
	}

	s.ctx, s.cancel = context.WithCancel(context.Background())

	factory := s.opts.CmdFactory
	if factory == nil {
		factory = defaultCmdFactory
	}

	s.cmd = factory(s.ctx, s.CWD, s.opts)

	stdin, err := s.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}
	s.stdin = stdin

	stdout, err := s.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}

	stderr, err := s.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	if err := s.cmd.Start(); err != nil {
		return fmt.Errorf("start subprocess: %w", err)
	}

	s.pid = s.cmd.Process.Pid
	s.status = StatusRunning
	s.LastActiveAt = time.Now()

	s.writePIDFile()

	go s.readStdout(stdout)
	go s.readStderr(stderr)
	go s.waitForExit()

	return nil
}

func (s *Session) readStdout(r io.Reader) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 256*1024), 1024*1024) // 1MB max line
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		ev, err := DecodeEvent(line)
		if err != nil {
			s.emit(StreamEvent{Kind: EventError, Text: fmt.Sprintf("decode error: %v", err)})
			continue
		}
		s.mu.Lock()
		s.LastActiveAt = time.Now()
		s.mu.Unlock()
		s.emit(ev)
	}
}

func (s *Session) readStderr(r io.Reader) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		s.emit(StreamEvent{Kind: EventError, Text: line, RawType: "stderr"})
	}
}

func (s *Session) waitForExit() {
	err := s.cmd.Wait()
	s.mu.Lock()
	if s.status == StatusRunning {
		if err != nil {
			s.status = StatusCrashed
		} else {
			s.status = StatusStopped
		}
	}
	s.mu.Unlock()
	s.removePIDFile()
}

func (s *Session) Send(data []byte) error {
	s.mu.RLock()
	if s.status != StatusRunning {
		s.mu.RUnlock()
		return fmt.Errorf("session %s not running (status: %s)", s.ID, s.status)
	}
	w := s.stdin
	s.mu.RUnlock()

	line := append(data, '\n')
	_, err := w.Write(line)
	if err != nil {
		return fmt.Errorf("write to stdin: %w", err)
	}
	s.mu.Lock()
	s.LastActiveAt = time.Now()
	s.mu.Unlock()
	return nil
}

func (s *Session) Stop() {
	s.mu.Lock()
	if s.status != StatusRunning {
		s.mu.Unlock()
		return
	}
	s.status = StatusStopped
	s.mu.Unlock()

	if s.cmd != nil && s.cmd.Process != nil {
		// SIGINT first (matches claude's keyboard interrupt).
		_ = s.cmd.Process.Signal(syscall.SIGINT)

		done := make(chan struct{})
		go func() {
			_ = s.cmd.Wait()
			close(done)
		}()

		select {
		case <-done:
		case <-time.After(2 * time.Second):
			_ = s.cmd.Process.Kill()
		}
	}

	if s.cancel != nil {
		s.cancel()
	}

	s.removePIDFile()
}

func (s *Session) writePIDFile() {
	if s.opts.SessionDir == "" {
		return
	}
	_ = os.MkdirAll(s.opts.SessionDir, 0o755)
	info := pidInfo{
		PID:       s.pid,
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	data, _ := json.Marshal(info)
	_ = os.WriteFile(filepath.Join(s.opts.SessionDir, "pid.json"), data, 0o644)
}

func (s *Session) removePIDFile() {
	if s.opts.SessionDir == "" {
		return
	}
	_ = os.Remove(filepath.Join(s.opts.SessionDir, "pid.json"))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -run "TestNewSession|TestSession_" -v -timeout 30s`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add internal/composer/session.go internal/composer/session_test.go
git commit -m "feat(composer-v2): session struct with subprocess lifecycle"
```

---

### Task A3: Session Manager (Registry + Supervisor)

**Files:**
- Create: `v2/internal/composer/manager.go`
- Create: `v2/internal/composer/manager_test.go`

**Dependencies:** Task A2 (uses `Session`, `NewSession`)

- [ ] **Step 1: Write failing tests for manager**

```go
// Author: Subash Karki
package composer

import (
	"context"
	"os/exec"
	"testing"
)

var noopFactory CmdFactory = func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
	return exec.CommandContext(ctx, "sh", "-c", `while IFS= read -r line; do echo "$line"; done`)
}

func TestManager_OpenAndList(t *testing.T) {
	m := NewManager(ManagerOptions{MaxSessions: 8})

	s, err := m.Open("s1", "/tmp/project", SessionOptions{CmdFactory: noopFactory})
	if err != nil {
		t.Fatalf("open failed: %v", err)
	}
	if s.ID != "s1" {
		t.Errorf("expected session ID %q, got %q", "s1", s.ID)
	}

	list := m.List()
	if len(list) != 1 {
		t.Fatalf("expected 1 session, got %d", len(list))
	}

	s.Stop()
}

func TestManager_DuplicateOpen(t *testing.T) {
	m := NewManager(ManagerOptions{MaxSessions: 8})
	_, _ = m.Open("s1", "/tmp", SessionOptions{CmdFactory: noopFactory})
	defer m.Close("s1")

	s2, err := m.Open("s1", "/tmp", SessionOptions{CmdFactory: noopFactory})
	if err != nil {
		t.Fatalf("second open should return existing: %v", err)
	}
	if s2.ID != "s1" {
		t.Error("should return same session")
	}
}

func TestManager_MaxSessions(t *testing.T) {
	m := NewManager(ManagerOptions{MaxSessions: 2})
	_, _ = m.Open("s1", "/tmp", SessionOptions{CmdFactory: noopFactory})
	_, _ = m.Open("s2", "/tmp", SessionOptions{CmdFactory: noopFactory})
	defer m.Close("s1")
	defer m.Close("s2")

	_, err := m.Open("s3", "/tmp", SessionOptions{CmdFactory: noopFactory})
	if err == nil {
		t.Error("expected error when max sessions reached")
	}
}

func TestManager_Close(t *testing.T) {
	m := NewManager(ManagerOptions{MaxSessions: 8})
	_, _ = m.Open("s1", "/tmp", SessionOptions{CmdFactory: noopFactory})
	m.Close("s1")

	list := m.List()
	if len(list) != 0 {
		t.Errorf("expected 0 sessions after close, got %d", len(list))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -run TestManager -v`
Expected: FAIL — `NewManager`, `ManagerOptions` not defined

- [ ] **Step 3: Implement SessionManager**

```go
// Author: Subash Karki
package composer

import (
	"fmt"
	"sync"
)

type ManagerOptions struct {
	MaxSessions int
	BaseDir     string // e.g. ~/.phantom-os/sessions/
}

type SessionInfo struct {
	ID     string        `json:"id"`
	CWD    string        `json:"cwd"`
	Status SessionStatus `json:"status"`
}

type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	opts     ManagerOptions
}

func NewManager(opts ManagerOptions) *Manager {
	if opts.MaxSessions <= 0 {
		opts.MaxSessions = 8
	}
	return &Manager{
		sessions: make(map[string]*Session),
		opts:     opts,
	}
}

func (m *Manager) Open(id, cwd string, opts SessionOptions) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if existing, ok := m.sessions[id]; ok {
		return existing, nil
	}

	if len(m.sessions) >= m.opts.MaxSessions {
		return nil, fmt.Errorf("max sessions reached (%d)", m.opts.MaxSessions)
	}

	if opts.SessionDir == "" && m.opts.BaseDir != "" {
		opts.SessionDir = m.opts.BaseDir + "/" + id
	}

	s := NewSession(id, cwd, opts)
	if err := s.Spawn(); err != nil {
		return nil, fmt.Errorf("spawn session %s: %w", id, err)
	}

	m.sessions[id] = s
	return s, nil
}

func (m *Manager) Get(id string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[id]
}

func (m *Manager) List() []SessionInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]SessionInfo, 0, len(m.sessions))
	for _, s := range m.sessions {
		list = append(list, SessionInfo{
			ID:     s.ID,
			CWD:    s.CWD,
			Status: s.Status(),
		})
	}
	return list
}

func (m *Manager) Close(id string) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	if ok {
		s.Stop()
	}
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.sessions = make(map[string]*Session)
	m.mu.Unlock()

	for _, s := range sessions {
		s.Stop()
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -run TestManager -v -timeout 30s`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add internal/composer/manager.go internal/composer/manager_test.go
git commit -m "feat(composer-v2): session manager with registry and cap"
```

---

### Task A4: NDJSON Event Persistence + Rehydration

**Files:**
- Create: `v2/internal/composer/persist.go`
- Create: `v2/internal/composer/persist_test.go`

**Dependencies:** Task A1 (uses `StreamEvent`)

- [ ] **Step 1: Write failing tests for persistence**

```go
// Author: Subash Karki
package composer

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEventLog_WriteAndRead(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "events.ndjson")

	log, err := NewEventLog(path)
	if err != nil {
		t.Fatalf("create event log: %v", err)
	}

	ev1 := StreamEvent{Kind: EventAssistantDelta, Text: "hello"}
	ev2 := StreamEvent{Kind: EventToolUseStart, ToolName: "Read", ToolUseID: "tu_1"}

	if err := log.Append(ev1); err != nil {
		t.Fatalf("append ev1: %v", err)
	}
	if err := log.Append(ev2); err != nil {
		t.Fatalf("append ev2: %v", err)
	}
	log.Close()

	events, err := ReadEventLog(path)
	if err != nil {
		t.Fatalf("read event log: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if events[0].Kind != EventAssistantDelta {
		t.Errorf("event 0: expected kind %q, got %q", EventAssistantDelta, events[0].Kind)
	}
	if events[1].ToolName != "Read" {
		t.Errorf("event 1: expected tool_name %q, got %q", "Read", events[1].ToolName)
	}
}

func TestReadEventLog_TailN(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "events.ndjson")

	log, _ := NewEventLog(path)
	for i := 0; i < 100; i++ {
		_ = log.Append(StreamEvent{Kind: EventAssistantDelta, Text: "msg"})
	}
	log.Close()

	events, err := ReadEventLogTail(path, 10)
	if err != nil {
		t.Fatalf("read tail: %v", err)
	}
	if len(events) != 10 {
		t.Errorf("expected 10 events from tail, got %d", len(events))
	}
}

func TestReadEventLog_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "events.ndjson")
	_ = os.WriteFile(path, []byte{}, 0o644)

	events, err := ReadEventLog(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 0 {
		t.Errorf("expected 0 events, got %d", len(events))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -run "TestEventLog|TestReadEventLog" -v`
Expected: FAIL — `NewEventLog`, `ReadEventLog` not defined

- [ ] **Step 3: Implement NDJSON persistence**

```go
// Author: Subash Karki
package composer

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type EventLog struct {
	mu   sync.Mutex
	file *os.File
	enc  *json.Encoder
}

func NewEventLog(path string) (*EventLog, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create event log dir: %w", err)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open event log: %w", err)
	}
	return &EventLog{
		file: f,
		enc:  json.NewEncoder(f),
	}, nil
}

func (l *EventLog) Append(ev StreamEvent) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.enc.Encode(ev)
}

func (l *EventLog) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}

func ReadEventLog(path string) ([]StreamEvent, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open event log: %w", err)
	}
	defer f.Close()

	var events []StreamEvent
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 256*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var ev StreamEvent
		if err := json.Unmarshal(line, &ev); err != nil {
			continue
		}
		events = append(events, ev)
	}
	return events, nil
}

func ReadEventLogTail(path string, n int) ([]StreamEvent, error) {
	all, err := ReadEventLog(path)
	if err != nil {
		return nil, err
	}
	if len(all) <= n {
		return all, nil
	}
	return all[len(all)-n:], nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -run "TestEventLog|TestReadEventLog" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add internal/composer/persist.go internal/composer/persist_test.go
git commit -m "feat(composer-v2): NDJSON event persistence and tail reader"
```

---

### Task A5: Wails Bindings

**Files:**
- Create: `v2/internal/composer/bindings.go`

**Dependencies:** Tasks A2, A3 (uses `Manager`, `Session`)

- [ ] **Step 1: Implement Wails bindings**

```go
// Author: Subash Karki
package composer

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Bindings struct {
	ctx     context.Context
	manager *Manager
}

func NewBindings(manager *Manager) *Bindings {
	return &Bindings{manager: manager}
}

func (b *Bindings) SetContext(ctx context.Context) {
	b.ctx = ctx
}

type OpenRequest struct {
	SessionID string `json:"session_id"`
	CWD       string `json:"cwd"`
	Mode      string `json:"mode"`
	ResumeID  string `json:"resume_id"`
}

type SendRequest struct {
	SessionID string          `json:"session_id"`
	Content   json.RawMessage `json:"content"`
}

func (b *Bindings) ComposerV2Open(req OpenRequest) (SessionInfo, error) {
	opts := SessionOptions{
		Mode:            req.Mode,
		ClaudeSessionID: req.ResumeID,
	}
	s, err := b.manager.Open(req.SessionID, req.CWD, opts)
	if err != nil {
		return SessionInfo{}, err
	}

	s.OnEvent(func(ev StreamEvent) {
		runtime.EventsEmit(b.ctx, fmt.Sprintf("composer:event:%s", req.SessionID), ev)
	})

	return SessionInfo{
		ID:     s.ID,
		CWD:    s.CWD,
		Status: s.Status(),
	}, nil
}

func (b *Bindings) ComposerV2Send(req SendRequest) error {
	s := b.manager.Get(req.SessionID)
	if s == nil {
		return fmt.Errorf("session %s not found", req.SessionID)
	}
	return s.Send(req.Content)
}

func (b *Bindings) ComposerV2Stop(sessionID string) {
	s := b.manager.Get(sessionID)
	if s != nil {
		s.Stop()
	}
}

func (b *Bindings) ComposerV2Close(sessionID string) {
	b.manager.Close(sessionID)
}

func (b *Bindings) ComposerV2List() []SessionInfo {
	return b.manager.List()
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /Users/subash.karki/phantom-os/v2 && go build ./internal/composer/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add internal/composer/bindings.go
git commit -m "feat(composer-v2): Wails bindings for session management"
```

---

### Task A6: Structured Logging

**Files:**
- Create: `v2/internal/composer/log.go`

**Dependencies:** Task A1 (uses `StreamEvent`)

- [ ] **Step 1: Implement structured log sink**

```go
// Author: Subash Karki
package composer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type LogLevel string

const (
	LogDebug LogLevel = "DEBUG"
	LogInfo  LogLevel = "INFO"
	LogWarn  LogLevel = "WARN"
	LogError LogLevel = "ERROR"
)

type LogEntry struct {
	Timestamp   string          `json:"ts"`
	Level       LogLevel        `json:"level"`
	Category    string          `json:"category"`
	SessionID   string          `json:"sessionId,omitempty"`
	WorktreeID  string          `json:"worktreeId,omitempty"`
	Kind        string          `json:"kind,omitempty"`
	Msg         string          `json:"msg"`
	Data        json.RawMessage `json:"data,omitempty"`
}

type ComposerLogger struct {
	mu      sync.Mutex
	file    *os.File
	enc     *json.Encoder
	verbose bool
}

func NewComposerLogger(logDir string, verbose bool) (*ComposerLogger, error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, fmt.Errorf("create log dir: %w", err)
	}
	path := filepath.Join(logDir, "composer.ndjson")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open log file: %w", err)
	}
	return &ComposerLogger{
		file:    f,
		enc:     json.NewEncoder(f),
		verbose: verbose,
	}, nil
}

func (l *ComposerLogger) Log(level LogLevel, category, sessionID, msg string, data any) {
	if level == LogDebug && !l.verbose {
		return
	}
	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Category:  category,
		SessionID: sessionID,
		Msg:       msg,
	}
	if data != nil {
		raw, _ := json.Marshal(data)
		entry.Data = raw
	}
	l.mu.Lock()
	_ = l.enc.Encode(entry)
	l.mu.Unlock()
}

func (l *ComposerLogger) LogEvent(sessionID string, ev StreamEvent) {
	level := LogDebug
	switch ev.Kind {
	case EventPermissionRequest, EventToolUseStart, EventToolUseComplete:
		level = LogInfo
	case EventError:
		level = LogError
	}
	l.Log(level, "composer.ipc", sessionID, string(ev.Kind), map[string]string{
		"tool_name":   ev.ToolName,
		"tool_use_id": ev.ToolUseID,
	})
}

func (l *ComposerLogger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /Users/subash.karki/phantom-os/v2 && go build ./internal/composer/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add internal/composer/log.go
git commit -m "feat(composer-v2): structured NDJSON logging sink"
```

---

## Track B — Frontend Store + Reducers

### Task B1: TypeScript Types

**Files:**
- Create: `v2/frontend/src/core/composer/types.ts`

**Dependencies:** None (mirrors Go types from spec §8)

- [ ] **Step 1: Write TypeScript types**

```ts
// Author: Subash Karki

// ── Event kinds from claude CLI stream-JSON ──────────────────────────

export type EventKind =
  | 'assistant_message_delta'
  | 'assistant_message_complete'
  | 'thinking_delta'
  | 'thinking_complete'
  | 'tool_use_start'
  | 'tool_use_complete'
  | 'tool_result'
  | 'permission_request'
  | 'permission_response'
  | 'session_resumed'
  | 'system_info'
  | 'cancelled'
  | 'error'
  | 'unknown';

export interface StreamEvent {
  kind: EventKind;
  type?: string;
  subtype?: string;
  text?: string;
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  is_error?: boolean;
  description?: string;
  session_id?: string;
  message_id?: string;
}

// ── Store types (§8) ─────────────────────────────────────────────────

export type SessionStatus = 'idle' | 'running' | 'stopped' | 'crashed' | 'paused';
export type ComposerMode = 'normal' | 'plan' | 'auto-accept';

export type ContentBlockType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error';

export interface ContentBlock {
  type: ContentBlockType;
  text: string;
  status: 'streaming' | 'complete';
  toolUseId?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: ContentBlock[];
  status: 'streaming' | 'complete' | 'error';
  timestamp: number;
}

export type ToolUseStatus = 'running' | 'complete' | 'error';

export interface ToolUseState {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  status: ToolUseStatus;
  isError: boolean;
  startedAt: number;
  completedAt?: number;
}

export interface EditorContext {
  filePath: string | null;
  selection: { start: { line: number; column: number }; end: { line: number; column: number } } | null;
  cursor: { line: number; column: number } | null;
  language: string | null;
}

export interface PermissionRequest {
  toolName: string;
  description: string;
  timestamp: number;
}

export interface StreamingCursor {
  msgId: string;
  blockIdx: number;
}

export interface ComposerState {
  sessionId: string | null;
  worktreeId: string;
  messages: Message[];
  toolUses: Record<string, ToolUseState>;
  streaming: StreamingCursor | null;
  permission: PermissionRequest | null;
  mode: ComposerMode;
  editorContext: EditorContext | null;
  status: SessionStatus;
  label: string;
}

export interface SessionListEntry {
  id: string;
  cwd: string;
  status: SessionStatus;
}

// ── Wails binding request/response shapes ────────────────────────────

export interface OpenSessionRequest {
  session_id: string;
  cwd: string;
  mode: string;
  resume_id?: string;
}

export interface SendMessageRequest {
  session_id: string;
  content: unknown;
}
```

- [ ] **Step 2: Verify TypeScript compiles (no errors)**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx tsc --noEmit src/core/composer/types.ts 2>&1 | head -20`
Expected: No errors (or only project-wide config issues, not type errors)

- [ ] **Step 3: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/core/composer/types.ts
git commit -m "feat(composer-v2): TypeScript types for store and stream events"
```

---

### Task B2: Composer Store

**Files:**
- Create: `v2/frontend/src/core/composer/store.ts`

**Dependencies:** Task B1 (uses types)

- [ ] **Step 1: Implement the store**

```ts
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type { ComposerState, ComposerMode } from './types';

// ── Per-session stores ───────────────────────────────────────────────

const sessionStores = new Map<string, ReturnType<typeof createStore<ComposerState>>>();

export const createDefaultState = (sessionId: string, worktreeId: string): ComposerState => ({
  sessionId,
  worktreeId,
  messages: [],
  toolUses: {},
  streaming: null,
  permission: null,
  mode: 'normal' as ComposerMode,
  editorContext: null,
  status: 'idle',
  label: '',
});

export const getOrCreateSessionStore = (sessionId: string, worktreeId: string) => {
  let entry = sessionStores.get(sessionId);
  if (!entry) {
    entry = createStore<ComposerState>(createDefaultState(sessionId, worktreeId));
    sessionStores.set(sessionId, entry);
  }
  return entry;
};

export const getSessionStore = (sessionId: string) => {
  return sessionStores.get(sessionId) ?? null;
};

export const removeSessionStore = (sessionId: string) => {
  sessionStores.delete(sessionId);
};

export const listSessionIds = (): string[] => {
  return Array.from(sessionStores.keys());
};

// ── Active session ───────────────────────────────────────────────────

const [activeSessionId, setActiveSessionId] = createSignal<string | null>(null);

export { activeSessionId, setActiveSessionId };

// ── Helper: get active store ─────────────────────────────────────────

export const getActiveStore = () => {
  const id = activeSessionId();
  if (!id) return null;
  return getSessionStore(id);
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/core/composer/store.ts
git commit -m "feat(composer-v2): session store with Map<sessionId, ComposerState>"
```

---

### Task B3: Reducers

**Files:**
- Create: `v2/frontend/src/core/composer/reducers.ts`
- Create: `v2/frontend/src/core/composer/reducers.test.ts`

**Dependencies:** Tasks B1, B2 (uses types + store)

- [ ] **Step 1: Write failing tests for reducers**

```ts
// Author: Subash Karki

import { describe, it, expect } from 'vitest';
import { createStore } from 'solid-js/store';
import { createDefaultState } from './store';
import {
  reduceAssistantDelta,
  reduceAssistantComplete,
  reduceToolUseStart,
  reduceToolUseComplete,
  reducePermissionRequest,
  reducePermissionResponse,
  reduceError,
} from './reducers';
import type { ComposerState, StreamEvent } from './types';

const makeStore = () => createStore<ComposerState>(createDefaultState('test', '/tmp'));

describe('reduceAssistantDelta', () => {
  it('creates a new message and appends text block on first delta', () => {
    const [state, setState] = makeStore();
    const ev: StreamEvent = {
      kind: 'assistant_message_delta',
      text: 'Hello',
      message_id: 'msg_1',
    };

    reduceAssistantDelta(setState, state, ev);

    expect(state.messages.length).toBe(1);
    expect(state.messages[0].role).toBe('assistant');
    expect(state.messages[0].content[0].text).toBe('Hello');
    expect(state.messages[0].status).toBe('streaming');
    expect(state.streaming).not.toBeNull();
  });

  it('appends text to existing streaming block', () => {
    const [state, setState] = makeStore();
    const ev1: StreamEvent = { kind: 'assistant_message_delta', text: 'Hello', message_id: 'msg_1' };
    const ev2: StreamEvent = { kind: 'assistant_message_delta', text: ' world', message_id: 'msg_1' };

    reduceAssistantDelta(setState, state, ev1);
    reduceAssistantDelta(setState, state, ev2);

    expect(state.messages.length).toBe(1);
    expect(state.messages[0].content[0].text).toBe('Hello world');
  });
});

describe('reduceAssistantComplete', () => {
  it('flips streaming message to complete', () => {
    const [state, setState] = makeStore();
    const delta: StreamEvent = { kind: 'assistant_message_delta', text: 'done', message_id: 'msg_1' };
    reduceAssistantDelta(setState, state, delta);

    const complete: StreamEvent = { kind: 'assistant_message_complete', message_id: 'msg_1' };
    reduceAssistantComplete(setState, state, complete);

    expect(state.messages[0].status).toBe('complete');
    expect(state.messages[0].content[0].status).toBe('complete');
    expect(state.streaming).toBeNull();
  });
});

describe('reduceToolUseStart', () => {
  it('adds entry to toolUses map', () => {
    const [state, setState] = makeStore();
    const ev: StreamEvent = {
      kind: 'tool_use_start',
      tool_use_id: 'tu_1',
      tool_name: 'Read',
      tool_input: { file_path: '/foo.ts' },
    };

    reduceToolUseStart(setState, state, ev);

    expect(state.toolUses['tu_1']).toBeDefined();
    expect(state.toolUses['tu_1'].toolName).toBe('Read');
    expect(state.toolUses['tu_1'].status).toBe('running');
  });
});

describe('reduceToolUseComplete', () => {
  it('marks tool use as complete', () => {
    const [state, setState] = makeStore();
    reduceToolUseStart(setState, state, {
      kind: 'tool_use_start',
      tool_use_id: 'tu_1',
      tool_name: 'Read',
    });

    reduceToolUseComplete(setState, state, {
      kind: 'tool_use_complete',
      tool_use_id: 'tu_1',
      tool_output: 'file contents',
    });

    expect(state.toolUses['tu_1'].status).toBe('complete');
    expect(state.toolUses['tu_1'].output).toBe('file contents');
  });
});

describe('reducePermissionRequest', () => {
  it('sets permission on state', () => {
    const [state, setState] = makeStore();
    reducePermissionRequest(setState, state, {
      kind: 'permission_request',
      tool_name: 'Bash',
      description: 'run ls',
    });

    expect(state.permission).not.toBeNull();
    expect(state.permission!.toolName).toBe('Bash');
  });
});

describe('reducePermissionResponse', () => {
  it('clears permission from state', () => {
    const [state, setState] = makeStore();
    reducePermissionRequest(setState, state, {
      kind: 'permission_request',
      tool_name: 'Bash',
      description: 'run ls',
    });
    reducePermissionResponse(setState, state, {
      kind: 'permission_response',
    });

    expect(state.permission).toBeNull();
  });
});

describe('reduceError', () => {
  it('appends error block to last message or creates one', () => {
    const [state, setState] = makeStore();
    reduceError(setState, state, {
      kind: 'error',
      text: 'something broke',
    });

    expect(state.messages.length).toBe(1);
    expect(state.messages[0].role).toBe('system');
    expect(state.messages[0].content[0].type).toBe('error');
    expect(state.messages[0].content[0].text).toBe('something broke');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx vitest run src/core/composer/reducers.test.ts 2>&1 | tail -20`
Expected: FAIL — reducer functions not found

- [ ] **Step 3: Implement reducers**

```ts
// Author: Subash Karki

import { produce } from 'solid-js/store';
import type { ComposerState, StreamEvent, Message, ContentBlock, ToolUseState } from './types';

type SetState = (fn: (state: ComposerState) => void) => void;

let msgCounter = 0;
const nextMsgId = () => `msg_${++msgCounter}`;

const findStreamingMsgIdx = (state: ComposerState): number => {
  if (!state.streaming) return -1;
  return state.messages.findIndex((m) => m.id === state.streaming!.msgId);
};

export const reduceAssistantDelta = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent,
) => {
  setState(
    produce((s) => {
      const msgIdx = findStreamingMsgIdx(s);

      if (msgIdx === -1) {
        const id = ev.message_id || nextMsgId();
        const block: ContentBlock = {
          type: 'text',
          text: ev.text ?? '',
          status: 'streaming',
        };
        const msg: Message = {
          id,
          role: 'assistant',
          content: [block],
          status: 'streaming',
          timestamp: Date.now(),
        };
        s.messages.push(msg);
        s.streaming = { msgId: id, blockIdx: 0 };
        s.status = 'running';
      } else {
        const blockIdx = s.streaming!.blockIdx;
        const block = s.messages[msgIdx].content[blockIdx];
        if (block) {
          block.text += ev.text ?? '';
        }
      }
    }),
  );
};

export const reduceAssistantComplete = (
  setState: SetState,
  _state: ComposerState,
  _ev: StreamEvent,
) => {
  setState(
    produce((s) => {
      const msgIdx = findStreamingMsgIdx(s);
      if (msgIdx !== -1) {
        const msg = s.messages[msgIdx];
        msg.status = 'complete';
        for (const block of msg.content) {
          block.status = 'complete';
        }
      }
      s.streaming = null;
    }),
  );
};

export const reduceThinkingDelta = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent,
) => {
  setState(
    produce((s) => {
      const msgIdx = findStreamingMsgIdx(s);
      if (msgIdx === -1) return;

      const msg = s.messages[msgIdx];
      const lastBlock = msg.content[msg.content.length - 1];

      if (lastBlock && lastBlock.type === 'thinking' && lastBlock.status === 'streaming') {
        lastBlock.text += ev.text ?? '';
      } else {
        const block: ContentBlock = {
          type: 'thinking',
          text: ev.text ?? '',
          status: 'streaming',
        };
        msg.content.push(block);
        s.streaming = { msgId: msg.id, blockIdx: msg.content.length - 1 };
      }
    }),
  );
};

export const reduceToolUseStart = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent,
) => {
  setState(
    produce((s) => {
      const id = ev.tool_use_id ?? `tu_${Date.now()}`;
      s.toolUses[id] = {
        id,
        toolName: ev.tool_name ?? 'unknown',
        input: (ev.tool_input as Record<string, unknown>) ?? {},
        output: '',
        status: 'running',
        isError: false,
        startedAt: Date.now(),
      };

      const msgIdx = findStreamingMsgIdx(s);
      if (msgIdx !== -1) {
        s.messages[msgIdx].content.push({
          type: 'tool_use',
          text: '',
          status: 'streaming',
          toolUseId: id,
        });
      }
    }),
  );
};

export const reduceToolUseComplete = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent,
) => {
  setState(
    produce((s) => {
      const id = ev.tool_use_id;
      if (!id || !s.toolUses[id]) return;

      s.toolUses[id].status = ev.is_error ? 'error' : 'complete';
      s.toolUses[id].output = ev.tool_output ?? '';
      s.toolUses[id].isError = ev.is_error ?? false;
      s.toolUses[id].completedAt = Date.now();

      const msgIdx = findStreamingMsgIdx(s);
      if (msgIdx !== -1) {
        const block = s.messages[msgIdx].content.find(
          (b) => b.toolUseId === id,
        );
        if (block) {
          block.status = 'complete';
        }
      }
    }),
  );
};

export const reducePermissionRequest = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent,
) => {
  setState(
    produce((s) => {
      s.permission = {
        toolName: ev.tool_name ?? '',
        description: ev.description ?? '',
        timestamp: Date.now(),
      };
    }),
  );
};

export const reducePermissionResponse = (
  setState: SetState,
  _state: ComposerState,
  _ev: StreamEvent,
) => {
  setState(
    produce((s) => {
      s.permission = null;
    }),
  );
};

export const reduceError = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent,
) => {
  setState(
    produce((s) => {
      const msg: Message = {
        id: nextMsgId(),
        role: 'system',
        content: [
          {
            type: 'error',
            text: ev.text ?? 'Unknown error',
            status: 'complete',
          },
        ],
        status: 'error',
        timestamp: Date.now(),
      };
      s.messages.push(msg);
      s.streaming = null;
    }),
  );
};

// ── Master dispatcher ────────────────────────────────────────────────

export const dispatchEvent = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent,
) => {
  switch (ev.kind) {
    case 'assistant_message_delta':
      return reduceAssistantDelta(setState, state, ev);
    case 'assistant_message_complete':
      return reduceAssistantComplete(setState, state, ev);
    case 'thinking_delta':
      return reduceThinkingDelta(setState, state, ev);
    case 'tool_use_start':
      return reduceToolUseStart(setState, state, ev);
    case 'tool_use_complete':
      return reduceToolUseComplete(setState, state, ev);
    case 'permission_request':
      return reducePermissionRequest(setState, state, ev);
    case 'permission_response':
      return reducePermissionResponse(setState, state, ev);
    case 'error':
      return reduceError(setState, state, ev);
    default:
      break;
  }
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx vitest run src/core/composer/reducers.test.ts 2>&1 | tail -20`
Expected: PASS — all 7 describe blocks green

- [ ] **Step 5: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/core/composer/reducers.ts frontend/src/core/composer/reducers.test.ts
git commit -m "feat(composer-v2): event reducers with full test coverage"
```

---

### Task B4: Cross-Pane Signals

**Files:**
- Create: `v2/frontend/src/core/composer/signals.ts`

**Dependencies:** Task B2 (uses store)

- [ ] **Step 1: Implement cross-pane signals**

```ts
// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import { listSessionIds, getSessionStore, activeSessionId } from './store';

// Streaming count across all sessions.
const [streamingSessionCount, setStreamingSessionCount] = createSignal(0);

// Pending permission count across all sessions.
const [pendingPermissionCount, setPendingPermissionCount] = createSignal(0);

export { streamingSessionCount, pendingPermissionCount };

export const refreshGlobalSignals = () => {
  const ids = listSessionIds();
  let streaming = 0;
  let permissions = 0;

  for (const id of ids) {
    const entry = getSessionStore(id);
    if (!entry) continue;
    const [state] = entry;
    if (state.streaming) streaming++;
    if (state.permission) permissions++;
  }

  setStreamingSessionCount(streaming);
  setPendingPermissionCount(permissions);
};

// Composer drawer visibility.
const [composerDrawerOpen, setComposerDrawerOpen] = createSignal(false);

export const toggleComposerDrawer = () => setComposerDrawerOpen((v) => !v);
export { composerDrawerOpen, setComposerDrawerOpen };

// Active session's store as a convenience accessor.
export const useActiveSession = () => {
  return createMemo(() => {
    const id = activeSessionId();
    if (!id) return null;
    return getSessionStore(id);
  });
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/core/composer/signals.ts
git commit -m "feat(composer-v2): cross-pane signals for global state"
```

---

### Task B5: Wails Event Bridge

**Files:**
- Create: `v2/frontend/src/core/composer/bridge.ts`

**Dependencies:** Tasks B2, B3 (uses store + reducers)

- [ ] **Step 1: Implement the bridge**

```ts
// Author: Subash Karki

import { getOrCreateSessionStore } from './store';
import { dispatchEvent } from './reducers';
import { refreshGlobalSignals } from './signals';
import type { StreamEvent } from './types';

type WailsEventListener = (data: StreamEvent) => void;

const listeners = new Map<string, WailsEventListener>();

const getRuntime = () => (window as any).runtime;

export const connectSession = (sessionId: string, worktreeId: string) => {
  if (listeners.has(sessionId)) return;

  const [state, setState] = getOrCreateSessionStore(sessionId, worktreeId);

  const channel = `composer:event:${sessionId}`;

  const handler: WailsEventListener = (data: StreamEvent) => {
    dispatchEvent(setState as any, state, data);
    refreshGlobalSignals();
  };

  getRuntime()?.EventsOn(channel, handler);
  listeners.set(sessionId, handler);
};

export const disconnectSession = (sessionId: string) => {
  const handler = listeners.get(sessionId);
  if (!handler) return;

  const channel = `composer:event:${sessionId}`;
  getRuntime()?.EventsOff(channel);
  listeners.delete(sessionId);
};

export const disconnectAll = () => {
  for (const id of listeners.keys()) {
    disconnectSession(id);
  }
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/core/composer/bridge.ts
git commit -m "feat(composer-v2): Wails event bridge connecting Go events to store"
```

---

## Track C — Component Tree (Phase 3)

### Task C1: ComposerPaneV2 Shell + Sub-Tabs

**Files:**
- Create: `v2/frontend/src/components/composer/ComposerPaneV2.tsx`
- Create: `v2/frontend/src/components/composer/ComposerPaneV2.css.ts`
- Create: `v2/frontend/src/components/composer/ComposerSubTabs.tsx`
- Create: `v2/frontend/src/components/composer/ComposerSubTabs.css.ts`

**Dependencies:** Tasks B1-B5 (needs store, signals, bridge, types)

- [ ] **Step 1: Create vanilla-extract styles for pane shell**

```ts
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const paneRoot = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  overflow: 'hidden',
});

export const sessionContent = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});
```

- [ ] **Step 2: Create sub-tab strip styles**

```ts
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const tabStrip = style({
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '4px 8px',
  borderBottom: `1px solid ${vars.color.divider}`,
  background: vars.color.bgSecondary,
  overflowX: 'auto',
  minHeight: '36px',
});

export const tab = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  color: vars.color.textSecondary,
  transition: 'background 150ms ease',
  selectors: {
    '&:hover': { background: vars.color.bgHover },
  },
});

export const tabActive = style({
  background: vars.color.bgActive,
  color: vars.color.textPrimary,
});

export const activityDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: vars.color.accent,
});

export const permissionDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: vars.color.warning,
});

export const addButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '6px',
  cursor: 'pointer',
  color: vars.color.textSecondary,
  selectors: {
    '&:hover': { background: vars.color.bgHover },
  },
});
```

- [ ] **Step 3: Implement ComposerSubTabs component**

```tsx
// Author: Subash Karki

import { For, Show } from 'solid-js';
import { Plus, X } from 'lucide-solid';
import { activeSessionId, setActiveSessionId, listSessionIds, getSessionStore } from '@/core/composer/store';
import * as css from './ComposerSubTabs.css';

interface Props {
  onNew: () => void;
  onClose: (sessionId: string) => void;
}

const ComposerSubTabs = (props: Props) => {
  const sessionIds = () => listSessionIds();

  return (
    <div class={css.tabStrip}>
      <For each={sessionIds()}>
        {(id) => {
          const entry = () => getSessionStore(id);
          const state = () => entry()?.[0];
          const isActive = () => activeSessionId() === id;

          return (
            <div
              class={`${css.tab} ${isActive() ? css.tabActive : ''}`}
              onClick={() => setActiveSessionId(id)}
            >
              <span>{state()?.label || id.slice(0, 8)}</span>
              <Show when={state()?.streaming}>
                <span class={css.activityDot} />
              </Show>
              <Show when={state()?.permission}>
                <span class={css.permissionDot} />
              </Show>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClose(id);
                }}
                style={{ opacity: 0.5, cursor: 'pointer' }}
              >
                <X size={12} />
              </span>
            </div>
          );
        }}
      </For>
      <div class={css.addButton} onClick={props.onNew}>
        <Plus size={16} />
      </div>
    </div>
  );
};

export default ComposerSubTabs;
```

- [ ] **Step 4: Implement ComposerPaneV2 shell**

```tsx
// Author: Subash Karki

import { Show, createSignal, onMount, onCleanup } from 'solid-js';
import { activeSessionId, setActiveSessionId, getSessionStore, removeSessionStore } from '@/core/composer/store';
import { connectSession, disconnectSession } from '@/core/composer/bridge';
import ComposerSubTabs from './ComposerSubTabs';
import ComposerSession from './ComposerSession';
import * as css from './ComposerPaneV2.css';

interface Props {
  paneId: string;
  worktreeId: string;
  cwd: string;
}

const App = () => (window as any).go?.['app']?.App;

const ComposerPaneV2 = (props: Props) => {
  const [ready, setReady] = createSignal(false);

  const openNewSession = async () => {
    const sessionId = `cv2_${Date.now()}`;
    try {
      await App()?.ComposerV2Open({
        session_id: sessionId,
        cwd: props.cwd,
        mode: 'normal',
      });
      connectSession(sessionId, props.worktreeId);
      setActiveSessionId(sessionId);
    } catch (err) {
      console.error('Failed to open composer session:', err);
    }
  };

  const closeSession = (sessionId: string) => {
    disconnectSession(sessionId);
    App()?.ComposerV2Close(sessionId);
    removeSessionStore(sessionId);
    if (activeSessionId() === sessionId) {
      setActiveSessionId(null);
    }
  };

  onMount(async () => {
    await openNewSession();
    setReady(true);
  });

  onCleanup(() => {
    // Stores survive unmount (module-level), subprocesses keep running.
    // Only disconnect Wails event listeners.
  });

  return (
    <div class={css.paneRoot}>
      <ComposerSubTabs onNew={openNewSession} onClose={closeSession} />
      <div class={css.sessionContent}>
        <Show when={ready() && activeSessionId()} fallback={<div style={{ padding: '16px', color: 'var(--text-secondary)' }}>Starting session…</div>}>
          <ComposerSession sessionId={activeSessionId()!} />
        </Show>
      </div>
    </div>
  );
};

export default ComposerPaneV2;
```

- [ ] **Step 5: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/components/composer/
git commit -m "feat(composer-v2): pane shell with sub-tab strip"
```

---

### Task C2: MessageList + MessageBubble + Content Blocks

**Files:**
- Create: `v2/frontend/src/components/composer/MessageList.tsx`
- Create: `v2/frontend/src/components/composer/MessageList.css.ts`
- Create: `v2/frontend/src/components/composer/MessageBubble.tsx`
- Create: `v2/frontend/src/components/composer/MessageBubble.css.ts`
- Create: `v2/frontend/src/components/composer/blocks/TextBlock.tsx`
- Create: `v2/frontend/src/components/composer/blocks/ThinkingBlock.tsx`
- Create: `v2/frontend/src/components/composer/blocks/ThinkingBlock.css.ts`
- Create: `v2/frontend/src/components/composer/blocks/ErrorBlock.tsx`

**Dependencies:** Tasks B1-B2 (reads from store types)

- [ ] **Step 1: Create MessageBubble styles with layout containment**

```ts
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const bubble = style({
  padding: '12px 16px',
  borderRadius: '8px',
  contain: 'layout style paint',
  maxWidth: '100%',
  wordBreak: 'break-word',
});

export const userBubble = style({
  background: vars.color.bgActive,
  alignSelf: 'flex-end',
  marginLeft: '48px',
});

export const assistantBubble = style({
  background: vars.color.bgSecondary,
  alignSelf: 'flex-start',
  marginRight: '48px',
});

export const systemBubble = style({
  background: vars.color.dangerMuted,
  alignSelf: 'center',
  fontSize: '13px',
});
```

- [ ] **Step 2: Implement TextBlock (raw during stream, markdown on complete)**

```tsx
// Author: Subash Karki

import { createMemo, Show } from 'solid-js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ContentBlock } from '@/core/composer/types';

interface Props {
  block: ContentBlock;
}

const TextBlock = (props: Props) => {
  const rendered = createMemo(() => {
    if (props.block.status !== 'complete') return null;
    const html = marked.parse(props.block.text, { async: false }) as string;
    return DOMPurify.sanitize(html);
  });

  return (
    <>
      <Show when={props.block.status === 'streaming'}>
        <pre style={{
          'white-space': 'pre-wrap',
          'word-break': 'break-word',
          margin: 0,
          'font-family': 'inherit',
        }}>
          {props.block.text}
        </pre>
      </Show>
      <Show when={props.block.status === 'complete' && rendered()}>
        <div innerHTML={rendered()!} />
      </Show>
    </>
  );
};

export default TextBlock;
```

- [ ] **Step 3: Implement ThinkingBlock**

```tsx
// Author: Subash Karki

import { createSignal, Show } from 'solid-js';
import { ChevronRight, ChevronDown, Brain } from 'lucide-solid';
import type { ContentBlock } from '@/core/composer/types';
import * as css from './ThinkingBlock.css';

interface Props {
  block: ContentBlock;
}

const ThinkingBlock = (props: Props) => {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class={css.container}>
      <div class={css.header} onClick={() => setExpanded((v) => !v)}>
        <Brain size={14} />
        <span>Thinking…</span>
        <Show when={expanded()} fallback={<ChevronRight size={14} />}>
          <ChevronDown size={14} />
        </Show>
      </div>
      <Show when={expanded()}>
        <pre class={css.content}>{props.block.text}</pre>
      </Show>
    </div>
  );
};

export default ThinkingBlock;
```

- [ ] **Step 4: Implement ErrorBlock**

```tsx
// Author: Subash Karki

import { AlertTriangle } from 'lucide-solid';
import type { ContentBlock } from '@/core/composer/types';

interface Props {
  block: ContentBlock;
}

const ErrorBlock = (props: Props) => {
  return (
    <div style={{
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
      padding: '8px 12px',
      'border-radius': '6px',
      'font-size': '13px',
    }}>
      <AlertTriangle size={14} />
      <span>{props.block.text}</span>
    </div>
  );
};

export default ErrorBlock;
```

- [ ] **Step 5: Implement MessageBubble**

```tsx
// Author: Subash Karki

import { For, Switch, Match } from 'solid-js';
import type { Message } from '@/core/composer/types';
import TextBlock from './blocks/TextBlock';
import ThinkingBlock from './blocks/ThinkingBlock';
import ErrorBlock from './blocks/ErrorBlock';
import * as css from './MessageBubble.css';

interface Props {
  message: Message;
}

const roleClass = (role: string) => {
  switch (role) {
    case 'user': return `${css.bubble} ${css.userBubble}`;
    case 'assistant': return `${css.bubble} ${css.assistantBubble}`;
    default: return `${css.bubble} ${css.systemBubble}`;
  }
};

const MessageBubble = (props: Props) => {
  return (
    <div class={roleClass(props.message.role)}>
      <For each={props.message.content}>
        {(block) => (
          <Switch fallback={<TextBlock block={block} />}>
            <Match when={block.type === 'text'}>
              <TextBlock block={block} />
            </Match>
            <Match when={block.type === 'thinking'}>
              <ThinkingBlock block={block} />
            </Match>
            <Match when={block.type === 'error'}>
              <ErrorBlock block={block} />
            </Match>
            <Match when={block.type === 'tool_use'}>
              <div style={{ 'font-size': '12px', opacity: 0.7 }}>
                Tool: {block.toolUseId}
              </div>
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
};

export default MessageBubble;
```

- [ ] **Step 6: Implement MessageList**

```tsx
// Author: Subash Karki

import { For, createEffect, createSignal, onMount } from 'solid-js';
import type { Message } from '@/core/composer/types';
import MessageBubble from './MessageBubble';
import * as css from './MessageList.css';

interface Props {
  messages: Message[];
}

const BOTTOM_THRESHOLD = 64;

const MessageList = (props: Props) => {
  let scrollRef: HTMLDivElement | undefined;
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  const [showJumpPill, setShowJumpPill] = createSignal(false);

  const checkScroll = () => {
    if (!scrollRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef;
    const atBottom = scrollHeight - scrollTop - clientHeight < BOTTOM_THRESHOLD;
    setIsAtBottom(atBottom);
    setShowJumpPill(!atBottom);
  };

  const scrollToBottom = () => {
    scrollRef?.scrollTo({ top: scrollRef.scrollHeight, behavior: 'smooth' });
  };

  createEffect(() => {
    const _ = props.messages.length;
    if (isAtBottom()) {
      requestAnimationFrame(() => {
        scrollRef?.scrollTo({ top: scrollRef.scrollHeight });
      });
    }
  });

  return (
    <div class={css.container}>
      <div ref={scrollRef} class={css.scrollArea} onScroll={checkScroll}>
        <div class={css.messageStack}>
          <For each={props.messages}>
            {(msg) => <MessageBubble message={msg} />}
          </For>
        </div>
      </div>
      {showJumpPill() && (
        <button class={css.jumpPill} onClick={scrollToBottom}>
          ↓ Jump to latest
        </button>
      )}
    </div>
  );
};

export default MessageList;
```

- [ ] **Step 7: Create MessageList.css.ts**

```ts
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const container = style({
  position: 'relative',
  flex: 1,
  overflow: 'hidden',
});

export const scrollArea = style({
  height: '100%',
  overflowY: 'auto',
  overflowX: 'hidden',
});

export const messageStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '16px',
});

export const jumpPill = style({
  position: 'absolute',
  bottom: '12px',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 16px',
  borderRadius: '999px',
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontSize: '12px',
  cursor: 'pointer',
  zIndex: 10,
  transition: 'opacity 200ms ease',
  selectors: {
    '&:hover': { background: vars.color.bgHover },
  },
});
```

- [ ] **Step 8: Create ThinkingBlock.css.ts**

```ts
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const container = style({
  borderRadius: '6px',
  border: `1px solid ${vars.color.divider}`,
  overflow: 'hidden',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: '12px',
  color: vars.color.textSecondary,
  selectors: {
    '&:hover': { background: vars.color.bgHover },
  },
});

export const content = style({
  padding: '8px 10px',
  margin: 0,
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '300px',
  overflowY: 'auto',
  borderTop: `1px solid ${vars.color.divider}`,
  color: vars.color.textSecondary,
});
```

- [ ] **Step 9: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/components/composer/
git commit -m "feat(composer-v2): message list, bubbles, and content blocks"
```

---

### Task C3: ToolUseCard

**Files:**
- Create: `v2/frontend/src/components/composer/blocks/ToolUseCard.tsx`
- Create: `v2/frontend/src/components/composer/blocks/ToolUseCard.css.ts`

**Dependencies:** Task B1 (uses `ToolUseState` type), reads from store by id

- [ ] **Step 1: Create ToolUseCard styles**

```ts
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const card = style({
  borderRadius: '8px',
  border: `1px solid ${vars.color.divider}`,
  overflow: 'hidden',
  contain: 'layout style paint',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: '13px',
});

export const toolName = style({
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const statusPill = style({
  padding: '2px 8px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 500,
});

export const running = style({
  background: vars.color.accentMuted,
  color: vars.color.accent,
});

export const complete = style({
  background: vars.color.successMuted,
  color: vars.color.success,
});

export const error = style({
  background: vars.color.dangerMuted,
  color: vars.color.danger,
});

export const body = style({
  padding: '8px 12px',
  borderTop: `1px solid ${vars.color.divider}`,
  fontSize: '12px',
  maxHeight: '200px',
  overflowY: 'auto',
});

export const codeBlock = style({
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
  fontSize: '12px',
});
```

- [ ] **Step 2: Implement ToolUseCard**

```tsx
// Author: Subash Karki

import { createSignal, Show, createMemo } from 'solid-js';
import { Wrench, ChevronRight, ChevronDown, Check, AlertTriangle } from 'lucide-solid';
import { getSessionStore, activeSessionId } from '@/core/composer/store';
import type { ToolUseState } from '@/core/composer/types';
import * as css from './ToolUseCard.css';

interface Props {
  toolUseId: string;
}

const ToolUseCard = (props: Props) => {
  const [expanded, setExpanded] = createSignal(false);

  const toolUse = createMemo((): ToolUseState | undefined => {
    const id = activeSessionId();
    if (!id) return undefined;
    const entry = getSessionStore(id);
    if (!entry) return undefined;
    return entry[0].toolUses[props.toolUseId];
  });

  const statusClass = () => {
    const s = toolUse()?.status;
    if (s === 'running') return css.running;
    if (s === 'error') return css.error;
    return css.complete;
  };

  const statusIcon = () => {
    const s = toolUse()?.status;
    if (s === 'running') return <Wrench size={12} />;
    if (s === 'error') return <AlertTriangle size={12} />;
    return <Check size={12} />;
  };

  const elapsed = createMemo(() => {
    const tu = toolUse();
    if (!tu) return '';
    const end = tu.completedAt ?? Date.now();
    const ms = end - tu.startedAt;
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  });

  return (
    <Show when={toolUse()}>
      <div class={css.card}>
        <div class={css.header} onClick={() => setExpanded((v) => !v)}>
          {expanded() ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span class={css.toolName}>{toolUse()!.toolName}</span>
          <span class={`${css.statusPill} ${statusClass()}`}>
            {statusIcon()} {toolUse()!.status}
          </span>
          <span style={{ 'margin-left': 'auto', 'font-size': '11px', opacity: 0.6 }}>
            {elapsed()}
          </span>
        </div>
        <Show when={expanded()}>
          <div class={css.body}>
            <Show when={Object.keys(toolUse()!.input).length > 0}>
              <div style={{ 'margin-bottom': '8px' }}>
                <strong style={{ 'font-size': '11px', opacity: 0.6 }}>Input</strong>
                <pre class={css.codeBlock}>{JSON.stringify(toolUse()!.input, null, 2)}</pre>
              </div>
            </Show>
            <Show when={toolUse()!.output}>
              <div>
                <strong style={{ 'font-size': '11px', opacity: 0.6 }}>Output</strong>
                <pre class={css.codeBlock}>{toolUse()!.output}</pre>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default ToolUseCard;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/components/composer/blocks/ToolUseCard.tsx frontend/src/components/composer/blocks/ToolUseCard.css.ts
git commit -m "feat(composer-v2): stable ToolUseCard reading from store by id"
```

---

### Task C4: ComposerInput (Textarea + Send/Stop + Mode Toggle)

**Files:**
- Create: `v2/frontend/src/components/composer/input/ComposerInput.tsx`
- Create: `v2/frontend/src/components/composer/input/ComposerInput.css.ts`
- Create: `v2/frontend/src/components/composer/input/ModeToggle.tsx`
- Create: `v2/frontend/src/components/composer/input/ContextChips.tsx`

**Dependencies:** Tasks B1-B4 (uses store types and signals)

- [ ] **Step 1: Create input area styles**

```ts
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const inputArea = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px 16px',
  borderTop: `1px solid ${vars.color.divider}`,
  background: vars.color.bgPrimary,
});

export const inputRow = style({
  display: 'flex',
  alignItems: 'flex-end',
  gap: '8px',
});

export const textarea = style({
  flex: 1,
  resize: 'none',
  border: `1px solid ${vars.color.border}`,
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '14px',
  lineHeight: '1.5',
  background: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  outline: 'none',
  minHeight: '40px',
  maxHeight: '200px',
  fontFamily: 'inherit',
  selectors: {
    '&:focus': { borderColor: vars.color.borderFocus },
  },
});

export const sendButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  border: 'none',
  background: vars.color.accent,
  color: vars.color.textInverse,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'opacity 150ms ease',
  selectors: {
    '&:hover': { opacity: 0.9 },
    '&:disabled': { opacity: 0.4, cursor: 'default' },
  },
});

export const chipsRow = style({
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
});

export const chip = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  borderRadius: '999px',
  fontSize: '11px',
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
});
```

- [ ] **Step 2: Implement ModeToggle**

```tsx
// Author: Subash Karki

import { Select } from '@kobalte/core/select';
import type { ComposerMode } from '@/core/composer/types';

interface Props {
  mode: ComposerMode;
  onChange: (mode: ComposerMode) => void;
}

const modes: ComposerMode[] = ['normal', 'plan', 'auto-accept'];

const ModeToggle = (props: Props) => {
  return (
    <select
      value={props.mode}
      onChange={(e) => props.onChange(e.currentTarget.value as ComposerMode)}
      style={{
        'font-size': '11px',
        padding: '4px 8px',
        'border-radius': '6px',
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {modes.map((m) => (
        <option value={m}>{m}</option>
      ))}
    </select>
  );
};

export default ModeToggle;
```

- [ ] **Step 3: Implement ContextChips**

```tsx
// Author: Subash Karki

import { Show, For } from 'solid-js';
import { FileCode, X } from 'lucide-solid';
import type { EditorContext } from '@/core/composer/types';
import * as css from './ComposerInput.css';

interface Props {
  editorContext: EditorContext | null;
  onDismiss: () => void;
}

const ContextChips = (props: Props) => {
  return (
    <Show when={props.editorContext?.filePath}>
      <div class={css.chipsRow}>
        <span class={css.chip}>
          <FileCode size={12} />
          {props.editorContext!.filePath!.split('/').pop()}
          <Show when={props.editorContext!.selection}>
            <span>L{props.editorContext!.selection!.start.line}-{props.editorContext!.selection!.end.line}</span>
          </Show>
          <span onClick={props.onDismiss} style={{ cursor: 'pointer', opacity: 0.6 }}>
            <X size={10} />
          </span>
        </span>
      </div>
    </Show>
  );
};

export default ContextChips;
```

- [ ] **Step 4: Implement ComposerInput**

```tsx
// Author: Subash Karki

import { createSignal, Show } from 'solid-js';
import { Send, Square } from 'lucide-solid';
import type { ComposerMode, EditorContext } from '@/core/composer/types';
import ContextChips from './ContextChips';
import ModeToggle from './ModeToggle';
import * as css from './ComposerInput.css';

interface Props {
  isStreaming: boolean;
  isPermissionPending: boolean;
  mode: ComposerMode;
  editorContext: EditorContext | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onModeChange: (mode: ComposerMode) => void;
}

const ComposerInput = (props: Props) => {
  const [text, setText] = createSignal('');
  let textareaRef: HTMLTextAreaElement | undefined;

  const handleSend = () => {
    const val = text().trim();
    if (!val) return;
    props.onSend(val);
    setText('');
    if (textareaRef) {
      textareaRef.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoResize = () => {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 200)}px`;
  };

  const disabled = () => props.isPermissionPending;

  return (
    <div class={css.inputArea}>
      <ContextChips
        editorContext={props.editorContext}
        onDismiss={() => {}}
      />
      <div class={css.inputRow}>
        <ModeToggle mode={props.mode} onChange={props.onModeChange} />
        <textarea
          ref={textareaRef}
          class={css.textarea}
          value={text()}
          onInput={(e) => {
            setText(e.currentTarget.value);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          placeholder={disabled() ? 'Approve or deny the permission request…' : 'Ask Claude anything… (⌘+Enter to send)'}
          disabled={disabled()}
          rows={1}
        />
        <Show
          when={props.isStreaming}
          fallback={
            <button
              class={css.sendButton}
              onClick={handleSend}
              disabled={!text().trim() || disabled()}
            >
              <Send size={16} />
            </button>
          }
        >
          <button class={css.sendButton} onClick={props.onStop}>
            <Square size={16} />
          </button>
        </Show>
      </div>
    </div>
  );
};

export default ComposerInput;
```

- [ ] **Step 5: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/components/composer/input/
git commit -m "feat(composer-v2): input area with context chips, mode toggle, send/stop"
```

---

### Task C5: ComposerSession (Wires MessageList + Input)

**Files:**
- Create: `v2/frontend/src/components/composer/ComposerSession.tsx`

**Dependencies:** Tasks C2, C4 (uses MessageList, ComposerInput)

- [ ] **Step 1: Implement ComposerSession**

```tsx
// Author: Subash Karki

import { Show, createMemo } from 'solid-js';
import { getSessionStore } from '@/core/composer/store';
import MessageList from './MessageList';
import ComposerInput from './input/ComposerInput';
import PermissionModal from './PermissionModal';
import type { ComposerMode } from '@/core/composer/types';

interface Props {
  sessionId: string;
}

const App = () => (window as any).go?.['app']?.App;

const ComposerSession = (props: Props) => {
  const entry = () => getSessionStore(props.sessionId);
  const state = () => entry()?.[0];

  const handleSend = (text: string) => {
    const userInput = {
      type: 'user_input',
      content: text,
      editor_context: state()?.editorContext ?? undefined,
    };
    App()?.ComposerV2Send({
      session_id: props.sessionId,
      content: userInput,
    });
  };

  const handleStop = () => {
    App()?.ComposerV2Stop(props.sessionId);
  };

  const handleModeChange = (mode: ComposerMode) => {
    const [, setState] = entry()!;
    (setState as any)('mode', mode);
  };

  const handlePermissionResponse = (approved: boolean) => {
    App()?.ComposerV2Send({
      session_id: props.sessionId,
      content: {
        type: 'permission_response',
        approved,
      },
    });
  };

  return (
    <Show when={state()} fallback={<div>Loading session…</div>}>
      <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
        <MessageList messages={state()!.messages} />
        <Show when={state()!.permission}>
          <PermissionModal
            permission={state()!.permission!}
            onApprove={() => handlePermissionResponse(true)}
            onDeny={() => handlePermissionResponse(false)}
          />
        </Show>
        <ComposerInput
          isStreaming={!!state()!.streaming}
          isPermissionPending={!!state()!.permission}
          mode={state()!.mode}
          editorContext={state()!.editorContext}
          onSend={handleSend}
          onStop={handleStop}
          onModeChange={handleModeChange}
        />
      </div>
    </Show>
  );
};

export default ComposerSession;
```

- [ ] **Step 2: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/components/composer/ComposerSession.tsx
git commit -m "feat(composer-v2): session content wiring message list and input"
```

---

### Task C6: PermissionModal

**Files:**
- Create: `v2/frontend/src/components/composer/PermissionModal.tsx`
- Create: `v2/frontend/src/components/composer/PermissionModal.css.ts`

**Dependencies:** Task B1 (uses `PermissionRequest` type)

- [ ] **Step 1: Create permission modal styles**

```ts
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const container = style({
  padding: '12px 16px',
  borderTop: `1px solid ${vars.color.warning}`,
  background: vars.color.warningMuted,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
});

export const info = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const toolLabel = style({
  fontWeight: 600,
  fontSize: '13px',
  color: vars.color.textPrimary,
});

export const description = style({
  fontSize: '12px',
  color: vars.color.textSecondary,
});

export const actions = style({
  display: 'flex',
  gap: '8px',
});

export const approveBtn = style({
  padding: '6px 16px',
  borderRadius: '6px',
  border: 'none',
  background: vars.color.success,
  color: '#fff',
  fontWeight: 500,
  fontSize: '12px',
  cursor: 'pointer',
});

export const denyBtn = style({
  padding: '6px 16px',
  borderRadius: '6px',
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textPrimary,
  fontWeight: 500,
  fontSize: '12px',
  cursor: 'pointer',
});
```

- [ ] **Step 2: Implement PermissionModal**

```tsx
// Author: Subash Karki

import { Shield } from 'lucide-solid';
import type { PermissionRequest } from '@/core/composer/types';
import * as css from './PermissionModal.css';

interface Props {
  permission: PermissionRequest;
  onApprove: () => void;
  onDeny: () => void;
}

const PermissionModal = (props: Props) => {
  return (
    <div class={css.container}>
      <Shield size={20} />
      <div class={css.info}>
        <span class={css.toolLabel}>{props.permission.toolName}</span>
        <span class={css.description}>{props.permission.description}</span>
      </div>
      <div class={css.actions}>
        <button class={css.denyBtn} onClick={props.onDeny}>Deny</button>
        <button class={css.approveBtn} onClick={props.onApprove}>Allow</button>
      </div>
    </div>
  );
};

export default PermissionModal;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/components/composer/PermissionModal.tsx frontend/src/components/composer/PermissionModal.css.ts
git commit -m "feat(composer-v2): permission approval inline card"
```

---

### Task C7: ComposerStatusPill + ComposerDrawer

**Files:**
- Create: `v2/frontend/src/components/composer/ComposerStatusPill.tsx`
- Create: `v2/frontend/src/components/composer/ComposerStatusPill.css.ts`
- Create: `v2/frontend/src/components/composer/ComposerDrawer.tsx`
- Create: `v2/frontend/src/components/composer/ComposerDrawer.css.ts`

**Dependencies:** Tasks B4, B5 (uses signals and bridge)

- [ ] **Step 1: Create status pill styles**

```ts
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const pulse = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.6 },
});

export const pill = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 12px',
  borderRadius: '999px',
  fontSize: '11px',
  cursor: 'pointer',
  transition: 'background 150ms ease',
  selectors: {
    '&:hover': { background: vars.color.bgHover },
  },
});

export const idle = style({ color: vars.color.textSecondary });
export const streaming = style({ color: vars.color.accent, animation: `${pulse} 1.5s ease infinite` });
export const permissionNeeded = style({ color: vars.color.warning });
export const hasError = style({ color: vars.color.danger });
```

- [ ] **Step 2: Implement ComposerStatusPill**

```tsx
// Author: Subash Karki

import { Show, createMemo } from 'solid-js';
import { Bot } from 'lucide-solid';
import { streamingSessionCount, pendingPermissionCount, toggleComposerDrawer } from '@/core/composer/signals';
import { listSessionIds } from '@/core/composer/store';
import * as css from './ComposerStatusPill.css';

const ComposerStatusPill = () => {
  const count = () => listSessionIds().length;
  const streaming = streamingSessionCount;
  const permissions = pendingPermissionCount;

  const pillClass = createMemo(() => {
    if (permissions() > 0) return `${css.pill} ${css.permissionNeeded}`;
    if (streaming() > 0) return `${css.pill} ${css.streaming}`;
    return `${css.pill} ${css.idle}`;
  });

  const label = createMemo(() => {
    const parts: string[] = [];
    parts.push(`${count()} session${count() !== 1 ? 's' : ''}`);
    if (streaming() > 0) parts.push(`${streaming()} streaming`);
    if (permissions() > 0) parts.push(`! ${permissions()} awaiting`);
    return parts.join(' · ');
  });

  return (
    <Show when={count() > 0}>
      <div class={pillClass()} onClick={toggleComposerDrawer}>
        <Bot size={14} />
        <span>{label()}</span>
      </div>
    </Show>
  );
};

export default ComposerStatusPill;
```

- [ ] **Step 3: Create drawer styles**

```ts
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const slideIn = keyframes({
  from: { transform: 'translateX(100%)' },
  to: { transform: 'translateX(0)' },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0,0,0,0.3)',
});

export const drawer = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '480px',
  maxWidth: '100vw',
  zIndex: 1001,
  background: vars.color.bgPrimary,
  borderLeft: `1px solid ${vars.color.divider}`,
  display: 'flex',
  flexDirection: 'column',
  animation: `${slideIn} 200ms ease`,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: `1px solid ${vars.color.divider}`,
  fontWeight: 600,
  fontSize: '14px',
});

export const sessionList = style({
  flex: 1,
  overflowY: 'auto',
  padding: '8px',
});

export const sessionItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  selectors: {
    '&:hover': { background: vars.color.bgHover },
  },
});
```

- [ ] **Step 4: Implement ComposerDrawer**

```tsx
// Author: Subash Karki

import { Show, For } from 'solid-js';
import { X, Bot } from 'lucide-solid';
import {
  composerDrawerOpen,
  setComposerDrawerOpen,
} from '@/core/composer/signals';
import {
  listSessionIds,
  getSessionStore,
  activeSessionId,
  setActiveSessionId,
} from '@/core/composer/store';
import * as css from './ComposerDrawer.css';

const ComposerDrawer = () => {
  const close = () => setComposerDrawerOpen(false);

  return (
    <Show when={composerDrawerOpen()}>
      <div class={css.overlay} onClick={close} />
      <div class={css.drawer}>
        <div class={css.header}>
          <span>Composer Sessions</span>
          <span onClick={close} style={{ cursor: 'pointer' }}>
            <X size={18} />
          </span>
        </div>
        <div class={css.sessionList}>
          <For each={listSessionIds()}>
            {(id) => {
              const state = () => getSessionStore(id)?.[0];
              return (
                <div
                  class={css.sessionItem}
                  onClick={() => {
                    setActiveSessionId(id);
                    close();
                  }}
                >
                  <Bot size={16} />
                  <div style={{ flex: 1 }}>
                    <div style={{ 'font-size': '13px', 'font-weight': 500 }}>
                      {state()?.label || id.slice(0, 12)}
                    </div>
                    <div style={{ 'font-size': '11px', opacity: 0.6 }}>
                      {state()?.worktreeId} · {state()?.status}
                    </div>
                  </div>
                  <Show when={state()?.streaming}>
                    <span style={{ color: 'var(--accent)', 'font-size': '11px' }}>streaming</span>
                  </Show>
                  <Show when={state()?.permission}>
                    <span style={{ color: 'var(--warning)', 'font-size': '11px' }}>! permission</span>
                  </Show>
                </div>
              );
            }}
          </For>
          <Show when={listSessionIds().length === 0}>
            <div style={{ padding: '24px', 'text-align': 'center', opacity: 0.5, 'font-size': '13px' }}>
              No active sessions
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default ComposerDrawer;
```

- [ ] **Step 5: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/components/composer/ComposerStatusPill.tsx frontend/src/components/composer/ComposerStatusPill.css.ts
git add frontend/src/components/composer/ComposerDrawer.tsx frontend/src/components/composer/ComposerDrawer.css.ts
git commit -m "feat(composer-v2): global status pill and session drawer"
```

---

### Task C8: Register ComposerPaneV2 in Pane Registry

**Files:**
- Modify: `v2/frontend/src/components/panes/PaneRegistry.ts`

**Dependencies:** Task C1 (ComposerPaneV2 exists)

- [ ] **Step 1: Add `composer-v2` kind to PaneRegistry**

Add a new entry alongside the existing `composer`:

```ts
  'composer-v2': lazy(() => import('../composer/ComposerPaneV2')),
```

- [ ] **Step 2: Add `'composer-v2'` to PaneType union**

In `v2/frontend/src/core/panes/types.ts`, add `'composer-v2'` to the PaneType union.

- [ ] **Step 3: Verify the build compiles**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && pnpm build 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/subash.karki/phantom-os/v2
git add frontend/src/components/panes/PaneRegistry.ts frontend/src/core/panes/types.ts
git commit -m "feat(composer-v2): register ComposerPaneV2 in pane registry"
```

---

## Execution Order & Parallelism

```
Track A (Go Backend)          Track B (Frontend Store)         Track C (Components)
═══════════════════           ════════════════════════          ════════════════════
A1: events.go          ║      B1: types.ts              ║
A2: session.go         ║      B2: store.ts              ║
A3: manager.go         ║      B3: reducers.ts + tests   ║
A4: persist.go         ║      B4: signals.ts            ║
A5: bindings.go        ║      B5: bridge.ts             ║
A6: log.go             ║                                ║
                       ║                                ║      C1: PaneV2 shell + sub-tabs
                       ║                                ║      C2: MessageList + blocks  ─┐
                       ║                                ║      C3: ToolUseCard            ├─ parallel
                       ║                                ║      C4: Input subtree          │
                       ║                                ║      C6: PermissionModal       ─┘
                       ║                                ║      C5: ComposerSession (wires C2+C4+C6)
                       ║                                ║      C7: StatusPill + Drawer
                       ║                                ║      C8: Pane registry
```

**Agent assignments for maximum parallelism:**

| Agent | Track | Tasks | Model |
|-------|-------|-------|-------|
| Agent-Go-1 | A | A1, A2, A3, A5, A6 (sequential — shared types) | sonnet |
| Agent-Go-2 | A | A4 (after A3 completes) | sonnet |
| Agent-FE-1 | B | B1, B2, B3, B4, B5 (sequential — each builds on prior) | sonnet |
| Agent-FE-2 | C | C1, C8 (pane shell + registry) | sonnet |
| Agent-FE-3 | C | C2, C5 (message list + session wiring) | sonnet |
| Agent-FE-4 | C | C3 (ToolUseCard) | sonnet |
| Agent-FE-5 | C | C4, C6 (input + permission) | sonnet |
| Agent-FE-6 | C | C7 (global drawer + pill) | sonnet |

Tracks A and B start simultaneously. Track C agents start after B1 (types) is committed.

---

## Verification Checklist

After all tasks complete:

- [ ] `cd /Users/subash.karki/phantom-os/v2 && go test ./internal/composer/ -v` — all Go tests pass
- [ ] `cd /Users/subash.karki/phantom-os/v2/frontend && npx vitest run src/core/composer/` — reducer tests pass
- [ ] `cd /Users/subash.karki/phantom-os/v2 && go build ./internal/composer/` — Go package builds
- [ ] `cd /Users/subash.karki/phantom-os/v2/frontend && pnpm build` — frontend builds
- [ ] PaneRegistry includes `composer-v2` kind
- [ ] No circular imports between `core/composer/` modules
- [ ] Every `.go`, `.ts`, `.tsx` file has `// Author: Subash Karki` header
- [ ] Every Go test file uses table-driven tests where applicable
