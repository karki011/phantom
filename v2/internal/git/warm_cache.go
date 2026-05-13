// Author: Subash Karki
package git

import (
	"context"
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

// WarmCache returns cached snapshots of status/branch/log if available and
// kicks off concurrent refreshes in the background. The caller returns to the
// UI immediately; fresh data follows via the regular SSE/event channels.
type WarmCache struct {
	mu       sync.RWMutex
	entries  map[string]*warmEntry
	pool     *PriorityPool
	onStatus func(repoPath string, status *RepoStatus)
	onBranch func(repoPath string, branches []BranchInfo)
	onLog    func(repoPath string, commits []CommitInfo)
}

type warmEntry struct {
	mu       sync.RWMutex
	status   *RepoStatus
	branches []BranchInfo
	commits  []CommitInfo
	updated  time.Time
	inflight map[string]bool
}

// WarmSnapshot is the stale-while-revalidate payload returned to callers.
type WarmSnapshot struct {
	Status     *RepoStatus  `json:"status"`
	Branches   []BranchInfo `json:"branches"`
	Commits    []CommitInfo `json:"commits"`
	UpdatedAt  time.Time    `json:"updatedAt"`
	Stale      bool         `json:"stale"`
	RepoPath   string       `json:"repoPath"`
}

// NewWarmCache wires the cache to a priority pool. Refresh callbacks fire
// once each background fetch completes so the App layer can broadcast SSE.
func NewWarmCache(pool *PriorityPool) *WarmCache {
	return &WarmCache{
		entries: make(map[string]*warmEntry),
		pool:    pool,
	}
}

// SetCallbacks wires per-key refresh notifications. May be called once at boot.
func (c *WarmCache) SetCallbacks(
	onStatus func(repoPath string, status *RepoStatus),
	onBranch func(repoPath string, branches []BranchInfo),
	onLog func(repoPath string, commits []CommitInfo),
) {
	c.mu.Lock()
	c.onStatus = onStatus
	c.onBranch = onBranch
	c.onLog = onLog
	c.mu.Unlock()
}

// Warm returns the current snapshot (possibly stale or empty) and triggers
// background refreshes for status, branches, and log.
func (c *WarmCache) Warm(ctx context.Context, repoPath string) WarmSnapshot {
	if repoPath == "" {
		return WarmSnapshot{}
	}
	e := c.entry(repoPath)

	e.mu.RLock()
	snap := WarmSnapshot{
		Status:    e.status,
		Branches:  append([]BranchInfo(nil), e.branches...),
		Commits:   append([]CommitInfo(nil), e.commits...),
		UpdatedAt: e.updated,
		Stale:     e.status == nil || time.Since(e.updated) > 2*time.Second,
		RepoPath:  repoPath,
	}
	e.mu.RUnlock()

	c.refreshStatus(ctx, repoPath, e)
	c.refreshBranches(ctx, repoPath, e)
	c.refreshLog(ctx, repoPath, e)

	return snap
}

// Invalidate drops the cached snapshot for a repo (e.g., on removal).
func (c *WarmCache) Invalidate(repoPath string) {
	c.mu.Lock()
	delete(c.entries, canonicalize(repoPath))
	c.mu.Unlock()
}

func (c *WarmCache) entry(repoPath string) *warmEntry {
	key := canonicalize(repoPath)
	c.mu.RLock()
	e := c.entries[key]
	c.mu.RUnlock()
	if e != nil {
		return e
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if e = c.entries[key]; e != nil {
		return e
	}
	e = &warmEntry{inflight: make(map[string]bool)}
	c.entries[key] = e
	return e
}

func (c *WarmCache) markInflight(e *warmEntry, key string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.inflight[key] {
		return false
	}
	e.inflight[key] = true
	return true
}

func (c *WarmCache) clearInflight(e *warmEntry, key string) {
	e.mu.Lock()
	delete(e.inflight, key)
	e.mu.Unlock()
}

func (c *WarmCache) refreshStatus(ctx context.Context, repoPath string, e *warmEntry) {
	if !c.markInflight(e, "status") {
		return
	}
	c.pool.SubmitHigh(func() {
		defer c.clearInflight(e, "status")
		rs, err := GetRepoStatus(ctx, repoPath)
		if err != nil {
			log.Debug("git/WarmCache: status refresh failed", "repo", repoPath, "err", err)
			return
		}
		e.mu.Lock()
		e.status = rs
		e.updated = time.Now()
		e.mu.Unlock()
		c.mu.RLock()
		cb := c.onStatus
		c.mu.RUnlock()
		if cb != nil {
			cb(repoPath, rs)
		}
	})
}

func (c *WarmCache) refreshBranches(ctx context.Context, repoPath string, e *warmEntry) {
	if !c.markInflight(e, "branches") {
		return
	}
	c.pool.SubmitHigh(func() {
		defer c.clearInflight(e, "branches")
		bs, err := ListBranches(ctx, repoPath)
		if err != nil {
			log.Debug("git/WarmCache: branches refresh failed", "repo", repoPath, "err", err)
			return
		}
		e.mu.Lock()
		e.branches = bs
		e.updated = time.Now()
		e.mu.Unlock()
		c.mu.RLock()
		cb := c.onBranch
		c.mu.RUnlock()
		if cb != nil {
			cb(repoPath, bs)
		}
	})
}

func (c *WarmCache) refreshLog(ctx context.Context, repoPath string, e *warmEntry) {
	if !c.markInflight(e, "log") {
		return
	}
	c.pool.SubmitHigh(func() {
		defer c.clearInflight(e, "log")
		commits, err := Log(ctx, repoPath, 50, 0)
		if err != nil {
			log.Debug("git/WarmCache: log refresh failed", "repo", repoPath, "err", err)
			return
		}
		e.mu.Lock()
		e.commits = commits
		e.updated = time.Now()
		e.mu.Unlock()
		c.mu.RLock()
		cb := c.onLog
		c.mu.RUnlock()
		if cb != nil {
			cb(repoPath, commits)
		}
	})
}
