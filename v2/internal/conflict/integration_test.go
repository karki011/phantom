// Author: Subash Karki
//
// Integration tests for the full conflict detection pipeline.
// Run with: go test -race -v ./internal/conflict/...
package conflict

import (
	"sync"
	"testing"
	"time"
)

// TestConflictPipeline exercises the complete lifecycle:
// register sessions -> detect conflict -> handler fires -> unregister clears.
func TestConflictPipeline(t *testing.T) {
	t.Parallel()

	// Stub repo resolver: returns CWD as-is.
	tr := newTestTracker(WithRepoRootResolver(identity))

	var conflicts []Conflict
	var mu sync.Mutex
	tr.OnConflict(func(c Conflict) {
		mu.Lock()
		conflicts = append(conflicts, c)
		mu.Unlock()
	})

	// Register session A in /repo.
	sessA := makeSession("a", "composer", "/repo")
	tr.Register(sessA)

	mu.Lock()
	if len(conflicts) != 0 {
		t.Fatalf("expected no conflicts after first registration, got %d", len(conflicts))
	}
	mu.Unlock()

	// Register session B in /repo — should trigger repo conflict.
	sessB := makeSession("b", "terminal", "/repo")
	tr.Register(sessB)

	mu.Lock()
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict after second registration, got %d", len(conflicts))
	}
	if conflicts[0].Type != "repo" {
		t.Fatalf("expected repo conflict, got %q", conflicts[0].Type)
	}
	if conflicts[0].SessionA.ID != "b" || conflicts[0].SessionB.ID != "a" {
		t.Fatalf("conflict sessions mismatch: a=%s, b=%s", conflicts[0].SessionA.ID, conflicts[0].SessionB.ID)
	}
	mu.Unlock()

	// Verify GetConflicts returns the conflict for session A.
	activeConflicts := tr.GetConflicts("a")
	if len(activeConflicts) != 1 {
		t.Fatalf("GetConflicts(a): expected 1, got %d", len(activeConflicts))
	}

	// Verify ActiveSessionCount is 2.
	if got := tr.ActiveSessionCount("/repo"); got != 2 {
		t.Fatalf("ActiveSessionCount: expected 2, got %d", got)
	}

	// Unregister session B.
	tr.Unregister("b")

	// Verify GetConflicts is now empty.
	activeConflicts = tr.GetConflicts("a")
	if len(activeConflicts) != 0 {
		t.Fatalf("GetConflicts(a) after unregister: expected 0, got %d", len(activeConflicts))
	}

	// Verify ActiveSessionCount is 1.
	if got := tr.ActiveSessionCount("/repo"); got != 1 {
		t.Fatalf("ActiveSessionCount after unregister: expected 1, got %d", got)
	}
}

// TestFileConflictPipeline tests file-level conflict detection end-to-end.
func TestFileConflictPipeline(t *testing.T) {
	t.Parallel()

	tr := newTestTracker(WithRepoRootResolver(identity))

	var fileConflicts []Conflict
	var mu sync.Mutex
	tr.OnConflict(func(c Conflict) {
		mu.Lock()
		if c.Type == "file" {
			fileConflicts = append(fileConflicts, c)
		}
		mu.Unlock()
	})

	// Register two sessions in same repo.
	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))

	// Both sessions edit the same file.
	tr.RegisterFile("a", "/repo/auth.go")

	mu.Lock()
	if len(fileConflicts) != 0 {
		t.Fatalf("expected no file conflict with only one session editing, got %d", len(fileConflicts))
	}
	mu.Unlock()

	tr.RegisterFile("b", "/repo/auth.go")

	mu.Lock()
	if len(fileConflicts) != 1 {
		t.Fatalf("expected 1 file conflict, got %d", len(fileConflicts))
	}
	if fileConflicts[0].FilePath != "/repo/auth.go" {
		t.Fatalf("expected file path /repo/auth.go, got %q", fileConflicts[0].FilePath)
	}
	mu.Unlock()

	// Verify GetConflicts includes file conflict.
	conflicts := tr.GetConflicts("a")
	fileCount := 0
	for _, c := range conflicts {
		if c.Type == "file" {
			fileCount++
		}
	}
	if fileCount != 1 {
		t.Fatalf("GetConflicts(a): expected 1 file conflict, got %d", fileCount)
	}
}

