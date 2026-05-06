// Author: Subash Karki
//
// session.go manages the lifecycle of a single Claude CLI subprocess.
// It handles spawning, stdin/stdout piping, event decoding, PID file
// management, and graceful shutdown with SIGINT→SIGKILL escalation.
package composer

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/charmbracelet/log"

	"github.com/subashkarki/phantom-os-v2/internal/namegen"
)

// SessionStatus represents the lifecycle state of a Session.
type SessionStatus string

const (
	StatusIdle       SessionStatus = "idle"
	StatusRunning    SessionStatus = "running"
	StatusStopped    SessionStatus = "stopped"
	StatusCrashed    SessionStatus = "crashed"
	StatusPaused     SessionStatus = "paused"
	StatusAuthFailed SessionStatus = "auth_failed"
)

// maxScannerBuf is the maximum line size for stdout scanning (1 MB).
const maxScannerBuf = 1 << 20

// CmdFactory builds the *exec.Cmd that Session.Spawn will start.
// Callers can inject a test double that returns e.g. `sh -c 'cat'`.
type CmdFactory func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd

// SessionOptions configures a Session before Spawn.
type SessionOptions struct {
	ClaudeSessionID string          // --resume <id> when non-empty
	Mode            string          // e.g. "chat", "code" — unused by default factory for now
	SessionDir      string          // directory for pid.json and other session artifacts
	CmdFactory      CmdFactory      // nil → defaultCmdFactory
	RunHandshake    bool            // when true, Spawn runs a post-start handshake to validate the CLI
	Logger          *ComposerLogger // optional structured logger for lifecycle + event logging
	Model           string          // --model <id> when non-empty (e.g. "claude-opus-4-6[1m]")
	PermissionMode  string          // --permission-mode <mode> when non-empty (ask, auto, bypass)
	Effort          string          // --effort <level> (low, medium, high, xhigh, max)
	NoContext       bool            // when true, adds --setting-sources "" to strip project context
	MaxTurns        int             // --max-turns, default 100
	MaxBudget       float64         // --max-budget-usd, default 0 (unlimited)
	FallbackModel   string          // --fallback-model
}

// EventHandler is a callback invoked for every StreamEvent decoded from
// the subprocess stdout (or synthesised from stderr).
type EventHandler func(StreamEvent)

// Session wraps a single Claude CLI subprocess.
type Session struct {
	ID   string
	CWD  string
	Name string

	mu     sync.RWMutex
	status SessionStatus

	cmd   *exec.Cmd
	stdin io.WriteCloser

	ctx    context.Context
	cancel context.CancelFunc

	done chan struct{} // closed by waitForExit when cmd.Wait returns

	opts      SessionOptions
	handlers  []EventHandler
	pid       int
	sessionID string // populated by handshake if RunHandshake is true

	// pendingRequests routes control_response events back to the goroutine
	// that sent the matching control_request. The map key is request_id.
	// Protected by pendingMu (separate from the main mu to avoid contention).
	pendingMu       sync.Mutex
	pendingRequests map[string]chan StreamEvent

	CreatedAt    time.Time
	LastActiveAt time.Time
}

// SessionID returns the CLI-reported session ID (set by handshake).
func (s *Session) SessionID() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessionID
}

// logLifecycle is a nil-safe helper that writes a lifecycle log entry.
func (s *Session) logLifecycle(level LogLevel, msg string, data any) {
	if s.opts.Logger == nil {
		return
	}
	s.opts.Logger.Log(level, "lifecycle", s.ID, msg, data)
}

// pidInfo is written to SessionDir/pid.json so external tooling can
// detect and clean up orphaned processes.
type pidInfo struct {
	PID          int    `json:"pid"`
	PGID         int    `json:"pgid"`
	ClaudeVersion string `json:"claude_version"`
	StartedAt    string `json:"started_at"`
	CmdlineHash  string `json:"cmdline_hash"`
}

// NewSession creates an idle session. Call Spawn() to start the subprocess.
func NewSession(id, cwd string, opts SessionOptions) *Session {
	now := time.Now()
	return &Session{
		ID:              id,
		CWD:             cwd,
		Name:            namegen.Generate(),
		status:          StatusIdle,
		opts:            opts,
		pendingRequests: make(map[string]chan StreamEvent),
		CreatedAt:       now,
		LastActiveAt:    now,
	}
}

