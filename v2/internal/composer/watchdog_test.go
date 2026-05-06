// Author: Subash Karki
//
// watchdog_test.go verifies the readStdout watchdog behaviour in session.go.
// The watchdog cancels the child process when stdout goes silent for longer
// than readStdoutTimeout. Tests override that var to keep wall-clock time short.
package composer

import (
	"context"
	"os/exec"
	"testing"
	"time"
)

// withWatchdogTimeout overrides readStdoutTimeout for the duration of the test
// and restores the original value via t.Cleanup. Must be called before Spawn.
func withWatchdogTimeout(t *testing.T, d time.Duration) {
	t.Helper()
	original := readStdoutTimeout
	readStdoutTimeout = d
	t.Cleanup(func() { readStdoutTimeout = original })
}

// waitForStatus polls s.Status() until it equals want or the deadline expires.
func waitForStatus(s *Session, want SessionStatus, deadline time.Duration) bool {
	end := time.Now().Add(deadline)
	for time.Now().Before(end) {
		if s.Status() == want {
			return true
		}
		time.Sleep(20 * time.Millisecond)
	}
	return false
}

// TestWatchdog_KillsHungProcess verifies that the watchdog fires and kills a
// subprocess that produces initial output and then falls silent.
func TestWatchdog_KillsHungProcess(t *testing.T) {
	// Set a very short watchdog so the test completes quickly.
	withWatchdogTimeout(t, 300*time.Millisecond)

	dir := t.TempDir()

	// Script: emit one valid JSON line then hang for 5 minutes.
	script := `echo '{"type":"assistant","subtype":"message_delta","text":"hi"}'; sleep 300`

	factory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", script)
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("watchdog-hung", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: factory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}

	// The subprocess emits one line (resets the watchdog) then goes silent.
	// With a 300 ms timeout the watchdog should fire well within 2 seconds.
	const budget = 2 * time.Second

	stopped := waitForStatus(s, StatusStopped, budget) || waitForStatus(s, StatusCrashed, budget)
	if !stopped {
		// If neither terminal status was reached, clean up and fail.
		s.Stop()
		t.Fatalf("watchdog did not kill the hung process within %s (status=%s)", budget, s.Status())
	}
}

// TestWatchdog_DoesNotFireOnActiveProcess verifies that a subprocess producing
// output frequently enough never triggers the watchdog.
func TestWatchdog_DoesNotFireOnActiveProcess(t *testing.T) {
	// Watchdog fires after 600 ms; process outputs every 100 ms — should be fine.
	withWatchdogTimeout(t, 600*time.Millisecond)

	dir := t.TempDir()

	// Script: emit a valid JSON line every 100 ms for 2 seconds then exit cleanly.
	script := `for i in $(seq 1 20); do
		echo '{"type":"assistant","subtype":"message_delta","text":"tick"}';
		sleep 0.1;
	done`

	factory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", script)
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("watchdog-active", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: factory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}
	defer s.Stop()

	// Let the process run for 1.5 s — it should stay Running (watchdog must NOT fire).
	time.Sleep(1500 * time.Millisecond)

	if st := s.Status(); st != StatusRunning {
		t.Fatalf("expected process to still be running after 1.5s, got status=%s (watchdog fired unexpectedly)", st)
	}
}

// TestWatchdog_ResetsOnOutput verifies that each line of output resets the
// watchdog timer, so a process that outputs at 400 ms intervals survives a
// 500 ms watchdog without being killed.
func TestWatchdog_ResetsOnOutput(t *testing.T) {
	// Watchdog fires after 500 ms; process outputs every 400 ms — should reset in time.
	withWatchdogTimeout(t, 500*time.Millisecond)

	dir := t.TempDir()

	// Script: emit a valid JSON line every 400 ms for ~2 seconds (5 lines).
	script := `for i in $(seq 1 5); do
		echo '{"type":"assistant","subtype":"message_delta","text":"ping"}';
		sleep 0.4;
	done`

	factory := func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
		cmd := exec.CommandContext(ctx, "sh", "-c", script)
		cmd.Dir = cwd
		return cmd
	}

	s := NewSession("watchdog-reset", dir, SessionOptions{
		SessionDir: dir,
		CmdFactory: factory,
	})

	if err := s.Spawn(); err != nil {
		t.Fatalf("Spawn failed: %v", err)
	}
	defer s.Stop()

	// After 1.8 s (4 intervals of 400 ms + margin) the process should still be
	// running because every 400 ms output resets the 500 ms watchdog.
	time.Sleep(1800 * time.Millisecond)

	st := s.Status()
	if st == StatusCrashed {
		t.Fatalf("watchdog fired on a process that was actively producing output (status=crashed)")
	}
	// StatusStopped is acceptable here: the script may have finished its 5 lines
	// and exited cleanly. The key constraint is it must NOT be StatusCrashed.
}
