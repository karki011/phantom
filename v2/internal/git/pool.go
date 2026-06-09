// Package git provides a goroutine pool for parallel git operations.
//
// Author: Subash Karki
package git

import (
	"context"
	"sync"
)

const defaultWorkers = 8

// maxConcurrentGitProcs bounds the PEAK number of git subprocesses spawned
// across ALL pools/repos at once. Each fresh Pool defaults to 8 workers, so N
// concurrent project fetch/status calls would otherwise fan out to 8×N
// processes (~20MB each → 2.4GB+ OOM spike with 5+ projects on startup). This
// package-global semaphore caps real-world surge regardless of pool count while
// staying well above per-call test concurrency so RunAll never deadlocks.
const maxConcurrentGitProcs = 16

var gitProcSem = make(chan struct{}, maxConcurrentGitProcs)

// acquireGitProc blocks until a git-subprocess slot is free or ctx is
// cancelled. ok=false means cancellation — the caller must NOT release.
func acquireGitProc(ctx context.Context) (ok bool) {
	select {
	case gitProcSem <- struct{}{}:
		return true
	case <-ctx.Done():
		return false
	}
}

// releaseGitProc frees one git-subprocess slot. Always pair with a successful
// acquireGitProc, ideally via defer so a panic cannot leak the slot.
func releaseGitProc() { <-gitProcSem }

// runGitProc runs fn while holding an already-acquired git-subprocess slot and
// releases it on return — including when fn panics — so the slot never leaks.
func runGitProc(ctx context.Context, repoPath string, fn func(ctx context.Context, repoPath string) (interface{}, error)) (interface{}, error) {
	defer releaseGitProc()
	return fn(ctx, repoPath)
}

// PoolResult holds the outcome of a single repo operation.
type PoolResult struct {
	RepoPath string
	Data     interface{}
	Err      error
}

// Pool runs git operations in parallel across multiple repositories.
type Pool struct {
	workers int
	mu      sync.Mutex
}

// NewPool creates a pool with the given worker count.
// If workers <= 0, it defaults to 8.
func NewPool(workers int) *Pool {
	if workers <= 0 {
		workers = defaultWorkers
	}
	return &Pool{workers: workers}
}

// RunAll executes fn across all repoPaths using the pool's worker goroutines.
// Results are returned in an unordered slice. Context cancellation stops new work.
func (p *Pool) RunAll(ctx context.Context, repoPaths []string, fn func(ctx context.Context, repoPath string) (interface{}, error)) []PoolResult {
	if len(repoPaths) == 0 {
		return nil
	}

	jobs := make(chan string, len(repoPaths))
	results := make(chan PoolResult, len(repoPaths))

	for _, rp := range repoPaths {
		jobs <- rp
	}
	close(jobs)

	workers := p.workers
	if workers > len(repoPaths) {
		workers = len(repoPaths)
	}

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for repoPath := range jobs {
				select {
				case <-ctx.Done():
					results <- PoolResult{RepoPath: repoPath, Err: ctx.Err()}
					// Drain remaining jobs so the jobs channel is not leaked.
					for rp := range jobs {
						results <- PoolResult{RepoPath: rp, Err: ctx.Err()}
					}
					return
				default:
				}
				// Bound peak concurrent git subprocesses across all pools/repos.
				// Respect cancellation while waiting for a slot so a cancelled
				// run drains promptly instead of blocking on a saturated sem.
				select {
				case gitProcSem <- struct{}{}:
				case <-ctx.Done():
					results <- PoolResult{RepoPath: repoPath, Err: ctx.Err()}
					for rp := range jobs {
						results <- PoolResult{RepoPath: rp, Err: ctx.Err()}
					}
					return
				}
				// Release the slot via a func wrapper so a panic in fn() cannot
				// leak it permanently. The named result lets us still publish.
				data, err := runGitProc(ctx, repoPath, fn)
				results <- PoolResult{RepoPath: repoPath, Data: data, Err: err}
			}
		}()
	}

	// Close results once all workers are done.
	go func() {
		wg.Wait()
		close(results)
	}()

	out := make([]PoolResult, 0, len(repoPaths))
	for r := range results {
		out = append(out, r)
	}
	return out
}

// FetchAll fetches origin for multiple repos in parallel and emits progress via callback.
// onProgress is called after each repo completes (may be nil).
func (p *Pool) FetchAll(ctx context.Context, repoPaths []string, onProgress func(done, total int, repoPath string)) []PoolResult {
	total := len(repoPaths)
	var doneCount int

	p.mu.Lock()
	// Reset counter for this run — use a local atomic via closure.
	p.mu.Unlock()

	var progressMu sync.Mutex
	localDone := 0

	results := p.RunAll(ctx, repoPaths, func(ctx context.Context, repoPath string) (interface{}, error) {
		err := FetchOrigin(ctx, repoPath)
		if onProgress != nil {
			progressMu.Lock()
			localDone++
			d := localDone
			progressMu.Unlock()
			onProgress(d, total, repoPath)
		}
		return nil, err
	})

	_ = doneCount // suppress unused
	return results
}

// StatusAll gets the working-tree status for multiple repos in parallel.
// Each PoolResult.Data is a *RepoStatus.
func (p *Pool) StatusAll(ctx context.Context, repoPaths []string) []PoolResult {
	return p.RunAll(ctx, repoPaths, func(ctx context.Context, repoPath string) (interface{}, error) {
		return GetRepoStatus(ctx, repoPath)
	})
}
