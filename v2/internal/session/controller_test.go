// controller_test.go tests the high-level session Controller.
// Author: Subash Karki
package session

import (
	"context"
	"database/sql"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
	_ "modernc.org/sqlite"
)

// openMemDB returns an in-memory SQLite DB suitable for testing.
func openMemDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open mem db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	// Minimal session_events table required by stream.Store.
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS session_events (
		id        INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id TEXT    NOT NULL,
		type       TEXT    NOT NULL,
		data       TEXT    NOT NULL DEFAULT '{}',
		timestamp  INTEGER NOT NULL DEFAULT 0
	)`)
	if err != nil {
		t.Fatalf("create session_events: %v", err)
	}

	// session_policies table required by PolicyStore.
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS session_policies (
		session_id TEXT PRIMARY KEY,
		policy     TEXT NOT NULL DEFAULT 'supervised',
		updated_at INTEGER NOT NULL DEFAULT 0
	)`)
	if err != nil {
		t.Fatalf("create session_policies: %v", err)
	}

	return db
}

func newTestController(t *testing.T) (*Controller, *sql.DB) {
	t.Helper()
	db := openMemDB(t)
	ss := stream.NewStore(db)

	var events []string
	ctrl := NewController(db, ss, func(name string, _ interface{}) {
		events = append(events, name)
	})
	_ = events // referenced to silence unused warning; tests inspect state directly

	ctx := context.Background()
	if err := ctrl.Init(ctx); err != nil {
		t.Fatalf("controller init: %v", err)
	}
	return ctrl, db
}

func TestController_PauseResume(t *testing.T) {
	ctrl, _ := newTestController(t)
	ctx := context.Background()
	sid := "sess-pause-resume"

	if err := ctrl.Pause(ctx, sid); err != nil {
		t.Fatalf("Pause: %v", err)
	}
	if !ctrl.IsPaused(sid) {
		t.Fatal("expected session to be paused")
	}

	// Buffer data while paused.
	if !ctrl.BufferIfPaused(sid, []byte("hello")) {
		t.Fatal("BufferIfPaused should return true when paused")
	}

	var flushed [][]byte
	if err := ctrl.Resume(ctx, sid, func(b []byte) {
		cp := make([]byte, len(b))
		copy(cp, b)
		flushed = append(flushed, cp)
	}); err != nil {
		t.Fatalf("Resume: %v", err)
	}

	if ctrl.IsPaused(sid) {
		t.Fatal("session should not be paused after Resume")
	}
	if len(flushed) != 1 || string(flushed[0]) != "hello" {
		t.Fatalf("expected flushed [hello], got %v", flushed)
	}

	st := ctrl.GetState(sid)
	if st == nil {
		t.Fatal("GetState returned nil after Resume")
	}
	if st.State != StateActive {
		t.Fatalf("expected state active, got %s", st.State)
	}
}

func TestController_SetPolicy(t *testing.T) {
	ctrl, _ := newTestController(t)
	ctx := context.Background()
	sid := "sess-policy"

	if err := ctrl.SetPolicy(ctx, sid, PolicyAutoAccept); err != nil {
		t.Fatalf("SetPolicy: %v", err)
	}

	got, err := ctrl.policies.Get(ctx, sid)
	if err != nil {
		t.Fatalf("Get policy: %v", err)
	}
	if got != PolicyAutoAccept {
		t.Fatalf("expected policy auto, got %s", got)
	}
}

func TestController_Branch(t *testing.T) {
	ctrl, db := newTestController(t)
	ctx := context.Background()
	sid := "sess-branch-parent"

	// Seed some events directly in the DB.
	for i := 0; i < 5; i++ {
		_, err := db.Exec(
			`INSERT INTO session_events (session_id, type, data, timestamp) VALUES (?, ?, ?, ?)`,
			sid, "assistant", `{"seq_num":`+itoa(i)+`}`, int64(i),
		)
		if err != nil {
			t.Fatalf("seed event %d: %v", i, err)
		}
	}

	info, err := ctrl.Branch(ctx, sid, 2)
	if err != nil {
		t.Fatalf("Branch: %v", err)
	}
	if info.ParentID != sid {
		t.Fatalf("expected parent %s, got %s", sid, info.ParentID)
	}
	if info.BranchPoint != 2 {
		t.Fatalf("expected branch point 2, got %d", info.BranchPoint)
	}

	branches, err := ctrl.GetBranches(ctx, sid)
	if err != nil {
		t.Fatalf("GetBranches: %v", err)
	}
	if len(branches) != 1 {
		t.Fatalf("expected 1 branch, got %d", len(branches))
	}
	if branches[0].ID != info.ID {
		t.Fatalf("branch ID mismatch")
	}

	// Verify branch state was persisted in memory.
	bst := ctrl.GetState(info.ID)
	if bst == nil {
		t.Fatal("branch state not found")
	}
	if bst.State != StateBranched {
		t.Fatalf("expected branched state, got %s", bst.State)
	}
	if bst.BranchParent != sid {
		t.Fatalf("expected branch parent %s, got %s", sid, bst.BranchParent)
	}
}

func TestController_Rewind(t *testing.T) {
	ctrl, _ := newTestController(t)
	ctx := context.Background()
	sid := "sess-rewind"

	if err := ctrl.Rewind(ctx, sid, 7); err != nil {
		t.Fatalf("Rewind: %v", err)
	}

	st := ctrl.GetState(sid)
	if st == nil {
		t.Fatal("GetState returned nil after Rewind")
	}
	if st.State != StateRewound {
		t.Fatalf("expected state rewound, got %s", st.State)
	}
	if st.BranchPoint != 7 {
		t.Fatalf("expected branch point 7, got %d", st.BranchPoint)
	}
}

func TestController_IsPaused(t *testing.T) {
	ctrl, _ := newTestController(t)
	ctx := context.Background()
	sid := "sess-is-paused"

	if ctrl.IsPaused(sid) {
		t.Fatal("should not be paused initially")
	}

	if err := ctrl.Pause(ctx, sid); err != nil {
		t.Fatalf("Pause: %v", err)
	}
	if !ctrl.IsPaused(sid) {
		t.Fatal("should be paused after Pause()")
	}

	if err := ctrl.Resume(ctx, sid, func([]byte) {}); err != nil {
		t.Fatalf("Resume: %v", err)
	}
	if ctrl.IsPaused(sid) {
		t.Fatal("should not be paused after Resume()")
	}
}

func TestController_BufferIfPaused(t *testing.T) {
	ctrl, _ := newTestController(t)
	ctx := context.Background()
	sid := "sess-buffer"

	// Not paused — should pass through.
	if ctrl.BufferIfPaused(sid, []byte("noop")) {
		t.Fatal("BufferIfPaused should return false when not paused")
	}

	if err := ctrl.Pause(ctx, sid); err != nil {
		t.Fatalf("Pause: %v", err)
	}

	// Paused — should buffer.
	if !ctrl.BufferIfPaused(sid, []byte("captured")) {
		t.Fatal("BufferIfPaused should return true when paused")
	}

	// Verify the buffered byte count.
	v, ok := ctrl.pauses.Load(sid)
	if !ok {
		t.Fatal("pause buffer not found")
	}
	pb := v.(*PauseBuffer)
	if pb.BufferSize() != len("captured") {
		t.Fatalf("expected %d buffered bytes, got %d", len("captured"), pb.BufferSize())
	}
}

// itoa is a minimal int-to-string helper to avoid importing strconv in tests.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := make([]byte, 0, 10)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}
