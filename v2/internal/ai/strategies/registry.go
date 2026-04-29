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
	Description() string
	ShouldActivate(assessment TaskAssessment) (score float64, reason string)
	Enrich(message string, assessment TaskAssessment, graphCtx string) string
}

// StrategyInfo is a read-only snapshot of a registered strategy used by
// metadata-introspection callers (e.g. phantom_orchestrator_strategies).
type StrategyInfo struct {
	ID          string
	Name        string
	Description string
	Enabled     bool
	Priority    int
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

// GetAll returns metadata for every registered strategy in registration order.
// Used by introspection callers that need to enumerate available strategies
// without invoking selection.
func (r *Registry) GetAll() []StrategyInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]StrategyInfo, 0, len(r.strategies))
	for _, e := range r.strategies {
		out = append(out, StrategyInfo{
			ID:          e.strategy.ID(),
			Name:        e.strategy.Name(),
			Description: e.strategy.Description(),
			Enabled:     e.enabled,
			Priority:    e.priority,
		})
	}
	return out
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
