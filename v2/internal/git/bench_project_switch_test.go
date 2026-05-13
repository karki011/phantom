// Author: Subash Karki
//go:build perf

package git

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Simulates the cold-cache project-switch path: WarmCache.Warm() returns
// instantly (stale empty) and kicks off concurrent refreshes via the
// priority pool. Measures end-to-end perceived latency.
func BenchmarkProjectSwitchWarmThenFresh(b *testing.B) {
	root := repoRoot(b)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool := NewPriorityPool(ctx, 8)
	defer pool.Stop()
	cache := NewWarmCache(pool)

	var statusCount, branchCount, logCount atomic.Int64
	var doneStatus, doneBranch, doneLog sync.WaitGroup

	cache.SetCallbacks(
		func(string, *RepoStatus) { statusCount.Add(1); doneStatus.Done() },
		func(string, []BranchInfo) { branchCount.Add(1); doneBranch.Done() },
		func(string, []CommitInfo) { logCount.Add(1); doneLog.Done() },
	)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cache.Invalidate(root)
		doneStatus.Add(1)
		doneBranch.Add(1)
		doneLog.Add(1)
		_ = cache.Warm(ctx, root)
		doneStatus.Wait()
		doneBranch.Wait()
		doneLog.Wait()
	}
}

// Measures only the immediate (stale-while-revalidate) return time —
// what the UI perceives on a project switch.
func BenchmarkProjectSwitchInstantPath(b *testing.B) {
	root := repoRoot(b)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool := NewPriorityPool(ctx, 8)
	defer pool.Stop()
	cache := NewWarmCache(pool)
	// Prime cache once so subsequent warms return fresh data without refresh
	_ = cache.Warm(ctx, root)
	time.Sleep(200 * time.Millisecond) // let refresh complete

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = cache.Warm(ctx, root)
	}
}

// 30 repos, all warmed in sequence, measures fan-out under realistic
// multi-project load.
func BenchmarkProjectSwitchManyRepos(b *testing.B) {
	root := repoRoot(b)
	repos := make([]string, 30)
	repos[0] = root
	for i := 1; i < 30; i++ {
		// Use git worktree dirs if they exist, otherwise just use parent dirs
		// as proxies — go-git PlainOpen will fail gracefully and CLI fallback
		// covers it; this still exercises the priority pool fan-out.
		repos[i] = filepath.Dir(root)
		if _, err := os.Stat(filepath.Join(repos[i], ".git")); err != nil {
			repos[i] = root
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool := NewPriorityPool(ctx, 8)
	defer pool.Stop()
	cache := NewWarmCache(pool)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, r := range repos {
			_ = cache.Warm(ctx, r)
		}
	}
}

func BenchmarkPriorityPoolThroughput(b *testing.B) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool := NewPriorityPool(ctx, 8)
	defer pool.Stop()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var wg sync.WaitGroup
		wg.Add(64)
		for j := 0; j < 64; j++ {
			pool.SubmitHigh(func() {
				wg.Done()
			})
		}
		wg.Wait()
	}
}
