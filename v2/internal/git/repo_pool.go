// Package git provides a process-wide cache of opened go-git repositories.
//
// Opening a repository with go-git involves reading config, refs, and pack
// indexes from disk. Caching the *gogit.Repository handle lets hot read paths
// (log, branch listing, ahead/behind) skip that work and avoid spawning a git
// subprocess entirely.
//
// Write operations still go through the CLI. Callers MUST call Invalidate
// after any successful write that mutates refs (commit, push, pull, fetch,
// branch create/delete/rename) so subsequent reads see fresh state.
//
// Author: Subash Karki
package git

import (
	"fmt"
	"sync"

	gogit "github.com/go-git/go-git/v5"
)

// RepoPool caches opened go-git repositories keyed by absolute path.
//
// The zero value is not usable; use the package-level DefaultRepoPool() or
// construct via &RepoPool{repos: map[string]*gogit.Repository{}}.
type RepoPool struct {
	mu    sync.RWMutex
	repos map[string]*gogit.Repository
}

// defaultPool is the process-wide singleton used by the fast read wrappers.
var defaultPool = &RepoPool{repos: map[string]*gogit.Repository{}}

// DefaultRepoPool returns the process-wide singleton repo pool.
func DefaultRepoPool() *RepoPool {
	return defaultPool
}

// Get returns a cached *gogit.Repository for path, opening it on miss.
//
// Worktrees with a symlinked .git file are supported via DetectDotGit.
func (p *RepoPool) Get(path string) (*gogit.Repository, error) {
	if path == "" {
		return nil, fmt.Errorf("repo pool: empty path")
	}

	p.mu.RLock()
	if repo, ok := p.repos[path]; ok {
		p.mu.RUnlock()
		return repo, nil
	}
	p.mu.RUnlock()

	p.mu.Lock()
	defer p.mu.Unlock()

	// Double-check after acquiring the write lock.
	if repo, ok := p.repos[path]; ok {
		return repo, nil
	}

	// PlainOpen handles a normal .git directory. For linked worktrees the
	// .git entry is a file pointing to the real gitdir; DetectDotGit walks
	// the path upward and resolves that case.
	repo, err := gogit.PlainOpenWithOptions(path, &gogit.PlainOpenOptions{
		DetectDotGit: true,
	})
	if err != nil {
		return nil, fmt.Errorf("repo pool: open %s: %w", path, err)
	}

	p.repos[path] = repo
	return repo, nil
}

// Invalidate drops the cached repository for path. Safe to call when the
// path is not cached.
func (p *RepoPool) Invalidate(path string) {
	if path == "" {
		return
	}
	p.mu.Lock()
	delete(p.repos, path)
	p.mu.Unlock()
}

// InvalidateAll clears every cached repository. Use sparingly — intended
// for explicit full-reset scenarios.
func (p *RepoPool) InvalidateAll() {
	p.mu.Lock()
	p.repos = map[string]*gogit.Repository{}
	p.mu.Unlock()
}
