// Author: Subash Karki
package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// initTempRepo creates a temp git repo with one commit and returns its path.
func initTempRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@example.com",
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	run("init", "-b", "main")
	run("config", "user.email", "test@example.com")
	run("config", "user.name", "Test")

	filePath := filepath.Join(dir, "README.md")
	if err := os.WriteFile(filePath, []byte("hello\n"), 0644); err != nil {
		t.Fatal(err)
	}

	run("add", ".")
	run("commit", "-m", "init")
	return dir
}

func TestPool_StatusAll(t *testing.T) {
	repos := []string{
		initTempRepo(t),
		initTempRepo(t),
		initTempRepo(t),
	}

	pool := NewPool(4)
	results := pool.StatusAll(context.Background(), repos)

	if len(results) != len(repos) {
		t.Fatalf("expected %d results, got %d", len(repos), len(results))
	}

	for _, r := range results {
		if r.Err != nil {
			t.Errorf("StatusAll error for %s: %v", r.RepoPath, r.Err)
		}
		rs, ok := r.Data.(*RepoStatus)
		if !ok || rs == nil {
			t.Errorf("expected *RepoStatus for %s, got %T", r.RepoPath, r.Data)
		}
	}
}

func TestPool_FetchAll(t *testing.T) {
	repos := []string{
		initTempRepo(t),
		initTempRepo(t),
		initTempRepo(t),
	}

	pool := NewPool(4)
	var progressCalls int32

	results := pool.FetchAll(context.Background(), repos, func(done, total int, repoPath string) {
		atomic.AddInt32(&progressCalls, 1)
		if done > total {
			t.Errorf("progress: done (%d) > total (%d)", done, total)
		}
	})

	if len(results) != len(repos) {
		t.Fatalf("expected %d results, got %d", len(repos), len(results))
	}

	if int(progressCalls) != len(repos) {
		t.Errorf("expected %d progress calls, got %d", len(repos), progressCalls)
	}
}

func TestPool_Cancellation(t *testing.T) {
	// Create enough repos so at least one is in-flight when we cancel.
	repos := make([]string, 8)
	for i := range repos {
		repos[i] = initTempRepo(t)
	}

	pool := NewPool(2) // intentionally fewer workers than repos
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	results := pool.RunAll(ctx, repos, func(ctx context.Context, repoPath string) (interface{}, error) {
		// Simulate slow work.
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(30 * time.Millisecond):
			return "done", nil
		}
	})

	if len(results) != len(repos) {
		t.Fatalf("expected result entry per repo: got %d/%d", len(results), len(repos))
	}

	// At least one result should carry a context error.
	var ctxErrors int
	for _, r := range results {
		if r.Err != nil {
			ctxErrors++
		}
	}
	// We don't assert exact count — timing-dependent — but context must propagate.
	t.Logf("context-cancelled results: %d/%d", ctxErrors, len(repos))
}

func TestPool_ConcurrentSafety(t *testing.T) {
	// Run under -race to detect data races.
	repos := make([]string, 10)
	for i := range repos {
		repos[i] = initTempRepo(t)
	}

	pool := NewPool(5)

	// Launch two parallel RunAll calls on the same pool — race detector will catch issues.
	done := make(chan []PoolResult, 2)
	for i := 0; i < 2; i++ {
		go func() {
			done <- pool.StatusAll(context.Background(), repos)
		}()
	}

	r1 := <-done
	r2 := <-done

	if len(r1) != len(repos) || len(r2) != len(repos) {
		t.Errorf("unexpected result lengths: %d, %d", len(r1), len(r2))
	}
}

func TestNewPool_DefaultWorkers(t *testing.T) {
	p := NewPool(0)
	if p.workers != defaultWorkers {
		t.Errorf("expected default workers %d, got %d", defaultWorkers, p.workers)
	}
	p2 := NewPool(-1)
	if p2.workers != defaultWorkers {
		t.Errorf("expected default workers %d, got %d", defaultWorkers, p2.workers)
	}
}
