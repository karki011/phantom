// Run with: go test -race -v ./internal/terminal/...
// Author: Subash Karki
//
//go:build !windows

package terminal

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestRestore_TakeSnapshots(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	createTestSession(t, m, "snap-1")
	createTestSession(t, m, "snap-2")

	// Write some data to each session's scrollback directly.
	s1, _ := m.Get("snap-1")
	s2, _ := m.Get("snap-2")
	s1.Scrollback.Write([]byte("session-1-data"))
	s2.Scrollback.Write([]byte("session-2-data"))

	snaps := m.TakeSnapshots()
	if len(snaps) != 2 {
		t.Fatalf("TakeSnapshots() returned %d snapshots, want 2", len(snaps))
	}

	found := make(map[string]Snapshot)
	for _, s := range snaps {
		found[s.PaneID] = s
	}

	for _, id := range []string{"snap-1", "snap-2"} {
		snap, ok := found[id]
		if !ok {
			t.Fatalf("snapshot for %q not found", id)
		}
		if snap.CWD == "" {
			t.Fatalf("snapshot %q has empty CWD", id)
		}
		if snap.Cols != 80 || snap.Rows != 24 {
			t.Fatalf("snapshot %q dims = %dx%d, want 80x24", id, snap.Cols, snap.Rows)
		}
		if snap.Shell == "" {
			t.Fatalf("snapshot %q has empty Shell", id)
		}
	}

	// Verify scrollback content.
	if !strings.Contains(string(found["snap-1"].Scrollback), "session-1-data") {
		t.Fatal("snap-1 scrollback missing expected data")
	}
	if !strings.Contains(string(found["snap-2"].Scrollback), "session-2-data") {
		t.Fatal("snap-2 scrollback missing expected data")
	}
}

func TestRestore_RestoreFromSnapshots(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	cwd := t.TempDir()

	snapshots := []Snapshot{
		{
			PaneID:       "restored-1",
			Shell:        resolveShell(),
			CWD:          cwd,
			Cols:         100,
			Rows:         30,
			Scrollback:   []byte("old-data-1"),
			LastActiveAt: time.Now().Unix(),
		},
		{
			PaneID:       "restored-2",
			Shell:        resolveShell(),
			CWD:          cwd,
			Cols:         120,
			Rows:         40,
			Scrollback:   []byte("old-data-2"),
			LastActiveAt: time.Now().Unix(),
		},
	}

	restored := m.RestoreFromSnapshots(context.Background(), snapshots)
	if len(restored) != 2 {
		t.Fatalf("RestoreFromSnapshots returned %d IDs, want 2", len(restored))
	}

	// Verify sessions were actually created.
	if m.Count() != 2 {
		t.Fatalf("Count() = %d, want 2", m.Count())
	}

	for _, id := range restored {
		sess, ok := m.Get(id)
		if !ok {
			t.Fatalf("Get(%q) returned false after restore", id)
		}
		if sess.CWD != cwd {
			t.Fatalf("restored session %q CWD = %q, want %q", id, sess.CWD, cwd)
		}
	}

	// Verify dimensions match.
	s1, _ := m.Get("restored-1")
	if s1.Cols != 100 || s1.Rows != 30 {
		t.Fatalf("restored-1 dims = %dx%d, want 100x30", s1.Cols, s1.Rows)
	}
	s2, _ := m.Get("restored-2")
	if s2.Cols != 120 || s2.Rows != 40 {
		t.Fatalf("restored-2 dims = %dx%d, want 120x40", s2.Cols, s2.Rows)
	}
}

