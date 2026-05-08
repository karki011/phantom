// Author: Subash Karki
package composer

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestNewSession(t *testing.T) {
	s := NewSession("test-1", "/tmp/cwd", SessionOptions{
		SessionDir: t.TempDir(),
	})

	if s.ID != "test-1" {
		t.Fatalf("expected ID %q, got %q", "test-1", s.ID)
	}
	if s.CWD != "/tmp/cwd" {
		t.Fatalf("expected CWD %q, got %q", "/tmp/cwd", s.CWD)
	}
	if s.Status() != StatusIdle {
		t.Fatalf("expected status %q, got %q", StatusIdle, s.Status())
	}
	if s.CreatedAt.IsZero() {
		t.Fatal("CreatedAt should not be zero")
	}
}

func TestSession_SpawnAndStop_WithEcho(t *testing.T) {
	dir := t.TempDir()

	// CmdFactory that creates an echo-back subprocess:
	// reads stdin line by line and echoes each line to stdout.
	echoFactory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", `while IFS= read -r line; do echo "$line"; done`)
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("echo-test", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: echoFactory,
	})

	var mu sync.Mutex
	var received []StreamEvent

	s.OnEvent(func(ev StreamEvent) {
		mu.Lock()
		defer mu.Unlock()
		received = append(received, ev)
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}

	if s.Status() != StatusRunning {
		t.Fatalf("expected status %q after Spawn, got %q", StatusRunning, s.Status())
	}

	// Send a valid stream-json event line.
	payload := `{"type":"assistant","subtype":"message_delta","text":"hello"}`
	if err := s.Send([]byte(payload)); err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	// Wait for the echoed event to arrive.
	deadline := time.After(5 * time.Second)
	for {
		mu.Lock()
		n := len(received)
		mu.Unlock()
		if n > 0 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for echoed event")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	mu.Lock()
	ev := received[0]
	mu.Unlock()

	if ev.Kind != EventAssistantMessageDelta {
		t.Fatalf("expected kind %q, got %q", EventAssistantMessageDelta, ev.Kind)
	}
	if ev.Text != "hello" {
		t.Fatalf("expected text %q, got %q", "hello", ev.Text)
	}

	s.Stop()

	// Give waitForExit goroutine time to set status.
	time.Sleep(200 * time.Millisecond)

	if st := s.Status(); st != StatusStopped {
		t.Fatalf("expected status %q after Stop, got %q", StatusStopped, st)
	}
}

func TestSession_PIDFile(t *testing.T) {
	dir := t.TempDir()

	sleepFactory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sleep", "10")
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("pid-test", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: sleepFactory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}

	pidPath := filepath.Join(dir, "pid.json")

	// Verify pid.json exists.
	data, err := os.ReadFile(pidPath)
	if err != nil {
		t.Fatalf("pid.json should exist after Spawn: %v", err)
	}

	var info pidInfo
	if err := json.Unmarshal(data, &info); err != nil {
		t.Fatalf("pid.json invalid JSON: %v", err)
	}
	if info.PID <= 0 {
		t.Fatalf("expected positive PID, got %d", info.PID)
	}

	s.Stop()
	time.Sleep(200 * time.Millisecond)

	// Verify pid.json is removed.
	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Fatal("pid.json should be removed after Stop")
	}
}

func TestSession_SendWhileNotRunning(t *testing.T) {
	s := NewSession("idle-test", "/tmp", SessionOptions{
		SessionDir: t.TempDir(),
	})

	err := s.Send([]byte(`{"type":"test"}`))
	if err == nil {
		t.Fatal("expected error when sending to non-running session")
	}

	expected := "session not running"
	if err.Error() != expected {
		t.Fatalf("expected error %q, got %q", expected, err.Error())
	}
}

func TestSession_CrashedStatus(t *testing.T) {
	dir := t.TempDir()

	// CmdFactory that exits with non-zero immediately.
	crashFactory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", "exit 1")
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("crash-test", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: crashFactory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}

	// Wait for the process to crash and status to update.
	deadline := time.After(5 * time.Second)
	for {
		if s.Status() == StatusCrashed {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("timed out waiting for Crashed status, current: %s", s.Status())
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}
}

func TestSession_StderrEvents(t *testing.T) {
	dir := t.TempDir()

	stderrFactory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", fmt.Sprintf("echo 'something went wrong' >&2; sleep 1"))
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("stderr-test", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: stderrFactory,
	})

	var mu sync.Mutex
	var received []StreamEvent

	s.OnEvent(func(ev StreamEvent) {
		mu.Lock()
		defer mu.Unlock()
		received = append(received, ev)
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}

	// Wait for stderr event.
	deadline := time.After(5 * time.Second)
	for {
		mu.Lock()
		n := len(received)
		mu.Unlock()
		if n > 0 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for stderr event")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	s.Stop()

	mu.Lock()
	ev := received[0]
	mu.Unlock()

	if ev.Kind != EventError {
		t.Fatalf("expected kind %q for stderr, got %q", EventError, ev.Kind)
	}
	if ev.RawType != "stderr" {
		t.Fatalf("expected RawType %q, got %q", "stderr", ev.RawType)
	}
	if ev.Text != "something went wrong" {
		t.Fatalf("expected text %q, got %q", "something went wrong", ev.Text)
	}
}

func TestSession_Hibernate_StoresUUID(t *testing.T) {
	s := &Session{
		ID:        "test-session",
		status:    StatusRunning,
		sessionID: "claude-uuid-123",
		lifecycle: LifecycleActive,
	}
	s.done = make(chan struct{})

	err := s.Hibernate()
	if err != nil {
		t.Fatalf("Hibernate() error: %v", err)
	}

	if s.lifecycle != LifecycleHibernated {
		t.Errorf("lifecycle = %q, want %q", s.lifecycle, LifecycleHibernated)
	}

	if s.hibernateUUID != "claude-uuid-123" {
		t.Errorf("hibernateUUID = %q, want %q", s.hibernateUUID, "claude-uuid-123")
	}
}

func TestSession_Lifecycle_InitialState(t *testing.T) {
	s := &Session{}
	if s.Lifecycle() != LifecycleActive {
		t.Errorf("initial lifecycle = %q, want %q", s.Lifecycle(), LifecycleActive)
	}
}
