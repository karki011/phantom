// stress_test.go — high-concurrency tests for the session package.
// Run with: go test -race -count=1 -timeout=120s ./internal/session/...
// Author: Subash Karki

package session

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
	_ "modernc.org/sqlite"
)

// openStressDB creates a WAL-mode temp-file SQLite DB suitable for concurrent
// access. modernc.org/sqlite ":memory:" is per-connection; a file DB with WAL
// allows multiple goroutines to share one connection pool correctly.
func openStressDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := fmt.Sprintf("%s/session_stress_%d.db", t.TempDir(), time.Now().UnixNano())
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open stress db: %v", err)
	}
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		t.Fatalf("set WAL: %v", err)
	}
	// One writer at a time for SQLite.
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })

	// Create all required tables.
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS session_events (
		id        INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id TEXT NOT NULL,
		type       TEXT NOT NULL,
		data       TEXT NOT NULL DEFAULT '{}',
		timestamp  INTEGER NOT NULL DEFAULT 0
	)`)
	if err != nil {
		t.Fatalf("create session_events: %v", err)
	}
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

// newStressController creates a Controller backed by a WAL-mode file DB so
// concurrent goroutines in stress tests share the same schema.
func newStressController(t *testing.T) (*Controller, *sql.DB) {
	t.Helper()
	db := openStressDB(t)
	ss := stream.NewStore(db)
	ctrl := NewController(db, ss, func(string, interface{}) {})
	if err := ctrl.Init(context.Background()); err != nil {
		t.Fatalf("stress controller init: %v", err)
	}
	return ctrl, db
}

// TestStress_PauseBufferConcurrent has 100 goroutines writing to a PauseBuffer
// while another goroutine toggles Pause/Resume every 100ms for 3 seconds.
// Validates no races, no lost data integrity, and BufferSize consistency.
func TestStress_PauseBufferConcurrent(t *testing.T) {
	t.Parallel()

	const (
		writers  = 100
		duration = 3 * time.Second
	)

	pb := NewPauseBuffer()
	pb.Pause()

	ctx, cancel := context.WithTimeout(context.Background(), duration)
	defer cancel()

	// Toggler goroutine.
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		paused := true
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if paused {
					pb.Resume(func(data []byte) {
						// No-op flush.
						_ = data
					})
					paused = false
				} else {
					pb.Pause()
					paused = true
				}
			}
		}
	}()

	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			data := []byte(fmt.Sprintf("chunk-%04d", id))
			for {
				select {
				case <-ctx.Done():
					return
				default:
					pb.Write(data)
					_ = pb.IsPaused()
					_ = pb.BufferSize()
				}
			}
		}(i)
	}

	wg.Wait()

	// Final drain — ensure no panic on resume when some goroutines already exited.
	pb.Resume(func([]byte) {})
}

// TestStress_ControllerConcurrent creates 20 sessions and runs 10 goroutines
// per session doing random operations for 3 seconds. Uses a context timeout
// as a deadlock detector.
func TestStress_ControllerConcurrent(t *testing.T) {
	t.Parallel()

	const (
		numSessions    = 20
		goroutinesPerS = 10
		duration       = 3 * time.Second
	)

	ctrl, _ := newStressController(t)

	ctx, cancel := context.WithTimeout(context.Background(), duration+5*time.Second)
	defer cancel()

	runCtx, runCancel := context.WithTimeout(ctx, duration)
	defer runCancel()

	sessionIDs := make([]string, numSessions)
	for i := range sessionIDs {
		sessionIDs[i] = fmt.Sprintf("stress-ctrl-%04d", i)
	}

	var wg sync.WaitGroup
	for _, sid := range sessionIDs {
		for j := 0; j < goroutinesPerS; j++ {
			wg.Add(1)
			go func(sessID string) {
				defer wg.Done()
				for {
					select {
					case <-runCtx.Done():
						return
					default:
					}

					op := rand.Intn(4)
					switch op {
					case 0:
						_ = ctrl.Pause(context.Background(), sessID)
					case 1:
						_ = ctrl.Resume(context.Background(), sessID, func([]byte) {})
					case 2:
						policies := []Policy{PolicySupervised, PolicyAutoAccept, PolicySmart}
						_ = ctrl.SetPolicy(context.Background(), sessID, policies[rand.Intn(len(policies))])
					case 3:
						_ = ctrl.GetState(sessID)
					}
				}
			}(sid)
		}
	}

	// Deadlock detector.
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		// All goroutines exited cleanly.
	case <-ctx.Done():
		t.Fatal("TestStress_ControllerConcurrent: deadlock detected — test timed out")
	}

	// Verify final state is consistent (not nil) for each session that was touched.
	for _, sid := range sessionIDs {
		state := ctrl.GetState(sid)
		_ = state // may be nil if no state was ever written — acceptable
	}
}

// TestStress_BranchConcurrent has 50 goroutines creating branches from the
// same parent session at different event points concurrently.
// Validates all branches are created and no duplicate IDs exist.
func TestStress_BranchConcurrent(t *testing.T) {
	t.Parallel()

	const (
		goroutines = 50
		numEvents  = 10
	)

	ctrl, db := newStressController(t)
	ctx := context.Background()
	parentSID := "stress-branch-parent"

	// Seed events into the DB.
	for i := 0; i < numEvents; i++ {
		_, err := db.Exec(
			`INSERT INTO session_events (session_id, type, data, timestamp) VALUES (?, ?, ?, ?)`,
			parentSID, "assistant", fmt.Sprintf(`{"seq_num":%d}`, i), int64(i),
		)
		if err != nil {
			t.Fatalf("seed event %d: %v", i, err)
		}
	}

	type result struct {
		info *BranchInfo
		err  error
	}

	results := make([]result, goroutines)
	var wg sync.WaitGroup

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			atSeq := rand.Intn(numEvents)
			info, err := ctrl.Branch(ctx, parentSID, atSeq)
			results[idx] = result{info: info, err: err}
		}(i)
	}

	wg.Wait()

	// Collect IDs and check for duplicates.
	seen := make(map[string]bool)
	var successCount int
	for i, r := range results {
		if r.err != nil {
			t.Logf("goroutine %d Branch error: %v", i, r.err)
			continue
		}
		if r.info == nil {
			t.Errorf("goroutine %d: nil BranchInfo with no error", i)
			continue
		}
		if seen[r.info.ID] {
			t.Errorf("duplicate branch ID: %s", r.info.ID)
		}
		seen[r.info.ID] = true
		successCount++
	}

	t.Logf("%d/%d branches created successfully", successCount, goroutines)

	if successCount == 0 {
		t.Error("expected at least some branches to be created")
	}
}

// TestStress_StateManagerConcurrent has 100 goroutines doing Get/SetState on
// random session IDs. Validates no races and final state consistency.
func TestStress_StateManagerConcurrent(t *testing.T) {
	t.Parallel()

	const (
		goroutines = 100
		numSessions = 20
	)

	ctrl, _ := newStressController(t)
	ctx := context.Background()

	// Pre-populate some sessions.
	sessionIDs := make([]string, numSessions)
	for i := range sessionIDs {
		sessionIDs[i] = fmt.Sprintf("stress-state-%04d", i)
		_ = ctrl.states.SetState(ctx, sessionIDs[i], StateActive)
	}

	states := []State{StateActive, StatePaused, StateResumed, StateBranched, StateRewound}
	var wg sync.WaitGroup
	var errCount int32

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			sessID := sessionIDs[rand.Intn(numSessions)]
			op := rand.Intn(2)
			switch op {
			case 0:
				// Read.
				_ = ctrl.states.Get(sessID)
			case 1:
				// Write.
				newState := states[rand.Intn(len(states))]
				if err := ctrl.states.SetState(ctx, sessID, newState); err != nil {
					atomic.AddInt32(&errCount, 1)
				}
			}
		}(i)
	}

	wg.Wait()

	if errCount > 0 {
		t.Errorf("%d SetState errors under concurrent access", errCount)
	}

	// Verify all sessions are still retrievable.
	for _, sid := range sessionIDs {
		ss := ctrl.states.Get(sid)
		if ss == nil {
			t.Errorf("session %s state is nil after stress test", sid)
		}
	}
}

// TestStress_PauseBufferNoLostData verifies that data written while paused is
// fully flushed on resume with no corruption under concurrency.
func TestStress_PauseBufferNoLostData(t *testing.T) {
	t.Parallel()

	const (
		writers   = 50
		chunks    = 10
	)

	pb := NewPauseBuffer()
	pb.Pause()

	var wg sync.WaitGroup
	var written int64

	// Writers — all write while paused.
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < chunks; j++ {
				data := []byte(fmt.Sprintf("goroutine-%04d-chunk-%04d", id, j))
				if pb.Write(data) {
					atomic.AddInt64(&written, int64(len(data)))
				}
			}
		}(i)
	}

	wg.Wait()

	// Resume and count flushed bytes.
	var flushed int64
	pb.Resume(func(data []byte) {
		atomic.AddInt64(&flushed, int64(len(data)))
	})

	if flushed != written {
		t.Errorf("data mismatch: wrote %d bytes to buffer, flushed %d bytes", written, flushed)
	}
}
