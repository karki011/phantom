// Run with: go test -race -v ./internal/linker/...
// Author: Subash Karki
//
//go:build !windows

package linker

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"

	_ "modernc.org/sqlite"
)

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// setupTestDB creates an in-memory SQLite database with all migrations applied.
func setupTestDB(t *testing.T) *db.Queries {
	t.Helper()

	sqlDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })

	// Enable foreign keys.
	if _, err := sqlDB.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatal(err)
	}

	// Apply migrations in order.
	for _, migration := range []string{
		"001_initial_schema.up.sql",
		"002_terminal_lifecycle.up.sql",
	} {
		data, err := os.ReadFile(filepath.Join("..", "db", "migrations", migration))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := sqlDB.Exec(string(data)); err != nil {
			t.Fatalf("apply %s: %v", migration, err)
		}
	}

	return db.New(sqlDB)
}

// eventRecord captures a single emitted event.
type eventRecord struct {
	Name string
	Data interface{}
}

// recordingEmitter returns an emitEvent function and a slice of recorded events.
// The returned getter is safe for concurrent reads AFTER all emits have completed.
func recordingEmitter() (func(string, interface{}), func() []eventRecord) {
	var mu sync.Mutex
	var events []eventRecord

	emit := func(name string, data interface{}) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, eventRecord{Name: name, Data: data})
	}

	getter := func() []eventRecord {
		mu.Lock()
		defer mu.Unlock()
		cp := make([]eventRecord, len(events))
		copy(cp, events)
		return cp
	}

	return emit, getter
}

// noopEmitter returns an emitter that discards events.
func noopEmitter() func(string, interface{}) {
	return func(string, interface{}) {}
}

// insertTestTerminal creates a terminal_sessions row for testing.
func insertTestTerminal(t *testing.T, q *db.Queries, paneID, cwd, worktreeID, projectID string) {
	t.Helper()
	now := time.Now().UnixMilli()
	err := q.CreateTerminalSession(context.Background(), db.CreateTerminalSessionParams{
		PaneID:       paneID,
		WorktreeID:   nullStr(worktreeID),
		ProjectID:    nullStr(projectID),
		SessionID:    sql.NullString{},
		Shell:        nullStr("/bin/zsh"),
		Cwd:          nullStr(cwd),
		Cols:         sql.NullInt64{Int64: 80, Valid: true},
		Rows:         sql.NullInt64{Int64: 24, Valid: true},
		Status:       nullStr("active"),
		StartedAt:    sql.NullInt64{Int64: now, Valid: true},
		LastActiveAt: sql.NullInt64{Int64: now, Valid: true},
	})
	if err != nil {
		t.Fatalf("insert test terminal %q: %v", paneID, err)
	}
}

// insertTestSession creates a sessions row for testing.
func insertTestSession(t *testing.T, q *db.Queries, id, cwd string, pid int64) {
	t.Helper()
	now := time.Now().UnixMilli()
	err := q.CreateSession(context.Background(), db.CreateSessionParams{
		ID:        id,
		Pid:       sql.NullInt64{Int64: pid, Valid: pid > 0},
		Cwd:       nullStr(cwd),
		Status:    nullStr("active"),
		StartedAt: sql.NullInt64{Int64: now, Valid: true},
	})
	if err != nil {
		t.Fatalf("insert test session %q: %v", id, err)
	}
}

// insertTestProject creates a projects row for testing (needed for FK constraints).
func insertTestProject(t *testing.T, q *db.Queries, id, name, repoPath string) {
	t.Helper()
	now := time.Now().UnixMilli()
	err := q.CreateProject(context.Background(), db.CreateProjectParams{
		ID:        id,
		Name:      name,
		RepoPath:  repoPath,
		CreatedAt: now,
	})
	if err != nil {
		t.Fatalf("insert test project %q: %v", id, err)
	}
}

// nullStr is a helper to create sql.NullString from a string.
func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

// ---------------------------------------------------------------------------
// LinkTerminalToActiveSession
// ---------------------------------------------------------------------------

func TestLinkTerminalToActiveSession(t *testing.T) {
	q := setupTestDB(t)
	emit, getEvents := recordingEmitter()
	l := New(q, nil, emit)

	insertTestSession(t, q, "sess-1", "/repos/my-project", 12345)
	insertTestTerminal(t, q, "pane-1", "/repos/my-project", "wt-1", "")

	err := l.LinkTerminalToActiveSession(context.Background(), "pane-1", "/repos/my-project", "wt-1", "")
	if err != nil {
		t.Fatalf("LinkTerminalToActiveSession: %v", err)
	}

	// Verify the terminal is now linked.
	term, err := q.GetTerminalSession(context.Background(), "pane-1")
	if err != nil {
		t.Fatalf("GetTerminalSession: %v", err)
	}
	if !term.SessionID.Valid || term.SessionID.String != "sess-1" {
		t.Fatalf("session_id = %v, want %q", term.SessionID, "sess-1")
	}

	// Verify event was emitted.
	events := getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Name != EventTerminalLinked {
		t.Fatalf("event name = %q, want %q", events[0].Name, EventTerminalLinked)
	}
}

