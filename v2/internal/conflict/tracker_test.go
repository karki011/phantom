// Author: Subash Karki
//
// Run with: go test -race -v ./internal/conflict/...
package conflict

import (
	"log/slog"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// identity returns the CWD unchanged — simulates a non-git directory or a
// repo whose root equals the CWD.
func identity(cwd string) string { return cwd }

// constant returns a resolver that always resolves to the given root.
func constant(root string) RepoRootResolver {
	return func(_ string) string { return root }
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func newTestTracker(opts ...TrackerOption) *Tracker {
	return NewTracker(testLogger(), opts...)
}

func makeSession(id, source, cwd string) Session {
	return Session{
		ID:        id,
		SessionID: "db-" + id,
		Name:      "test-" + id,
		Source:    source,
		RepoCWD:   cwd,
		StartedAt: time.Now(),
	}
}

// ---------------------------------------------------------------------------
// Register + Repo Conflict
// ---------------------------------------------------------------------------

func TestTracker_RegisterAndDetectRepoConflict(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	var detected []Conflict
	tr.OnConflict(func(c Conflict) {
		detected = append(detected, c)
	})

	tr.Register(makeSession("a", "composer", "/repo/project"))
	if len(detected) != 0 {
		t.Fatal("expected no conflict after first registration")
	}

	tr.Register(makeSession("b", "terminal", "/repo/project"))
	if len(detected) != 1 {
		t.Fatalf("expected 1 conflict, got %d", len(detected))
	}
	if detected[0].Type != "repo" {
		t.Fatalf("expected repo conflict, got %q", detected[0].Type)
	}
	if detected[0].SessionA.ID != "b" || detected[0].SessionB.ID != "a" {
		t.Fatalf("unexpected conflict sessions: a=%s, b=%s", detected[0].SessionA.ID, detected[0].SessionB.ID)
	}
}

func TestTracker_NoCWDOverlap(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	var detected int
	tr.OnConflict(func(_ Conflict) { detected++ })

	tr.Register(makeSession("a", "composer", "/repo/alpha"))
	tr.Register(makeSession("b", "composer", "/repo/beta"))
	if detected != 0 {
		t.Fatalf("expected no conflicts for different repos, got %d", detected)
	}
}

func TestTracker_SubdirectoryMatch(t *testing.T) {
	t.Parallel()

	// Simulate git rev-parse resolving both paths to the same root.
	tr := newTestTracker(WithRepoRootResolver(constant("/repo")))

	var detected int
	tr.OnConflict(func(_ Conflict) { detected++ })

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo/src/pkg"))
	if detected != 1 {
		t.Fatalf("expected 1 conflict for subdirectory match, got %d", detected)
	}
}

func TestTracker_UnregisterClearsConflict(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))

	conflicts := tr.GetConflicts("a")
	if len(conflicts) != 1 {
		t.Fatalf("expected 1 conflict before unregister, got %d", len(conflicts))
	}

	tr.Unregister("b")
	conflicts = tr.GetConflicts("a")
	if len(conflicts) != 0 {
		t.Fatalf("expected 0 conflicts after unregister, got %d", len(conflicts))
	}
}

// ---------------------------------------------------------------------------
// File Conflicts
// ---------------------------------------------------------------------------

func TestTracker_FileConflict(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	var detected []Conflict
	tr.OnConflict(func(c Conflict) {
		detected = append(detected, c)
	})

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))

	// Clear repo-level conflict from handler slice for counting.
	detected = nil

	tr.RegisterFile("a", "/repo/main.go")
	if len(detected) != 0 {
		t.Fatal("expected no file conflict with only one editor")
	}

	tr.RegisterFile("b", "/repo/main.go")
	if len(detected) != 1 {
		t.Fatalf("expected 1 file conflict, got %d", len(detected))
	}
	if detected[0].Type != "file" {
		t.Fatalf("expected file conflict, got %q", detected[0].Type)
	}
	if detected[0].FilePath != "/repo/main.go" {
		t.Fatalf("expected file path /repo/main.go, got %q", detected[0].FilePath)
	}
}