// Status returns the current session status (thread-safe).
func (s *Session) Status() SessionStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.status
}

// setStatus updates the session status (caller must NOT hold mu).
func (s *Session) setStatus(st SessionStatus) {
	s.mu.Lock()
	s.status = st
	s.mu.Unlock()
}

// OnEvent registers an event handler. Must be called before Spawn.
func (s *Session) OnEvent(h EventHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handlers = append(s.handlers, h)
}

// emit calls all registered handlers with a copy of the handler slice
// to avoid holding the lock during callbacks.
func (s *Session) emit(ev StreamEvent) {
	s.mu.RLock()
	hs := make([]EventHandler, len(s.handlers))
	copy(hs, s.handlers)
	s.mu.RUnlock()

	for _, h := range hs {
		h(ev)
	}
}

// defaultCmdFactory spawns the real `claude` CLI with stream-json I/O.
func defaultCmdFactory(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
	args := []string{
		"--output-format", "stream-json",
		"--input-format", "stream-json",
		"--verbose",
		"--include-partial-messages",
		"--replay-user-messages",
		"--permission-prompt-tool", "stdio",
		"--no-chrome",
	}
	if opts.ClaudeSessionID != "" {
		args = append(args, "--resume", opts.ClaudeSessionID)
	}

	// Model selection — matches V1's --model flag.
	if opts.Model != "" {
		args = append(args, "--model", opts.Model)
	}

	// Permission mode — ask (default), auto, bypass.
	// V1 hardcodes "--permission-mode auto"; V2 respects user selection.
	if opts.PermissionMode != "" {
		args = append(args, "--permission-mode", opts.PermissionMode)
	}

	// Effort level — controls reasoning depth (replaces thinking budget).
	if opts.Effort != "" {
		args = append(args, "--effort", opts.Effort)
	}

	// Always enable thinking — effort level controls depth, not on/off.
	args = append(args, "--thinking", "enabled")

	// Safety ceilings
	if opts.MaxTurns > 0 {
		args = append(args, "--max-turns", strconv.Itoa(opts.MaxTurns))
	}
	if opts.MaxBudget > 0 {
		args = append(args, "--max-budget-usd", fmt.Sprintf("%.2f", opts.MaxBudget))
	}
	if opts.FallbackModel != "" {
		args = append(args, "--fallback-model", opts.FallbackModel)
	}

	// Include hook events for compact_boundary detection.
	args = append(args, "--include-hook-events")

	// No Context mode — strip all workspace awareness (CLAUDE.md, hooks, skills).
	// Mirrors V1's --setting-sources "" behaviour.
	if opts.NoContext {
		args = append(args, "--setting-sources", "")
	}

	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Dir = cwd
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd
}

// Spawn starts the subprocess. Returns an error if the session is already
// running or if the process fails to start.
func (s *Session) Spawn() error {
	s.mu.Lock()
	if s.status == StatusRunning {
		s.mu.Unlock()
		return fmt.Errorf("session already running")
	}
	s.mu.Unlock()

	s.ctx, s.cancel = context.WithCancel(context.Background())

	factory := s.opts.CmdFactory
	if factory == nil {
		factory = defaultCmdFactory
	}
	s.cmd = factory(s.ctx, s.CWD, s.opts)

	var err error

	// Get stdin pipe.
	s.stdin, err = s.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}

	// Get stdout pipe.
	stdout, err := s.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}

	// Get stderr pipe.
	stderr, err := s.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	// Start process.
	if err := s.cmd.Start(); err != nil {
		return fmt.Errorf("start process: %w", err)
	}

	s.pid = s.cmd.Process.Pid
	s.done = make(chan struct{})
	s.setStatus(StatusRunning)
	s.writePIDFile()

	// Log session spawn.
	s.logLifecycle(LogInfo, "session spawned", sessionLifecycleLogData{
		PID:  s.pid,
		CWD:  s.CWD,
		Args: s.cmd.Args,
	})

	// Start reader goroutines.
	go s.readStdout(stdout)
	go s.readStderr(stderr)
	go s.waitForExit()

	// Optional post-spawn handshake to validate the CLI is responsive.
	if s.opts.RunHandshake {
		result, err := s.Handshake(DefaultHandshakeTimeout)
		if err != nil {
			s.Stop()
			return fmt.Errorf("handshake failed: %w", err)
		}
		s.mu.Lock()
		s.sessionID = result.SessionID
		s.mu.Unlock()
	}

	return nil
}

