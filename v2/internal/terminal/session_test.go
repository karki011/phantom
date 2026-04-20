// Run with: go test -race -v ./internal/terminal/...
// Author: Subash Karki
//
//go:build !windows

package terminal

import (
	"context"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/creack/pty"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// newTestSession creates a minimal Session with a live PTY running a shell.
// The caller must call t.Cleanup to close the session.
func newTestSession(t *testing.T, id string) *Session {
	t.Helper()

	shell := resolveShell()
	ctx, cancel := context.WithCancel(context.Background())

	cmd := exec.CommandContext(ctx, shell)
	cmd.Dir = t.TempDir()
	cmd.Env = buildCleanEnv()

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: 80, Rows: 24})
	if err != nil {
		cancel()
		t.Fatalf("pty.StartWithSize: %v", err)
	}

	sess := &Session{
		ID:           id,
		PTY:          ptmx,
		Cmd:          cmd,
		Ctx:          ctx,
		Cancel:       cancel,
		listeners:    make(map[string]chan []byte),
		Scrollback:   NewRingBuffer(defaultScrollbackSize),
		Cols:         80,
		Rows:         24,
		CWD:          cmd.Dir,
		Shell:        shell,
		CreatedAt:    time.Now(),
		LastActiveAt: time.Now(),
	}

	t.Cleanup(func() {
		sess.Close()
	})

	return sess
}

// waitForOutput subscribes (or uses an existing channel) and waits until
// the accumulated output contains pattern, or timeout expires.
func waitForOutput(t *testing.T, ch <-chan []byte, pattern string, timeout time.Duration) string {
	t.Helper()

	deadline := time.After(timeout)
	var buf strings.Builder

	for {
		select {
		case data, ok := <-ch:
			if !ok {
				t.Fatalf("listener channel closed before pattern %q found; got so far: %q", pattern, buf.String())
			}
			buf.Write(data)
			if strings.Contains(buf.String(), pattern) {
				return buf.String()
			}
		case <-deadline:
			t.Fatalf("timeout waiting for pattern %q; accumulated output: %q", pattern, buf.String())
		}
	}
}

// ---------------------------------------------------------------------------
// Unit tests — Subscribe / Unsubscribe / Info
// ---------------------------------------------------------------------------

func TestSession_Subscribe(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "sub-test")
	ch := sess.Subscribe("listener-1")

	if ch == nil {
		t.Fatal("Subscribe returned nil channel")
	}
	if cap(ch) != listenerBufSize {
		t.Fatalf("channel capacity = %d, want %d", cap(ch), listenerBufSize)
	}
}

func TestSession_Unsubscribe(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "unsub-test")
	ch := sess.Subscribe("listener-1")
	sess.Unsubscribe("listener-1")

	// Channel should be closed.
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected closed channel after Unsubscribe")
		}
	default:
		t.Fatal("channel is not closed after Unsubscribe")
	}
}

func TestSession_UnsubscribeNonExistent(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "unsub-noop")
	// Must not panic.
	sess.Unsubscribe("never-subscribed")
}

func TestSession_MultipleSubscribers(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "multi-sub")
	sess.Start()

	ch1 := sess.Subscribe("l1")
	ch2 := sess.Subscribe("l2")
	ch3 := sess.Subscribe("l3")

	// Write data into the PTY so readLoop fans it out.
	sess.Write([]byte("echo multi_sub_test\n"))

	const timeout = 5 * time.Second
	const pattern = "multi_sub_test"

	var wg sync.WaitGroup
	for i, ch := range []<-chan []byte{ch1, ch2, ch3} {
		wg.Add(1)
		go func(idx int, c <-chan []byte) {
			defer wg.Done()
			waitForOutput(t, c, pattern, timeout)
		}(i, ch)
	}
	wg.Wait()
}

func TestSession_SlowListener(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "slow-listener")
	sess.Start()

	ch := sess.Subscribe("slow")

	// Fill the channel to capacity by writing a lot of data.
	// The readLoop should drop frames instead of blocking.
	bigData := strings.Repeat("x", 4096) + "\n"
	for i := 0; i < listenerBufSize+50; i++ {
		if err := sess.Write([]byte(bigData)); err != nil {
			break // PTY closed, that's fine
		}
	}

	// If we get here without hanging, the test passes.
	// Drain channel to avoid goroutine leak.
	done := time.After(3 * time.Second)
	for {
		select {
		case _, ok := <-ch:
			if !ok {
				return
			}
		case <-done:
			return
		}
	}
}

func TestSession_WriteNilPTY(t *testing.T) {
	t.Parallel()

	sess := &Session{
		ID:        "nil-pty",
		listeners: make(map[string]chan []byte),
	}

	err := sess.Write([]byte("data"))
	if err == nil {
		t.Fatal("expected error writing to session with nil PTY")
	}
	if !strings.Contains(err.Error(), "pty is nil") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestSession_Info(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "info-test")
	info := sess.Info()

	if info.ID != "info-test" {
		t.Fatalf("Info().ID = %q, want %q", info.ID, "info-test")
	}
	if info.Cols != 80 {
		t.Fatalf("Info().Cols = %d, want 80", info.Cols)
	}
	if info.Rows != 24 {
		t.Fatalf("Info().Rows = %d, want 24", info.Rows)
	}
	if info.Shell == "" {
		t.Fatal("Info().Shell is empty")
	}
	if info.CWD == "" {
		t.Fatal("Info().CWD is empty")
	}
	if info.PID == 0 {
		t.Fatal("Info().PID is 0")
	}
	if info.CreatedAt.IsZero() {
		t.Fatal("Info().CreatedAt is zero")
	}
}

