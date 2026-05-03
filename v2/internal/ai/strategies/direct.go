// Package strategies provides AI prompt enhancement strategies.
// DirectStrategy handles simple tasks with minimal enrichment — the message
// passes through unchanged, relying on the existing codebase context.
//
// Author: Subash Karki
package strategies

// DirectStrategy is the default strategy for simple, low-risk tasks.
type DirectStrategy struct{}

// NewDirectStrategy creates a DirectStrategy.
func NewDirectStrategy() *DirectStrategy { return &DirectStrategy{} }

// ID returns the unique identifier for this strategy.
func (d *DirectStrategy) ID() string { return "direct" }

// Name returns a human-readable name.
func (d *DirectStrategy) Name() string { return "Direct Execution" }

// Description returns a brief explanation of what this strategy does.
func (d *DirectStrategy) Description() string {
	return "Fast-path strategy for simple, low-risk tasks. Passes graph context straight to the executor."
}

// ShouldActivate returns a score indicating how well this strategy fits.
func (d *DirectStrategy) ShouldActivate(a TaskAssessment) (float64, string) {
	var score float64
	var reason string
	switch a.Complexity {
	case Simple:
		score, reason = 0.9, "simple task"
	case Moderate:
		score, reason = 0.6, "moderate task"
	default:
		score, reason = 0.3, "complex task, prefer other strategies"
	}
	if a.IsAmbiguous {
		score *= 0.5
		reason += " (penalized: ambiguous requirements)"
	}
	return score, reason
}

// Enrich returns the message unchanged — direct strategy adds no guidance.
func (d *DirectStrategy) Enrich(message string, _ TaskAssessment, _ string) string {
	return message
}