// TestMultiSessionConflictPipeline tests conflict detection with 3+ sessions.
func TestMultiSessionConflictPipeline(t *testing.T) {
	t.Parallel()

	tr := newTestTracker(WithRepoRootResolver(identity))

	var conflictCount int
	var mu sync.Mutex
	tr.OnConflict(func(_ Conflict) {
		mu.Lock()
		conflictCount++
		mu.Unlock()
	})

	// Register 3 sessions in the same repo.
	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))  // conflict with a
	tr.Register(makeSession("c", "agent", "/repo"))      // conflict with a AND b

	mu.Lock()
	// Session b triggers 1 conflict (with a).
	// Session c triggers 2 conflicts (with a and b).
	// Total: 3 repo conflicts.
	if conflictCount != 3 {
		t.Fatalf("expected 3 total repo conflicts for 3 sessions, got %d", conflictCount)
	}
	mu.Unlock()

	// Unregister b — conflicts for a should drop to 1 (with c only).
	tr.Unregister("b")
	remaining := tr.GetConflicts("a")
	if len(remaining) != 1 {
		t.Fatalf("after removing b, expected 1 conflict for a, got %d", len(remaining))
	}
}

// TestConflictPipeline_StatsAccuracy verifies Stats reflects all operations.
func TestConflictPipeline_StatsAccuracy(t *testing.T) {
	t.Parallel()

	tr := newTestTracker(WithRepoRootResolver(identity))

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
	tr.RegisterFile("a", "/repo/main.go")
	tr.RegisterFile("b", "/repo/main.go")

	stats := tr.Stats()
	if stats.ActiveSessions != 2 {
		t.Fatalf("Stats.ActiveSessions: expected 2, got %d", stats.ActiveSessions)
	}
	if stats.TrackedFiles != 2 {
		t.Fatalf("Stats.TrackedFiles: expected 2, got %d", stats.TrackedFiles)
	}
	// 1 repo conflict + 1 file conflict = 2.
	if stats.TotalConflicts != 2 {
		t.Fatalf("Stats.TotalConflicts: expected 2, got %d", stats.TotalConflicts)
	}

	// Unregister all.
	tr.Unregister("a")
	tr.Unregister("b")

	stats = tr.Stats()
	if stats.ActiveSessions != 0 {
		t.Fatalf("Stats.ActiveSessions after cleanup: expected 0, got %d", stats.ActiveSessions)
	}
	if stats.TrackedFiles != 0 {
		t.Fatalf("Stats.TrackedFiles after cleanup: expected 0, got %d", stats.TrackedFiles)
	}
	// TotalConflicts is monotonic — still 2.
	if stats.TotalConflicts != 2 {
		t.Fatalf("Stats.TotalConflicts after cleanup: expected 2 (monotonic), got %d", stats.TotalConflicts)
	}
}

// TestConflictPipeline_TemporalOrdering verifies DetectedAt is reasonable.
func TestConflictPipeline_TemporalOrdering(t *testing.T) {
	t.Parallel()

	tr := newTestTracker(WithRepoRootResolver(identity))

	before := time.Now()
	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
	after := time.Now()

	conflicts := tr.GetConflicts("a")
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict, got %d", len(conflicts))
	}

	// GetConflicts creates a fresh Conflict with time.Now() — it should be recent.
	if conflicts[0].DetectedAt.Before(before) || conflicts[0].DetectedAt.After(after.Add(time.Second)) {
		t.Errorf("DetectedAt %v is outside expected range [%v, %v]",
			conflicts[0].DetectedAt, before, after.Add(time.Second))
	}
}
