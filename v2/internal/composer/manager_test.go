// Author: Subash Karki
package composer

import (
	"context"
	"os/exec"
	"testing"
	"time"
)

// noopFactory creates a subprocess that reads stdin forever (blocks until
// stdin closes or context cancels). Mirrors the pattern in session_test.go.
var noopFactory CmdFactory = func(ctx context.Context, cwd string, opts SessionOptions) *exec.Cmd {
	return exec.CommandContext(ctx, "sh", "-c", `while IFS= read -r line; do echo "$line"; done`)
}

// newTestManager creates a Manager with auth coordinator factories that
// use instant-exit shell commands instead of the real claude CLI.
func newTestManager(opts ManagerOptions) *Manager {
	m := NewManager(opts)
	m.auth.ProbeCmd = func(ctx context.Context) *exec.Cmd {
		return exec.CommandContext(ctx, "sh", "-c", "exit 0")
	}
	m.auth.RefreshCmd = func(ctx context.Context) *exec.Cmd {
		return exec.CommandContext(ctx, "sh", "-c", "exit 0")
	}
	return m
}

func TestManager_OpenAndList(t *testing.T) {
	dir := t.TempDir()
	mgr := newTestManager(ManagerOptions{MaxSessions: 4, BaseDir: dir})

	info, err := mgr.Open("s1", dir, SessionOptions{CmdFactory: noopFactory})
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	if info.ID != "s1" {
		t.Fatalf("expected info ID %q, got %q", "s1", info.ID)
	}

	// Give Spawn a moment to mark Running.
	time.Sleep(100 * time.Millisecond)

	list := mgr.List()
	if len(list) != 1 {
		t.Fatalf("expected 1 session in list, got %d", len(list))
	}
	if list[0].ID != "s1" {
		t.Fatalf("expected ID %q, got %q", "s1", list[0].ID)
	}
	if list[0].Status != StatusRunning {
		t.Fatalf("expected status %q, got %q", StatusRunning, list[0].Status)
	}

	mgr.CloseAll()
}

func TestManager_DuplicateOpen(t *testing.T) {
	dir := t.TempDir()
	mgr := newTestManager(ManagerOptions{MaxSessions: 4, BaseDir: dir})

	info1, err := mgr.Open("dup", dir, SessionOptions{CmdFactory: noopFactory})
	if err != nil {
		t.Fatalf("first Open failed: %v", err)
	}

	info2, err := mgr.Open("dup", dir, SessionOptions{CmdFactory: noopFactory})
	if err != nil {
		t.Fatalf("second Open should not error: %v", err)
	}

	if info1.ID != info2.ID {
		t.Fatalf("expected same ID for duplicate Open, got %q and %q", info1.ID, info2.ID)
	}

	// Verify only 1 session exists.
	list := mgr.List()
	if len(list) != 1 {
		t.Fatalf("expected 1 session after duplicate Open, got %d", len(list))
	}

	mgr.CloseAll()
}

func TestManager_MaxSessions(t *testing.T) {
	dir := t.TempDir()
	mgr := newTestManager(ManagerOptions{MaxSessions: 2, BaseDir: dir})

	_, err := mgr.Open("a", dir, SessionOptions{CmdFactory: noopFactory})
	if err != nil {
		t.Fatalf("Open a failed: %v", err)
	}

	_, err = mgr.Open("b", dir, SessionOptions{CmdFactory: noopFactory})
	if err != nil {
		t.Fatalf("Open b failed: %v", err)
	}

	_, err = mgr.Open("c", dir, SessionOptions{CmdFactory: noopFactory})
	if err == nil {
		t.Fatal("expected error when exceeding MaxSessions")
	}

	mgr.CloseAll()
}

func TestManager_Close(t *testing.T) {
	dir := t.TempDir()
	mgr := newTestManager(ManagerOptions{MaxSessions: 4, BaseDir: dir})

	_, err := mgr.Open("x", dir, SessionOptions{CmdFactory: noopFactory})
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	mgr.Close("x")
	time.Sleep(200 * time.Millisecond)

	list := mgr.List()
	if len(list) != 0 {
		t.Fatalf("expected 0 sessions after Close, got %d", len(list))
	}
}

func TestManager_CloseAll(t *testing.T) {
	dir := t.TempDir()
	mgr := newTestManager(ManagerOptions{MaxSessions: 8, BaseDir: dir})

	for _, id := range []string{"p", "q", "r"} {
		_, err := mgr.Open(id, dir, SessionOptions{CmdFactory: noopFactory})
		if err != nil {
			t.Fatalf("Open %s failed: %v", id, err)
		}
	}

	if len(mgr.List()) != 3 {
		t.Fatalf("expected 3 sessions before CloseAll, got %d", len(mgr.List()))
	}

	mgr.CloseAll()
	time.Sleep(200 * time.Millisecond)

	if len(mgr.List()) != 0 {
		t.Fatalf("expected 0 sessions after CloseAll, got %d", len(mgr.List()))
	}
}

func TestManager_GetHibernated_ReturnsSession(t *testing.T) {
	m := &Manager{
		sessions: make(map[string]*Session),
		opts:     ManagerOptions{MaxSessions: 8},
	}

	s := &Session{
		ID:        "test-session",
		status:    StatusStopped,
		lifecycle: LifecycleHibernated,
	}
	m.sessions["test-session"] = s

	got, ok := m.Get("test-session")
	if !ok || got == nil {
		t.Fatal("expected to find hibernated session")
	}
	if got.Lifecycle() != LifecycleHibernated {
		t.Errorf("lifecycle = %q, want %q", got.Lifecycle(), LifecycleHibernated)
	}
}

func TestManager_PurgeDead_KeepsHibernated(t *testing.T) {
	m := &Manager{
		sessions: make(map[string]*Session),
		opts:     ManagerOptions{MaxSessions: 8},
	}

	hibernated := &Session{
		ID:        "hibernated-session",
		status:    StatusStopped,
		lifecycle: LifecycleHibernated,
	}
	dead := &Session{
		ID:        "dead-session",
		status:    StatusStopped,
		lifecycle: LifecycleActive,
	}
	m.sessions["hibernated-session"] = hibernated
	m.sessions["dead-session"] = dead

	m.PurgeDead()

	if _, ok := m.Get("hibernated-session"); !ok {
		t.Fatal("PurgeDead should keep hibernated sessions")
	}
	if _, ok := m.Get("dead-session"); ok {
		t.Fatal("PurgeDead should remove dead non-hibernated sessions")
	}
}
