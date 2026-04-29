// Package strategies provides AI prompt enhancement strategies.
// AdvisorStrategy escalates complex / high-risk / ambiguous tasks by injecting
// guidance that flags the goal for deeper review and surfaces the escalation
// reason. v1 used a stronger LLM here; v2 has no LLM provider, so the
// enrichment is structured guidance only.
//
// Author: Subash Karki
package strategies

import "fmt"

// AdvisorStrategy injects escalation guidance for high-risk / complex tasks.
type AdvisorStrategy struct{}

// NewAdvisorStrategy creates an AdvisorStrategy.
func NewAdvisorStrategy() *AdvisorStrategy { return &AdvisorStrategy{} }

// ID returns the unique identifier for this strategy.
func (a *AdvisorStrategy) ID() string { return "advisor" }

// Name returns a human-readable name.
func (a *AdvisorStrategy) Name() string { return "Advisor Escalation" }

// Description returns a brief explanation of what this strategy does.
func (a *AdvisorStrategy) Description() string {
	return "Escalates complex or high-risk tasks to a stronger model for deeper reasoning."
}

// ShouldActivate scores how strongly this strategy fits the task.
// Mirrors v1 advisor.ts thresholds: critical/high-risk → 0.85, complex/critical
// complexity → 0.8, ambiguous → 0.7, large blast radius → 0.6.
func (a *AdvisorStrategy) ShouldActivate(t TaskAssessment) (float64, string) {
	switch {
	case t.Risk == HighRisk || t.Risk == CriticalRisk:
		return 0.85, fmt.Sprintf("High/critical risk (%s) — advisor review required", t.Risk)
	case t.Complexity == Complex || t.Complexity == Critical:
		return 0.8, fmt.Sprintf("Complex/critical task (%s) — advisor reasoning needed", t.Complexity)
	case t.IsAmbiguous:
		return 0.7, "Ambiguous requirements — advisor can disambiguate"
	case t.BlastRadius > 10:
		return 0.6, fmt.Sprintf("Large blast radius (%d files) — advisor should review", t.BlastRadius)
	case t.Complexity == Moderate && t.Risk == MediumRisk:
		return 0.4, "Moderate complexity with medium risk — advisor may help"
	default:
		return 0.1, "Low complexity/risk — advisor not needed"
	}
}

// Enrich prepends advisor escalation guidance to the user message.
func (a *AdvisorStrategy) Enrich(message string, t TaskAssessment, graphCtx string) string {
	score, reason := a.ShouldActivate(t)
	guidance := fmt.Sprintf(`<strategy-guidance kind="advisor">
Escalation: %s (score=%.2f)
Task profile: complexity=%s, risk=%s, ambiguity=%.1f, blastRadius=%d
Recommendation:
1. Treat this as a high-stakes change — slow down, reason carefully.
2. Verify assumptions against the dependency graph before editing.
3. Prefer reversible / additive edits over invasive rewrites.
%s</strategy-guidance>

%s`, reason, score, t.Complexity, t.Risk, t.AmbiguityScore, t.BlastRadius, graphCtx, message)
	return guidance
}
