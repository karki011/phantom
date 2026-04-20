// stress_test.go — high-concurrency tests for the git package.
// Run with: go test -race -count=1 -timeout=120s ./internal/git/...
// Author: Subash Karki

package git

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const gitLeakTolerance = 10

// TestStress_PoolConcurrency runs FetchAll, StatusAll, and RunAll concurrently
// from 5 goroutines across 20 temp repos. Validates no races and complete results.
func TestStress_PoolConcurrency(t *testing.T) {
	t.Parallel()

	const (
		numRepos    = 20
		parallelFns = 5
	)

	repos := make([]string, numRepos)
	for i := range repos {
		repos[i] = initTempRepo(t)
	}

	pool := NewPool(8)
	baseline := runtime.NumGoroutine()

	var wg sync.WaitGroup
	for i := 0; i < parallelFns; i++ {
		wg.Add(3)

		// FetchAll — no remote, always succeeds instantly
		go func() {
			defer wg.Done()
			results := pool.FetchAll(context.Background(), repos, nil)
			if len(results) != numRepos {
				t.Errorf("FetchAll: expected %d results, got %d", numRepos, len(results))
			}
		}()

		// StatusAll
		go func() {
			defer wg.Done()
			results := pool.StatusAll(context.Background(), repos)
			if len(results) != numRepos {
				t.Errorf("StatusAll: expected %d results, got %d", numRepos, len(results))
			}
			for _, r := range results {
				if r.Err != nil {
					t.Errorf("StatusAll error for %s: %v", r.RepoPath, r.Err)
				}
			}
		}()

		// RunAll with custom fn
		go func() {
			defer wg.Done()
			results := pool.RunAll(context.Background(), repos, func(ctx context.Context, repoPath string) (interface{}, error) {
				return GetCurrentBranch(ctx, repoPath), nil
			})
			if len(results) != numRepos {
				t.Errorf("RunAll: expected %d results, got %d", numRepos, len(results))
			}
		}()
	}

	wg.Wait()

	time.Sleep(100 * time.Millisecond)
	after := runtime.NumGoroutine()
	if after > baseline+gitLeakTolerance {
		t.Errorf("goroutine leak: baseline=%d after=%d tolerance=%d", baseline, after, gitLeakTolerance)
	}
}

// TestStress_PoolCancelMidFlight cancels a context mid-flight on 50 repos with
// a slow fn (100ms each). Validates the pool returns within 500ms total.
func TestStress_PoolCancelMidFlight(t *testing.T) {
	t.Parallel()

	const numRepos = 50

	repos := make([]string, numRepos)
	for i := range repos {
		repos[i] = initTempRepo(t)
	}

	pool := NewPool(8)
	ctx, cancel := context.WithCancel(context.Background())

	// Cancel after 200ms.
	go func() {
		time.Sleep(200 * time.Millisecond)
		cancel()
	}()

	start := time.Now()
	results := pool.RunAll(ctx, repos, func(ctx context.Context, repoPath string) (interface{}, error) {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(100 * time.Millisecond):
			return "done", nil
		}
	})
	elapsed := time.Since(start)

	if elapsed > 500*time.Millisecond {
		t.Errorf("RunAll took %v, expected <500ms after cancellation", elapsed)
	}
	if len(results) != numRepos {
		t.Errorf("expected %d results, got %d", numRepos, len(results))
	}

	// At least some results should carry ctx.Err().
	var ctxErrCount int32
	for _, r := range results {
		if r.Err != nil {
			atomic.AddInt32(&ctxErrCount, 1)
		}
	}
	if ctxErrCount == 0 {
		t.Error("expected at least one result with ctx.Err(), got none")
	}
}

// TestStress_ConcurrentDiffAndStatus calls GetRepoStatus and ListBranches on
// the same repo from 10 goroutines simultaneously.
func TestStress_ConcurrentDiffAndStatus(t *testing.T) {
	t.Parallel()

	const goroutines = 10

	repo := initTempRepo(t)
	ctx := context.Background()

	var wg sync.WaitGroup
	var errCount int32

	for i := 0; i < goroutines; i++ {
		wg.Add(2)

		go func() {
			defer wg.Done()
			rs, err := GetRepoStatus(ctx, repo)
			if err != nil {
				atomic.AddInt32(&errCount, 1)
				return
			}
			if rs == nil {
				atomic.AddInt32(&errCount, 1)
			}
		}()

		go func() {
			defer wg.Done()
			branches, err := ListBranches(ctx, repo)
			if err != nil {
				atomic.AddInt32(&errCount, 1)
				return
			}
			if len(branches) == 0 {
				// Fresh repo always has at least one branch.
				atomic.AddInt32(&errCount, 1)
			}
		}()
	}

	wg.Wait()

	if errCount > 0 {
		t.Errorf("%d errors occurred during concurrent GetRepoStatus / ListBranches", errCount)
	}
}

// TestStress_ConcurrentBranchList calls ListBranches from 20 goroutines on the
// same repo and verifies all return the same branch name set.
func TestStress_ConcurrentBranchList(t *testing.T) {
	t.Parallel()

	const goroutines = 20

	repo := initTempRepo(t)
	ctx := context.Background()

	// Baseline result.
	want, err := ListBranches(ctx, repo)
	if err != nil {
		t.Fatalf("baseline ListBranches: %v", err)
	}

	var wg sync.WaitGroup
	results := make([][]BranchInfo, goroutines)

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			br, err := ListBranches(ctx, repo)
			if err != nil {
				t.Errorf("goroutine %d ListBranches: %v", idx, err)
				return
			}
			results[idx] = br
		}(i)
	}

	wg.Wait()

	for i, got := range results {
		if got == nil {
			continue // error already reported
		}
		if len(got) != len(want) {
			t.Errorf("goroutine %d: expected %d branches, got %d", i, len(want), len(got))
		} else {
			wantName := want[0].Name
			gotName := got[0].Name
			if wantName != gotName {
				t.Errorf("goroutine %d: branch name mismatch: want %s got %s", i, wantName, gotName)
			}
		}
	}
}

// TestStress_PoolHighWorkerCount verifies correctness when worker count exceeds
// repo count (pool clamps workers to len(repos)).
func TestStress_PoolHighWorkerCount(t *testing.T) {
	t.Parallel()

	repos := make([]string, 5)
	for i := range repos {
		repos[i] = initTempRepo(t)
	}

	pool := NewPool(200) // far more workers than repos
	var count int32
	results := pool.RunAll(context.Background(), repos, func(ctx context.Context, repoPath string) (interface{}, error) {
		atomic.AddInt32(&count, 1)
		return fmt.Sprintf("ok:%s", repoPath), nil
	})

	if len(results) != len(repos) {
		t.Errorf("expected %d results, got %d", len(repos), len(results))
	}
	if int(count) != len(repos) {
		t.Errorf("fn called %d times, expected %d", count, len(repos))
	}
}
