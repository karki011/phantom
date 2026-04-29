// Package strategies provides AI prompt enhancement strategies.
// DecomposeStrategy handles complex tasks by injecting structured guidance
// that encourages dependency-ordered, incremental changes.
//
// Author: Subash Karki
package strategies

import "fmt"

// DecomposeStrategy breaks complex tasks into ordered subtasks.
type DecomposeStrategy struct{}

// NewDecomposeStrategy creates a DecomposeStrategy.
func NewDecomposeStrategy() *DecomposeStrategy { return &DecomposeStrategy{} }

// ID returns the unique identifier for this strategy.
func (d *DecomposeStrategy) ID() string { return "decompose" }

// Name returns a human-readable name.
func (d *DecomposeStrategy) Name() string { return "Task Decomposition" }

// Description returns a brief explanation of what this strategy does.
func (d *DecomposeStrategy) Description() string {
	return "Breaks complex tasks into ordered subtasks with dependency-aware guidance for incremental changes."
}

// ShouldActivate returns a score indicating how well this strategy fits.
func (d *DecomposeStrategy) ShouldActivate(a TaskAssessment) (float64, string) {
	switch {
	case a.Complexity == Critical:
		return 0.95, "critical complexity requires decomposition"
	case a.Complexity == Complex:
		return 0.85, "complex task benefits from decomposition"
	case a.Complexity == Moderate && a.Risk == HighRisk:
		return 0.7, "moderate but high-risk"
	case a.IsAmbiguous:
		return 0.6, "ambiguous task needs structured approach"
	default:
		return 0.2, "simple enough without decomposition"
	}
}

// Enrich prepends strategy guidance to the user message.
func (d *DecomposeStrategy) Enrich(message string, a TaskAssessment, _ string) string {
	guidance := fmt.Sprintf(`<strategy-guidance>
Task Assessment: complexity=%s, risk=%s, ambiguity=%.1f
Recommendation: Break this into smaller changes. Consider:
1. Review the dependency context above for file ordering
2. Start with the most isolated files (fewest dependents)
3. Test after each change before moving to files with higher blast radius
%s</strategy-guidance>

%s`, a.Complexity, a.Risk, a.AmbiguityScore, blastWarning(a), message)
	return guidance
}

// blastWarning returns a warning string for high blast-radius tasks.
func blastWarning(a TaskAssessment) string {
	if a.BlastRadius > 10 {
		return fmt.Sprintf("WARNING: High blast radius (%d files affected). Proceed carefully.", a.BlastRadius)
	}
	return ""
}