func TestTracker_FileConflictDifferentRepos(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	var detected int
	tr.OnConflict(func(c Conflict) {
		if c.Type == "file" {
			detected++
		}
	})

	tr.Register(makeSession("a", "composer", "/repo-alpha"))
	tr.Register(makeSession("b", "composer", "/repo-beta"))

	// Same filename, different repos — no file conflict.
	tr.RegisterFile("a", "/repo-alpha/main.go")
	tr.RegisterFile("b", "/repo-beta/main.go")
	if detected != 0 {
		t.Fatalf("expected no file conflict for different repos, got %d", detected)
	}
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

func TestTracker_HandlerCalled(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	called := false
	tr.OnConflict(func(_ Conflict) { called = true })

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
	if !called {
		t.Fatal("expected handler to be called")
	}
}

func TestTracker_MultipleHandlers(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	var count int
	tr.OnConflict(func(_ Conflict) { count++ })
	tr.OnConflict(func(_ Conflict) { count++ })
	tr.OnConflict(func(_ Conflict) { count++ })

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
	if count != 3 {
		t.Fatalf("expected all 3 handlers called, got %d", count)
	}
}

// ---------------------------------------------------------------------------
// Query methods
// ---------------------------------------------------------------------------

func TestTracker_GetActiveSessions(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
	tr.Register(makeSession("c", "agent", "/other-repo"))

	sessions := tr.GetActiveSessions("/repo")
	if len(sessions) != 2 {
		t.Fatalf("expected 2 active sessions for /repo, got %d", len(sessions))
	}

	ids := map[string]bool{}
	for _, s := range sessions {
		ids[s.ID] = true
	}
	if !ids["a"] || !ids["b"] {
		t.Fatalf("expected sessions a and b, got %v", ids)
	}
}

func TestTracker_IsRepoActive(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	if tr.IsRepoActive("/repo") {
		t.Fatal("expected repo to be inactive when no sessions")
	}

	tr.Register(makeSession("a", "composer", "/repo"))
	if !tr.IsRepoActive("/repo") {
		t.Fatal("expected repo to be active after registration")
	}

	tr.Unregister("a")
	if tr.IsRepoActive("/repo") {
		t.Fatal("expected repo to be inactive after unregister")
	}
}

func TestTracker_ActiveSessionCount(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	if got := tr.ActiveSessionCount("/repo"); got != 0 {
		t.Fatalf("expected 0, got %d", got)
	}

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
	if got := tr.ActiveSessionCount("/repo"); got != 2 {
		t.Fatalf("expected 2, got %d", got)
	}

	tr.Unregister("a")
	if got := tr.ActiveSessionCount("/repo"); got != 1 {
		t.Fatalf("expected 1, got %d", got)
	}
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

func TestTracker_Stats(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
	tr.RegisterFile("a", "/repo/main.go")
	tr.RegisterFile("a", "/repo/util.go")
	tr.RegisterFile("b", "/repo/main.go") // triggers file conflict

	stats := tr.Stats()
	if stats.ActiveSessions != 2 {
		t.Fatalf("expected 2 active sessions, got %d", stats.ActiveSessions)
	}
	if stats.TrackedFiles != 3 {
		t.Fatalf("expected 3 tracked files (2 from a, 1 from b), got %d", stats.TrackedFiles)
	}
	// 1 repo conflict (a↔b on register) + 1 file conflict (main.go).
	if stats.TotalConflicts != 2 {
		t.Fatalf("expected 2 total conflicts, got %d", stats.TotalConflicts)
	}
}

// ---------------------------------------------------------------------------
// UnregisterFiles
// ---------------------------------------------------------------------------

func TestTracker_UnregisterFiles(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.RegisterFile("a", "/repo/main.go")
	tr.RegisterFile("a", "/repo/util.go")

	stats := tr.Stats()
	if stats.TrackedFiles != 2 {
		t.Fatalf("expected 2 tracked files, got %d", stats.TrackedFiles)
	}

	tr.UnregisterFiles("a")
	stats = tr.Stats()
	if stats.TrackedFiles != 0 {
		t.Fatalf("expected 0 tracked files after UnregisterFiles, got %d", stats.TrackedFiles)
	}

	// Session itself should still be registered.
	if stats.ActiveSessions != 1 {
		t.Fatalf("expected session to remain after UnregisterFiles, got %d", stats.ActiveSessions)
	}
}

// ---------------------------------------------------------------------------
// Nil logger
// ---------------------------------------------------------------------------

func TestTracker_NilLogger(t *testing.T) {
	t.Parallel()

	// Should not panic with nil logger.
	tr := NewTracker(nil, WithRepoRootResolver(identity))
	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
}

// ---------------------------------------------------------------------------
// Concurrent Access
// ---------------------------------------------------------------------------

func TestTracker_ConcurrentAccess(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	var conflictCount atomic.Int64
	tr.OnConflict(func(_ Conflict) {
		conflictCount.Add(1)
	})

	const goroutines = 50
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()

			id := "session-" + string(rune('A'+idx%26)) + string(rune('0'+idx/26))
			// Half go to /repo-a, half to /repo-b.
			cwd := "/repo-a"
			if idx%2 == 1 {
				cwd = "/repo-b"
			}

			tr.Register(makeSession(id, "agent", cwd))
			tr.RegisterFile(id, cwd+"/shared.go")
			_ = tr.GetConflicts(id)
			_ = tr.GetActiveSessions(cwd)
			_ = tr.IsRepoActive(cwd)
			_ = tr.ActiveSessionCount(cwd)
			_ = tr.Stats()
			tr.UnregisterFiles(id)
			tr.Unregister(id)
		}(i)
	}

	wg.Wait()

	// After all goroutines complete, everything should be cleaned up.
	stats := tr.Stats()
	if stats.ActiveSessions != 0 {
		t.Fatalf("expected 0 active sessions after cleanup, got %d", stats.ActiveSessions)
	}
	if stats.TrackedFiles != 0 {
		t.Fatalf("expected 0 tracked files after cleanup, got %d", stats.TrackedFiles)
	}
}