// ---------------------------------------------------------------------------
// Integration tests — real PTY
// ---------------------------------------------------------------------------

func TestSession_RealPTY_EchoRoundtrip(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "echo-rt")
	sess.Start()

	ch := sess.Subscribe("echo-listener")
	sess.Write([]byte("echo PHANTOM_ECHO_TEST_42\n"))

	waitForOutput(t, ch, "PHANTOM_ECHO_TEST_42", 5*time.Second)
}

func TestSession_RealPTY_ScrollbackCapture(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "scrollback")
	sess.Start()

	ch := sess.Subscribe("sb-listener")
	sess.Write([]byte("echo SCROLLBACK_MARKER_99\n"))

	waitForOutput(t, ch, "SCROLLBACK_MARKER_99", 5*time.Second)

	// Give the readLoop a moment to tee into scrollback.
	time.Sleep(200 * time.Millisecond)

	sb := sess.Scrollback.Bytes()
	if !strings.Contains(string(sb), "SCROLLBACK_MARKER_99") {
		t.Fatalf("scrollback does not contain marker; len=%d, content=%q", len(sb), string(sb[:min(len(sb), 200)]))
	}
}

func TestSession_RealPTY_Resize(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "resize")
	sess.Start()

	ch := sess.Subscribe("resize-listener")

	if err := sess.Resize(40, 10); err != nil {
		t.Fatalf("Resize error: %v", err)
	}

	// Ask the shell for the column count.
	sess.Write([]byte("tput cols\n"))
	out := waitForOutput(t, ch, "40", 10*time.Second)
	if !strings.Contains(out, "40") {
		t.Fatalf("expected '40' in output, got: %q", out)
	}
}

func TestSession_RealPTY_Close(t *testing.T) {
	// Not parallel — we manually manage lifecycle.
	shell := resolveShell()
	ctx, cancel := context.WithCancel(context.Background())

	cmd := exec.CommandContext(ctx, shell)
	cmd.Dir = t.TempDir()
	cmd.Env = buildCleanEnv()

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: 80, Rows: 24})
	if err != nil {
		cancel()
		t.Fatalf("pty.StartWithSize: %v", err)
	}

	sess := &Session{
		ID:         "close-test",
		PTY:        ptmx,
		Cmd:        cmd,
		Ctx:        ctx,
		Cancel:     cancel,
		listeners:  make(map[string]chan []byte),
		Scrollback: NewRingBuffer(defaultScrollbackSize),
		Cols:       80,
		Rows:       24,
		CWD:        cmd.Dir,
		Shell:      shell,
		CreatedAt:  time.Now(),
	}
	sess.Start()

	sess.Close()

	// After close, the process should have exited.
	// ProcessState is populated after Wait returns.
	if sess.Cmd.ProcessState == nil {
		t.Fatal("Cmd.ProcessState is nil after Close — process did not exit")
	}
}

func TestSession_RealPTY_ContextCancel(t *testing.T) {
	t.Parallel()

	sess := newTestSession(t, "ctx-cancel")
	sess.Start()

	ch := sess.Subscribe("cancel-listener")

	// Cancel the context.
	sess.Cancel()

	// The readLoop should exit and close the channel.
	deadline := time.After(5 * time.Second)
	for {
		select {
		case _, ok := <-ch:
			if !ok {
				return // success — channel closed
			}
		case <-deadline:
			t.Fatal("timeout: listener channel was not closed after context cancel")
		}
	}
}

func TestSession_RealPTY_SIGHUP(t *testing.T) {
	// Not parallel — we manually manage lifecycle.
	shell := resolveShell()
	ctx, cancel := context.WithCancel(context.Background())

	cmd := exec.CommandContext(ctx, shell)
	cmd.Dir = t.TempDir()
	cmd.Env = buildCleanEnv()

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: 80, Rows: 24})
	if err != nil {
		cancel()
		t.Fatalf("pty.StartWithSize: %v", err)
	}

	sess := &Session{
		ID:         "sighup-test",
		PTY:        ptmx,
		Cmd:        cmd,
		Ctx:        ctx,
		Cancel:     cancel,
		listeners:  make(map[string]chan []byte),
		Scrollback: NewRingBuffer(defaultScrollbackSize),
		Cols:       80,
		Rows:       24,
		CWD:        cmd.Dir,
		Shell:      shell,
		CreatedAt:  time.Now(),
	}
	sess.Start()

	// Close sends SIGHUP and waits.
	sess.Close()

	if sess.Cmd.ProcessState == nil {
		t.Fatal("process did not exit after SIGHUP/Close")
	}
	// On macOS the exit status is non-zero after signal.
	if sess.Cmd.ProcessState.Success() {
		// Not necessarily a failure — some shells exit 0 on SIGHUP.
		// Just verify the process actually terminated.
	}
}

// min returns the smaller of two ints.
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
