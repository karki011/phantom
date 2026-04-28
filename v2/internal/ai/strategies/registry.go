// Package strategies provides AI prompt enhancement strategies.
// Registry manages strategy registration, activation scoring, and selection
// with optional historical performance weighting.
//
// Author: Subash Karki
package strategies

import (
	"sort"
	"sync"
)

// Strategy is implemented by each execution strategy. The registry calls
// ShouldActivate to score candidates and Enrich to apply the chosen strategy.
type Strategy interface {
	ID() string
	Name() string
	ShouldActivate(assessment TaskAssessment) (score float64, reason string)
	Enrich(message string, assessment TaskAssessment, graphCtx string) string
}

// registryEntry pairs a strategy with its enabled flag and static priority.
type registryEntry struct {
	strategy Strategy
	enabled  bool
	priority int
}

// Registry holds registered strategies and selects the best one for a task.
type Registry struct {
	mu         sync.RWMutex
	strategies []registryEntry
	perfStore  *PerformanceStore
}

// NewRegistry creates an empty strategy registry.
func NewRegistry() *Registry { return &Registry{} }

// Register adds a strategy with the given priority (higher = preferred on tie).
func (r *Registry) Register(s Strategy, priority int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.strategies = append(r.strategies, registryEntry{strategy: s, enabled: true, priority: priority})
}

// SetPerformanceStore attaches a PerformanceStore for historical weighting.
func (r *Registry) SetPerformanceStore(ps *PerformanceStore) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.perfStore = ps
}

// scored is an internal type for sorting candidates during selection.
type scored struct {
	strategy Strategy
	score    float64
	priority int
}

// Select returns the best strategy for the given assessment, or nil if none qualify.
func (r *Registry) Select(assessment TaskAssessment) Strategy {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var candidates []scored
	for _, e := range r.strategies {
		if !e.enabled {
			continue
		}
		score, _ := e.strategy.ShouldActivate(assessment)

		// Apply historical performance weight when available.
		if r.perfStore != nil {
			weight := r.perfStore.GetHistoricalWeight(e.strategy.ID(), assessment.Complexity)
			score *= weight
		}

		if score > 0.1 {
			candidates = append(candidates, scored{e.strategy, score, e.priority})
		}
	}

	if len(candidates) == 0 {
		// Fallback to first registered strategy (should be Direct).
		if len(r.strategies) > 0 {
			return r.strategies[0].strategy
		}
		return nil
	}

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].score != candidates[j].score {
			return candidates[i].score > candidates[j].score
		}
		return candidates[i].priority > candidates[j].priority
	})

	return candidates[0].strategy
}