// ---------------------------------------------------------------------------
// LinkSessionToUnlinkedTerminals
// ---------------------------------------------------------------------------

func TestLinkSessionToUnlinkedTerminals(t *testing.T) {
	q := setupTestDB(t)
	emit, getEvents := recordingEmitter()
	l := New(q, nil, emit)

	insertTestTerminal(t, q, "pane-1", "/repos/my-project", "wt-1", "")
	insertTestSession(t, q, "sess-1", "/repos/my-project", 12345)

	err := l.LinkSessionToUnlinkedTerminals(context.Background(), "sess-1", "/repos/my-project", 12345)
	if err != nil {
		t.Fatalf("LinkSessionToUnlinkedTerminals: %v", err)
	}

	term, err := q.GetTerminalSession(context.Background(), "pane-1")
	if err != nil {
		t.Fatalf("GetTerminalSession: %v", err)
	}
	if !term.SessionID.Valid || term.SessionID.String != "sess-1" {
		t.Fatalf("session_id = %v, want %q", term.SessionID, "sess-1")
	}

	events := getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Name != EventTerminalLinked {
		t.Fatalf("event name = %q, want %q", events[0].Name, EventTerminalLinked)
	}
}

// ---------------------------------------------------------------------------
// UnlinkSession
// ---------------------------------------------------------------------------

func TestUnlinkOnSessionEnd(t *testing.T) {
	q := setupTestDB(t)
	emit, getEvents := recordingEmitter()
	l := New(q, nil, emit)

	insertTestSession(t, q, "sess-1", "/repos/my-project", 12345)
	insertTestTerminal(t, q, "pane-1", "/repos/my-project", "wt-1", "")

	// Link first.
	err := l.LinkSessionToUnlinkedTerminals(context.Background(), "sess-1", "/repos/my-project", 12345)
	if err != nil {
		t.Fatalf("link: %v", err)
	}

	// Now unlink.
	err = l.UnlinkSession(context.Background(), "sess-1")
	if err != nil {
		t.Fatalf("UnlinkSession: %v", err)
	}

	term, err := q.GetTerminalSession(context.Background(), "pane-1")
	if err != nil {
		t.Fatalf("GetTerminalSession: %v", err)
	}
	if term.SessionID.Valid {
		t.Fatalf("session_id = %v, want NULL", term.SessionID)
	}

	events := getEvents()
	// 1 link event + 1 unlink event = 2.
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if events[1].Name != EventTerminalUnlinked {
		t.Fatalf("event[1] name = %q, want %q", events[1].Name, EventTerminalUnlinked)
	}
}

// ---------------------------------------------------------------------------
// UnlinkTerminal
// ---------------------------------------------------------------------------

func TestUnlinkOnTerminalDestroy(t *testing.T) {
	q := setupTestDB(t)
	emit, getEvents := recordingEmitter()
	l := New(q, nil, emit)

	insertTestSession(t, q, "sess-1", "/repos/my-project", 12345)
	insertTestTerminal(t, q, "pane-1", "/repos/my-project", "wt-1", "")

	// Link first.
	err := l.LinkTerminalToActiveSession(context.Background(), "pane-1", "/repos/my-project", "wt-1", "")
	if err != nil {
		t.Fatalf("link: %v", err)
	}

	// Unlink the terminal.
	err = l.UnlinkTerminal(context.Background(), "pane-1")
	if err != nil {
		t.Fatalf("UnlinkTerminal: %v", err)
	}

	term, err := q.GetTerminalSession(context.Background(), "pane-1")
	if err != nil {
		t.Fatalf("GetTerminalSession: %v", err)
	}
	if term.SessionID.Valid {
		t.Fatalf("session_id = %v, want NULL", term.SessionID)
	}

	events := getEvents()
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if events[1].Name != EventTerminalUnlinked {
		t.Fatalf("event[1] name = %q, want %q", events[1].Name, EventTerminalUnlinked)
	}
}

// ---------------------------------------------------------------------------
// No false match on similar prefix
// ---------------------------------------------------------------------------

