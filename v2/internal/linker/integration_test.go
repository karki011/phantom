// Run with: go test -race -v ./internal/linker/...
// Author: Subash Karki
//
//go:build !windows

package linker

import (
	"context"
	"testing"
)

// ---------------------------------------------------------------------------
// Full lifecycle: terminal+session → link → unlink → re-link
// ---------------------------------------------------------------------------

func TestFullLifecycle(t *testing.T) {
	q := setupTestDB(t)
	l := New(q, nil, noopEmitter())
	ctx := context.Background()

	// 1. Insert a terminal and session with matching CWD.
	insertTestTerminal(t, q, "pane-1", "/tmp/my-repo", "wt-1", "")
	insertTestSession(t, q, "sess-1", "/tmp/my-repo", 12345)

	// 2. Link session to terminals.
	if err := l.LinkSessionToUnlinkedTerminals(ctx, "sess-1", "/tmp/my-repo", 12345); err != nil {
		t.Fatalf("first link: %v", err)
	}

	term, err := q.GetTerminalSession(ctx, "pane-1")
	if err != nil {
		t.Fatal(err)
	}
	if !term.SessionID.Valid || term.SessionID.String != "sess-1" {
		t.Fatalf("after link: session_id = %v, want %q", term.SessionID, "sess-1")
	}

	// 3. Unlink.
	if err := l.UnlinkSession(ctx, "sess-1"); err != nil {
		t.Fatalf("unlink: %v", err)
	}

	term, err = q.GetTerminalSession(ctx, "pane-1")
	if err != nil {
		t.Fatal(err)
	}
	if term.SessionID.Valid {
		t.Fatalf("after unlink: session_id = %v, want NULL", term.SessionID)
	}

	// 4. Re-link with a new session.
	insertTestSession(t, q, "sess-2", "/tmp/my-repo", 67890)
	if err := l.LinkSessionToUnlinkedTerminals(ctx, "sess-2", "/tmp/my-repo", 67890); err != nil {
		t.Fatalf("re-link: %v", err)
	}

	term, err = q.GetTerminalSession(ctx, "pane-1")
	if err != nil {
		t.Fatal(err)
	}
	if !term.SessionID.Valid || term.SessionID.String != "sess-2" {
		t.Fatalf("after re-link: session_id = %v, want %q", term.SessionID, "sess-2")
	}
}

// ---------------------------------------------------------------------------
// Reverse order: session first, then terminal
// ---------------------------------------------------------------------------

func TestReverseOrder(t *testing.T) {
	q := setupTestDB(t)
	l := New(q, nil, noopEmitter())
	ctx := context.Background()

	// 1. Insert session first.
	insertTestSession(t, q, "sess-1", "/tmp/my-repo", 12345)

	// 2. Insert terminal second.
	insertTestTerminal(t, q, "pane-1", "/tmp/my-repo", "wt-1", "")

	// 3. Link terminal to active session.
	if err := l.LinkTerminalToActiveSession(ctx, "pane-1", "/tmp/my-repo", "wt-1", ""); err != nil {
		t.Fatalf("LinkTerminalToActiveSession: %v", err)
	}

	term, err := q.GetTerminalSession(ctx, "pane-1")
	if err != nil {
		t.Fatal(err)
	}
	if !term.SessionID.Valid || term.SessionID.String != "sess-1" {
		t.Fatalf("session_id = %v, want %q", term.SessionID, "sess-1")
	}
}

// ---------------------------------------------------------------------------
// Worktree isolation: only CWD-matching terminals are linked
// ---------------------------------------------------------------------------

func TestWorktreeIsolation(t *testing.T) {
	q := setupTestDB(t)
	l := New(q, nil, noopEmitter())
	ctx := context.Background()

	// Terminal A: in main worktree.
	insertTestTerminal(t, q, "pane-a", "/repos/my-project", "wt-1", "")

	// Terminal B: in a different worktree path.
	insertTestTerminal(t, q, "pane-b", "/repos/my-project-worktrees/feat", "wt-2", "")

	// Session: CWD matches terminal A only.
	insertTestSession(t, q, "sess-1", "/repos/my-project", 12345)

	if err := l.LinkSessionToUnlinkedTerminals(ctx, "sess-1", "/repos/my-project", 12345); err != nil {
		t.Fatalf("LinkSessionToUnlinkedTerminals: %v", err)
	}

	// Terminal A should be linked.
	termA, err := q.GetTerminalSession(ctx, "pane-a")
	if err != nil {
		t.Fatal(err)
	}
	if !termA.SessionID.Valid || termA.SessionID.String != "sess-1" {
		t.Fatalf("terminal A session_id = %v, want %q", termA.SessionID, "sess-1")
	}

	// Terminal B should NOT be linked (different CWD).
	termB, err := q.GetTerminalSession(ctx, "pane-b")
	if err != nil {
		t.Fatal(err)
	}
	if termB.SessionID.Valid {
		t.Fatalf("terminal B session_id = %v, want NULL (worktree isolation)", termB.SessionID)
	}
}

// ---------------------------------------------------------------------------
// Recipe terminal (project-scoped, no worktree) can still link
// ---------------------------------------------------------------------------

func TestRecipeProjectScoped(t *testing.T) {
	q := setupTestDB(t)
	l := New(q, nil, noopEmitter())
	ctx := context.Background()

	// Insert the referenced project first (FK constraint).
	insertTestProject(t, q, "proj-1", "my-project", "/repos/my-project")

	// Recipe terminal: no worktree_id, has project_id.
	insertTestTerminal(t, q, "pane-recipe", "/repos/my-project", "", "proj-1")

	insertTestSession(t, q, "sess-1", "/repos/my-project", 12345)

	if err := l.LinkSessionToUnlinkedTerminals(ctx, "sess-1", "/repos/my-project", 12345); err != nil {
		t.Fatalf("LinkSessionToUnlinkedTerminals: %v", err)
	}

	term, err := q.GetTerminalSession(ctx, "pane-recipe")
	if err != nil {
		t.Fatal(err)
	}
	if !term.SessionID.Valid || term.SessionID.String != "sess-1" {
		t.Fatalf("session_id = %v, want %q", term.SessionID, "sess-1")
	}
}