// ---------------------------------------------------------------------------
// RegisterFile for unregistered session (no-op)
// ---------------------------------------------------------------------------

func TestTracker_RegisterFileUnknownSession(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	var detected int
	tr.OnConflict(func(_ Conflict) { detected++ })

	// Should be a no-op — session "ghost" was never registered.
	tr.RegisterFile("ghost", "/repo/main.go")
	if detected != 0 {
		t.Fatal("expected no conflicts for unregistered session")
	}
	if tr.Stats().TrackedFiles != 0 {
		t.Fatal("expected no tracked files for unregistered session")
	}
}

// ---------------------------------------------------------------------------
// Repo root caching
// ---------------------------------------------------------------------------

func TestTracker_RepoRootCaching(t *testing.T) {
	t.Parallel()

	var callCount atomic.Int32
	tr := newTestTracker(WithRepoRootResolver(func(cwd string) string {
		callCount.Add(1)
		return "/resolved-root"
	}))

	// First registration resolves.
	tr.Register(makeSession("a", "composer", "/some/path"))
	// Second registration of same CWD should hit cache.
	tr.Register(makeSession("b", "terminal", "/some/path"))

	if got := callCount.Load(); got != 1 {
		t.Fatalf("expected resolver called once (cached), got %d", got)
	}
}

// ---------------------------------------------------------------------------
// GetConflicts returns both repo and file conflicts
// ---------------------------------------------------------------------------

func TestTracker_GetConflictsIncludesFileConflicts(t *testing.T) {
	t.Parallel()
	tr := newTestTracker(WithRepoRootResolver(identity))

	tr.Register(makeSession("a", "composer", "/repo"))
	tr.Register(makeSession("b", "terminal", "/repo"))
	tr.RegisterFile("a", "/repo/main.go")
	tr.RegisterFile("b", "/repo/main.go")

	conflicts := tr.GetConflicts("a")

	repoConflicts := 0
	fileConflicts := 0
	for _, c := range conflicts {
		switch c.Type {
		case "repo":
			repoConflicts++
		case "file":
			fileConflicts++
		}
	}

	if repoConflicts != 1 {
		t.Fatalf("expected 1 repo conflict, got %d", repoConflicts)
	}
	if fileConflicts != 1 {
		t.Fatalf("expected 1 file conflict, got %d", fileConflicts)
	}
}