func TestNoFalseMatchSimilarPrefix(t *testing.T) {
	q := setupTestDB(t)
	l := New(q, nil, noopEmitter())

	insertTestSession(t, q, "sess-1", "/a/project-other", 12345)
	insertTestTerminal(t, q, "pane-1", "/a/project", "wt-1", "")

	err := l.LinkTerminalToActiveSession(context.Background(), "pane-1", "/a/project", "wt-1", "")
	if err != nil {
		t.Fatalf("LinkTerminalToActiveSession: %v", err)
	}

	term, err := q.GetTerminalSession(context.Background(), "pane-1")
	if err != nil {
		t.Fatalf("GetTerminalSession: %v", err)
	}
	if term.SessionID.Valid {
		t.Fatalf("session_id = %v, want NULL (should not match similar prefix)", term.SessionID)
	}
}

// ---------------------------------------------------------------------------
// Idempotent linking — AND session_id IS NULL guard
// ---------------------------------------------------------------------------

func TestIdempotentLinking(t *testing.T) {
	q := setupTestDB(t)
	l := New(q, nil, noopEmitter())
	ctx := context.Background()

	// Start with one session so no PID disambiguation is needed (termManager=nil).
	insertTestSession(t, q, "sess-A", "/repos/my-project", 111)
	insertTestTerminal(t, q, "pane-1", "/repos/my-project", "wt-1", "")

	// Link to session A via LinkSessionToUnlinkedTerminals.
	err := l.LinkSessionToUnlinkedTerminals(ctx, "sess-A", "/repos/my-project", 111)
	if err != nil {
		t.Fatalf("first link: %v", err)
	}

	term, err := q.GetTerminalSession(ctx, "pane-1")
	if err != nil {
		t.Fatal(err)
	}
	if !term.SessionID.Valid || term.SessionID.String != "sess-A" {
		t.Fatalf("after first link: session_id = %v, want %q", term.SessionID, "sess-A")
	}

	// Insert a second session with the same CWD.
	insertTestSession(t, q, "sess-B", "/repos/my-project", 222)

	// Try to link session B to the same terminal.
	// The SQL guard (session_id IS NULL) should prevent overwrite.
	err = l.LinkSessionToUnlinkedTerminals(ctx, "sess-B", "/repos/my-project", 222)
	if err != nil {
		t.Fatalf("second link: %v", err)
	}

	term, err = q.GetTerminalSession(ctx, "pane-1")
	if err != nil {
		t.Fatal(err)
	}
	if term.SessionID.String != "sess-A" {
		t.Fatalf("session_id changed from %q to %q — idempotency violated", "sess-A", term.SessionID.String)
	}
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

func TestLinkEmitsEvents(t *testing.T) {
	q := setupTestDB(t)
	emit, getEvents := recordingEmitter()
	l := New(q, nil, emit)

	insertTestSession(t, q, "sess-1", "/repos/project", 100)
	insertTestTerminal(t, q, "pane-1", "/repos/project", "", "")

	err := l.LinkSessionToUnlinkedTerminals(context.Background(), "sess-1", "/repos/project", 100)
	if err != nil {
		t.Fatal(err)
	}

	events := getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	evt := events[0]
	if evt.Name != EventTerminalLinked {
		t.Fatalf("event name = %q, want %q", evt.Name, EventTerminalLinked)
	}

	data, ok := evt.Data.(map[string]interface{})
	if !ok {
		t.Fatalf("event data type = %T, want map[string]interface{}", evt.Data)
	}
	if data["paneId"] != "pane-1" {
		t.Fatalf("event paneId = %v, want %q", data["paneId"], "pane-1")
	}
	if data["sessionId"] != "sess-1" {
		t.Fatalf("event sessionId = %v, want %q", data["sessionId"], "sess-1")
	}
}

func TestUnlinkEmitsEvents(t *testing.T) {
	q := setupTestDB(t)
	emit, getEvents := recordingEmitter()
	l := New(q, nil, emit)

	insertTestSession(t, q, "sess-1", "/repos/project", 0)
	insertTestTerminal(t, q, "pane-a", "/repos/project", "", "")
	insertTestTerminal(t, q, "pane-b", "/repos/project", "", "")

	// Link both terminals (sessionPID=0 skips PID disambiguation which needs a real termManager).
	err := l.LinkSessionToUnlinkedTerminals(context.Background(), "sess-1", "/repos/project", 0)
	if err != nil {
		t.Fatal(err)
	}

	// Unlink session — should emit one event per terminal.
	err = l.UnlinkSession(context.Background(), "sess-1")
	if err != nil {
		t.Fatal(err)
	}

	events := getEvents()
	// 2 link events + 2 unlink events = 4.
	unlinkCount := 0
	for _, e := range events {
		if e.Name == EventTerminalUnlinked {
			unlinkCount++
		}
	}
	if unlinkCount != 2 {
		t.Fatalf("expected 2 unlink events, got %d (total events: %d)", unlinkCount, len(events))
	}
}