func TestRestore_RestoreBanner(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	cwd := t.TempDir()

	snapshots := []Snapshot{
		{
			PaneID:       "banner-test",
			Shell:        resolveShell(),
			CWD:          cwd,
			Cols:         80,
			Rows:         24,
			Scrollback:   nil,
			LastActiveAt: time.Now().Unix(),
		},
	}

	restored := m.RestoreFromSnapshots(context.Background(), snapshots)
	if len(restored) != 1 {
		t.Fatalf("RestoreFromSnapshots returned %d, want 1", len(restored))
	}

	sess, _ := m.Get("banner-test")
	sb := string(sess.Scrollback.Bytes())

	if !strings.HasPrefix(sb, restoreBanner) {
		t.Fatalf("scrollback does not start with banner; got prefix: %q", sb[:min(len(sb), 60)])
	}
}

func TestRestore_RestoreScrollbackContent(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	cwd := t.TempDir()

	originalData := []byte("previous-output-here-XYZ")
	snapshots := []Snapshot{
		{
			PaneID:       "sb-content",
			Shell:        resolveShell(),
			CWD:          cwd,
			Cols:         80,
			Rows:         24,
			Scrollback:   originalData,
			LastActiveAt: time.Now().Unix(),
		},
	}

	m.RestoreFromSnapshots(context.Background(), snapshots)

	sess, _ := m.Get("sb-content")
	sb := string(sess.Scrollback.Bytes())

	if !strings.Contains(sb, restoreBanner) {
		t.Fatal("restored scrollback missing banner")
	}
	if !strings.Contains(sb, "previous-output-here-XYZ") {
		t.Fatalf("restored scrollback missing original data; got: %q", sb)
	}
}

func TestRestore_SkipEmptyID(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	cwd := t.TempDir()

	snapshots := []Snapshot{
		{
			PaneID:       "",
			Shell:        resolveShell(),
			CWD:          cwd,
			Cols:         80,
			Rows:         24,
			LastActiveAt: time.Now().Unix(),
		},
		{
			PaneID:       "valid-id",
			Shell:        resolveShell(),
			CWD:          cwd,
			Cols:         80,
			Rows:         24,
			LastActiveAt: time.Now().Unix(),
		},
	}

	restored := m.RestoreFromSnapshots(context.Background(), snapshots)
	if len(restored) != 1 {
		t.Fatalf("RestoreFromSnapshots returned %d IDs, want 1 (empty ID should be skipped)", len(restored))
	}
	if restored[0] != "valid-id" {
		t.Fatalf("restored[0] = %q, want %q", restored[0], "valid-id")
	}
}

func TestRestore_RoundTrip(t *testing.T) {
	t.Parallel()

	// Phase 1: Create sessions and take snapshots.
	m1 := newTestManager(t)
	createTestSession(t, m1, "rt-1")
	createTestSession(t, m1, "rt-2")
	createTestSession(t, m1, "rt-3")

	// Write unique data to each scrollback.
	for _, id := range []string{"rt-1", "rt-2", "rt-3"} {
		s, _ := m1.Get(id)
		s.Scrollback.Write([]byte("data-for-" + id))
	}

	snaps := m1.TakeSnapshots()
	if len(snaps) != 3 {
		t.Fatalf("TakeSnapshots returned %d, want 3", len(snaps))
	}

	// Phase 2: Destroy all sessions.
	m1.DestroyAll()
	if m1.Count() != 0 {
		t.Fatalf("Count() after DestroyAll = %d, want 0", m1.Count())
	}

	// Phase 3: Restore into a new manager.
	m2 := newTestManager(t)
	restored := m2.RestoreFromSnapshots(context.Background(), snaps)

	if len(restored) != 3 {
		t.Fatalf("restored %d sessions, want 3", len(restored))
	}
	if m2.Count() != 3 {
		t.Fatalf("Count() after restore = %d, want 3", m2.Count())
	}

	// Verify IDs match.
	restoredSet := make(map[string]bool)
	for _, id := range restored {
		restoredSet[id] = true
	}
	for _, id := range []string{"rt-1", "rt-2", "rt-3"} {
		if !restoredSet[id] {
			t.Fatalf("restored set missing ID %q", id)
		}
	}
}
