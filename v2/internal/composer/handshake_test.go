// Author: Subash Karki
package composer

import (
	"context"
	"fmt"
	"os/exec"
	"testing"
	"time"
)

func TestHandshake_Success(t *testing.T) {
	dir := t.TempDir()

	// Mock subprocess: reads one line from stdin, then emits a valid
	// system_info JSON event to stdout.
	script := `read -r line; echo '{"type":"system","subtype":"info","session_id":"sess-abc-123","version":"1.0.33"}'`

	factory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", script)
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("hs-success", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: factory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}
	defer s.Stop()

	result, err := s.Handshake(5 * time.Second)
	if err != nil {
		t.Fatalf("Handshake failed: %v", err)
	}

	if !result.Valid {
		t.Fatalf("expected Valid=true, got error: %s", result.Error)
	}
	if result.SessionID != "sess-abc-123" {
		t.Fatalf("expected SessionID %q, got %q", "sess-abc-123", result.SessionID)
	}
	if result.CLIVersion != "1.0.33" {
		t.Fatalf("expected CLIVersion %q, got %q", "1.0.33", result.CLIVersion)
	}
}

func TestHandshake_Timeout(t *testing.T) {
	dir := t.TempDir()

	// Mock subprocess: reads stdin but never writes to stdout.
	script := `read -r line; sleep 30`

	factory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", script)
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("hs-timeout", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: factory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}
	defer s.Stop()

	// Use a short timeout so the test doesn't block.
	result, err := s.Handshake(500 * time.Millisecond)
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}

	if result.Valid {
		t.Fatal("expected Valid=false on timeout")
	}

	if got := err.Error(); !searchString(got, "timed out") {
		t.Fatalf("expected 'timed out' in error, got: %s", got)
	}
}

func TestHandshake_InvalidResponse(t *testing.T) {
	dir := t.TempDir()

	// Mock subprocess: reads stdin, then emits an error event.
	script := `read -r line; echo '{"type":"error","error":"protocol mismatch"}'`

	factory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", script)
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("hs-invalid", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: factory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}
	defer s.Stop()

	result, err := s.Handshake(5 * time.Second)
	if err == nil {
		t.Fatal("expected error for invalid response")
	}

	if result.Valid {
		t.Fatal("expected Valid=false for error event")
	}

	if result.Error == "" {
		t.Fatal("expected non-empty error description")
	}
}

func TestHandshake_SessionResumed(t *testing.T) {
	dir := t.TempDir()

	// Mock subprocess: emits a session_resumed event (used with --resume).
	script := `read -r line; echo '{"type":"system","subtype":"session_resumed","session_id":"resumed-xyz"}'`

	factory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", script)
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("hs-resumed", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: factory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}
	defer s.Stop()

	result, err := s.Handshake(5 * time.Second)
	if err != nil {
		t.Fatalf("Handshake failed: %v", err)
	}

	if !result.Valid {
		t.Fatalf("expected Valid=true, got error: %s", result.Error)
	}
	if result.SessionID != "resumed-xyz" {
		t.Fatalf("expected SessionID %q, got %q", "resumed-xyz", result.SessionID)
	}
}

func TestHandshake_NotRunning(t *testing.T) {
	s := NewSession("hs-idle", "/tmp", SessionOptions{
		SessionDir: t.TempDir(),
	})

	// Handshake on idle session should fail immediately.
	_, err := s.Handshake(1 * time.Second)
	if err == nil {
		t.Fatal("expected error for handshake on non-running session")
	}
	if got := fmt.Sprintf("%v", err); !searchString(got, "not running") {
		t.Fatalf("expected 'not running' in error, got: %s", got)
	}
}