// readStdoutTimeout is the maximum time readStdout may go without receiving
// any output from the Claude CLI before the watchdog cancels the session.
// Declared as a var (not const) so tests can override it with a shorter value.
var readStdoutTimeout = 120 * time.Second

// readStdout scans stdout line by line, decodes each line as a StreamEvent,
// and emits it to all registered handlers. Control responses are routed to
// pending request channels instead of the normal event handlers.
func (s *Session) readStdout(r io.Reader) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, maxScannerBuf), maxScannerBuf)

	// Watchdog: if stdout goes silent for readStdoutTimeout the Claude CLI
	// TCP connection has likely dropped. Cancel the context to kill the child
	// process and unblock scanner.Scan.
	watchdog := time.NewTimer(readStdoutTimeout)
	defer watchdog.Stop()
	go func() {
		select {
		case <-watchdog.C:
			log.Warn("composer: session watchdog timeout — killing hung process",
				"session_id", s.ID,
				"timeout", readStdoutTimeout,
			)
			s.cancel()
		case <-s.ctx.Done():
			// Normal exit or external cancellation — watchdog not needed.
		}
	}()

	for scanner.Scan() {
		watchdog.Reset(readStdoutTimeout)
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		ev, err := DecodeEvent(line)
		if err != nil {
			// Emit decode errors as EventError.
			s.emit(StreamEvent{
				Kind:    EventError,
				RawType: "decode_error",
				Text:    err.Error(),
			})
			continue
		}

		s.mu.Lock()
		s.LastActiveAt = time.Now()
		s.mu.Unlock()

		// Silently drop keep_alive pings — no need to forward to handlers.
		if ev.Kind == EventKeepAlive {
			continue
		}

		// Log task lifecycle events for debugging BG agent status
		if ev.RawSubtype == "task_started" || ev.RawSubtype == "task_progress" || ev.RawSubtype == "task_notification" {
			log.Info("composer: task event", "subtype", ev.RawSubtype, "kind", ev.Kind, "text", ev.Text[:min(len(ev.Text), 50)])
		}

		// Route control_response to the pending request channel BEFORE emit.
		// This prevents the response from leaking into normal event handlers
		// and ensures the ControlRequest caller sees it immediately.
		if ev.Kind == EventControlResponse && ev.RequestID != "" {
			s.pendingMu.Lock()
			ch, ok := s.pendingRequests[ev.RequestID]
			if ok {
				delete(s.pendingRequests, ev.RequestID)
			}
			s.pendingMu.Unlock()

			if ok {
				ch <- ev
				continue
			}
			// No pending request for this ID — fall through to normal emit.
		}

		s.emit(ev)
	}
}

// readStderr emits each stderr line as an EventError with RawType="stderr".
func (s *Session) readStderr(r io.Reader) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, maxScannerBuf), maxScannerBuf)

	for scanner.Scan() {
		text := scanner.Text()
		if text == "" {
			continue
		}
		s.emit(StreamEvent{
			Kind:    EventError,
			RawType: "stderr",
			Text:    text,
		})
	}
}

