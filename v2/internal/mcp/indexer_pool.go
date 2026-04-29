// IndexerPool owns filegraph indexers for the standalone MCP binary.
// Mirrors the per-project lifecycle the Wails app provides via App.StartFileGraph,
// but without any Wails dependencies — fits a stdio-only binary.
//
// Author: Subash Karki
package mcp

import (
	"context"
	"sync"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
)

// BuildState is the lifecycle stage of a project's indexer.
type BuildState string

const (
	BuildIdle     BuildState = "idle"
	BuildBuilding BuildState = "building"
	BuildReady    BuildState = "ready"
	BuildError    BuildState = "error"
)

// indexerEntry holds an indexer and its lifecycle metadata.
type indexerEntry struct {
	indexer    *filegraph.Indexer
	state      BuildState
	startedAt  time.Time
	finishedAt time.Time
	err        string
}

// IndexerPool manages indexers keyed by project ID.
// Safe for concurrent use.
type IndexerPool struct {
	mu      sync.RWMutex
	entries map[string]*indexerEntry
}

// NewIndexerPool creates an empty pool.
func NewIndexerPool() *IndexerPool {
	return &IndexerPool{entries: make(map[string]*indexerEntry)}
}

// GetIndexer returns the running indexer for a project, or nil when absent.
// Implements IndexerProvider.
func (p *IndexerPool) GetIndexer(projectID string) *filegraph.Indexer {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if e, ok := p.entries[projectID]; ok {
		return e.indexer
	}
	return nil
}

// Status returns the current lifecycle status for a project.
// Returns BuildIdle when nothing is registered.
func (p *IndexerPool) Status(projectID string) (state BuildState, startedAt, finishedAt time.Time, errMsg string) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	e, ok := p.entries[projectID]
	if !ok {
		return BuildIdle, time.Time{}, time.Time{}, ""
	}
	// Fast-path: an entry whose indexer reports IsIndexing trumps stale state.
	if e.indexer != nil && e.indexer.IsIndexing() {
		return BuildBuilding, e.startedAt, time.Time{}, ""
	}
	// If we previously marked it building but the indexer finished, flip to ready.
	if e.state == BuildBuilding && e.indexer != nil && !e.indexer.IsIndexing() {
		return BuildReady, e.startedAt, e.finishedAt, ""
	}
	return e.state, e.startedAt, e.finishedAt, e.err
}

// Build starts a fresh indexer for the given project root. If a build is
// already in flight the existing startedAt is returned and no new indexer is
// launched. Indexer.Start kicks off background goroutines and returns
// immediately, so this method is non-blocking.
func (p *IndexerPool) Build(ctx context.Context, projectID, repoPath string) (startedAt time.Time, alreadyRunning bool, err error) {
	p.mu.Lock()
	if e, ok := p.entries[projectID]; ok {
		if e.indexer != nil && e.indexer.IsIndexing() {
			started := e.startedAt
			p.mu.Unlock()
			return started, true, nil
		}
		// Stop any prior indexer so we always start fresh on rebuild.
		if e.indexer != nil {
			e.indexer.Stop()
		}
		delete(p.entries, projectID)
	}

	ix := filegraph.NewIndexer(repoPath)
	now := time.Now()
	entry := &indexerEntry{
		indexer:   ix,
		state:     BuildBuilding,
		startedAt: now,
	}
	p.entries[projectID] = entry
	p.mu.Unlock()

	if err := ix.Start(context.Background()); err != nil {
		p.mu.Lock()
		entry.state = BuildError
		entry.finishedAt = time.Now()
		entry.err = err.Error()
		p.mu.Unlock()
		return now, false, err
	}

	// Watch for completion in the background so Status flips to ready and
	// finishedAt gets populated without polling-only inference.
	go p.markReadyWhenDone(projectID, entry)
	return now, false, nil
}

// markReadyWhenDone polls the indexer's IsIndexing flag and records completion
// metadata once it goes false. Runs once per Build call.
func (p *IndexerPool) markReadyWhenDone(projectID string, entry *indexerEntry) {
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		if entry.indexer == nil {
			return
		}
		if !entry.indexer.IsIndexing() {
			p.mu.Lock()
			if cur, ok := p.entries[projectID]; ok && cur == entry {
				entry.state = BuildReady
				entry.finishedAt = time.Now()
			}
			p.mu.Unlock()
			return
		}
	}
}

// Close stops every indexer in the pool. Safe to call multiple times.
func (p *IndexerPool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for id, e := range p.entries {
		if e.indexer != nil {
			e.indexer.Stop()
		}
		delete(p.entries, id)
	}
}