// waitForExit blocks until the subprocess exits, then updates status.
// It is the sole goroutine that calls cmd.Wait — Stop() waits on the
// done channel instead of calling Wait a second time.
func (s *Session) waitForExit() {
	defer close(s.done)

	err := s.cmd.Wait()

	// Log exit details regardless of who initiated the stop — this is the
	// primary diagnostic for "session dies immediately" investigations.
	exitCode := 0
	if s.cmd.ProcessState != nil {
		exitCode = s.cmd.ProcessState.ExitCode()
	}
	exitMsg := "clean exit"
	if err != nil {
		exitMsg = err.Error()
	}
	s.logLifecycle(LogInfo, fmt.Sprintf("process exited: %s (code=%d)", exitMsg, exitCode), sessionLifecycleLogData{
		PID:      s.pid,
		ExitCode: exitCode,
		Reason:   exitMsg,
	})

	// Only update status if we're still running — Stop() may have already
	// transitioned to StatusStopped before cmd.Wait returns.
	s.mu.RLock()
	current := s.status
	s.mu.RUnlock()
	if current == StatusRunning {
		if err != nil {
			s.setStatus(StatusCrashed)
			s.logLifecycle(LogError, "session crashed", sessionLifecycleLogData{
				PID:      s.pid,
				ExitCode: exitCode,
				Reason:   err.Error(),
			})
		} else {
			s.setStatus(StatusStopped)
			s.logLifecycle(LogInfo, "session exited cleanly", sessionLifecycleLogData{
				PID:    s.pid,
				Reason: "process exited",
			})
		}
	}

	// Emit session status so the frontend can update its store.
	statusStr := string(s.Status())
	s.emit(StreamEvent{
		Kind:       EventSessionStatus,
		RawType:    "session",
		RawSubtype: "status_changed",
		Text:       statusStr,
	})

	s.removePIDFile()
}

// Send writes data followed by a newline to the subprocess stdin.
// Returns an error if the session is not running.
func (s *Session) Send(data []byte) error {
	s.mu.RLock()
	st := s.status
	s.mu.RUnlock()

	if st != StatusRunning {
		return fmt.Errorf("session not running")
	}

	// Write data + newline atomically.
	buf := make([]byte, len(data)+1)
	copy(buf, data)
	buf[len(data)] = '\n'

	_, err := s.stdin.Write(buf)
	if err != nil {
		return fmt.Errorf("write to stdin: %w", err)
	}

	s.mu.Lock()
	s.LastActiveAt = time.Now()
	s.mu.Unlock()

	return nil
}

// Stop gracefully shuts down the subprocess: SIGINT first, then SIGKILL
// after a 2-second grace period.
func (s *Session) Stop() {
	s.mu.RLock()
	st := s.status
	s.mu.RUnlock()

	if st != StatusRunning {
		return
	}

	s.logLifecycle(LogInfo, "session stopping (user-initiated)", sessionLifecycleLogData{
		PID:    s.pid,
		Reason: "user-initiated stop",
	})

	// Close stdin to signal EOF.
	if s.stdin != nil {
		_ = s.stdin.Close()
	}

	// Send SIGINT.
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Signal(syscall.SIGINT)
	}

	// Wait for the existing waitForExit goroutine to finish (it is the
	// sole caller of cmd.Wait). Escalate to SIGKILL after 2 seconds.
	select {
	case <-s.done:
		// Exited gracefully.
	case <-time.After(2 * time.Second):
		// Force kill, then wait for waitForExit to observe the exit.
		if s.cmd != nil && s.cmd.Process != nil {
			_ = s.cmd.Process.Kill()
		}
		<-s.done
	}

	// Only set StatusStopped if waitForExit didn't already set StatusCrashed.
	s.mu.Lock()
	if s.status == StatusRunning {
		s.status = StatusStopped
	}
	s.mu.Unlock()

	if s.cancel != nil {
		s.cancel()
	}

	s.removePIDFile()
}

// writePIDFile writes process info to SessionDir/pid.json.
func (s *Session) writePIDFile() {
	if s.opts.SessionDir == "" {
		return
	}

	info := pidInfo{
		PID:       s.pid,
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}

	// Best-effort PGID.
	if pgid, err := syscall.Getpgid(s.pid); err == nil {
		info.PGID = pgid
	}

	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return
	}

	path := filepath.Join(s.opts.SessionDir, "pid.json")
	_ = os.WriteFile(path, data, 0644)
}

// removePIDFile deletes SessionDir/pid.json.
func (s *Session) removePIDFile() {
	if s.opts.SessionDir == "" {
		return
	}
	path := filepath.Join(s.opts.SessionDir, "pid.json")
	_ = os.Remove(path)
}

// ControlRequestTimeout is the maximum time to wait for a control response.
const ControlRequestTimeout = 10 * time.Second

// generateRequestID returns a 13-character alphanumeric ID matching the
// format used by the Claude Code VS Code extension.
func generateRequestID() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 13)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		b[i] = chars[n.Int64()]
	}
	return string(b)
}

// ControlRequest sends a control_request to the CLI subprocess and blocks
// until a matching control_response arrives or the timeout expires.
//
// Protocol (stdin → CLI):
//
//	{"request_id":"abc123","type":"control_request","request":{"subtype":"set_model","model":"opus"}}
//
// Protocol (CLI → stdout):
//
//	{"type":"control_response","response":{"subtype":"success","request_id":"abc123","response":{...}}}
//	{"type":"control_response","response":{"subtype":"error","request_id":"abc123","error":"..."}}
//
// The returned map is the inner "response" object on success. On error (from
// the CLI or timeout), a non-nil error is returned.
func (s *Session) ControlRequest(subtype string, payload map[string]interface{}) (map[string]interface{}, error) {
	s.mu.RLock()
	st := s.status
	s.mu.RUnlock()
	if st != StatusRunning {
		return nil, fmt.Errorf("session not running (status=%s)", st)
	}

	reqID := generateRequestID()

	// Build the request payload: merge subtype into the inner request object.
	inner := make(map[string]interface{}, len(payload)+1)
	inner["subtype"] = subtype
	for k, v := range payload {
		inner[k] = v
	}

	envelope := map[string]interface{}{
		"request_id": reqID,
		"type":       "control_request",
		"request":    inner,
	}

	data, err := json.Marshal(envelope)
	if err != nil {
		return nil, fmt.Errorf("marshal control request: %w", err)
	}

	// Register a pending channel BEFORE writing to stdin to avoid races.
	ch := make(chan StreamEvent, 1)
	s.pendingMu.Lock()
	s.pendingRequests[reqID] = ch
	s.pendingMu.Unlock()

	// Clean up on any exit path.
	defer func() {
		s.pendingMu.Lock()
		delete(s.pendingRequests, reqID)
		s.pendingMu.Unlock()
	}()

	// Send to stdin.
	if err := s.Send(data); err != nil {
		return nil, fmt.Errorf("send control request: %w", err)
	}

	s.logLifecycle(LogInfo, fmt.Sprintf("control_request sent: %s (id=%s)", subtype, reqID), nil)

	// Wait for the matching control_response.
	select {
	case ev := <-ch:
		return s.parseControlResponse(ev, reqID)

	case <-time.After(ControlRequestTimeout):
		return nil, fmt.Errorf("control request %q timed out after %s (id=%s)", subtype, ControlRequestTimeout, reqID)

	case <-s.done:
		return nil, fmt.Errorf("session exited while waiting for control response (id=%s)", reqID)
	}
}

// parseControlResponse extracts the result from a control_response event.
// Returns the inner response map on success, or an error if the CLI reported
// an error subtype.
func (s *Session) parseControlResponse(ev StreamEvent, reqID string) (map[string]interface{}, error) {
	if len(ev.Response) == 0 {
		return nil, fmt.Errorf("empty control_response payload (id=%s)", reqID)
	}

	// The Response field is the outer "response" object which contains:
	// {"subtype":"success"|"error", "request_id":"...", "response":{...}, "error":"..."}
	var resp struct {
		Subtype   string                 `json:"subtype"`
		RequestID string                 `json:"request_id"`
		Response  map[string]interface{} `json:"response"`
		Error     string                 `json:"error"`
	}
	if err := json.Unmarshal(ev.Response, &resp); err != nil {
		return nil, fmt.Errorf("decode control_response: %w", err)
	}

	if resp.Subtype == "error" {
		errMsg := resp.Error
		if errMsg == "" {
			errMsg = "unknown control error"
		}
		return nil, fmt.Errorf("control request failed: %s (id=%s)", errMsg, reqID)
	}

	s.logLifecycle(LogInfo, fmt.Sprintf("control_response received: %s (id=%s)", resp.Subtype, reqID), nil)
	return resp.Response, nil
}
