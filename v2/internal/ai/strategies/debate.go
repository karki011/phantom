// Package strategies provides AI prompt enhancement strategies.
// DebateStrategy stages a deterministic advocate / critic / judge synthesis
// for high-risk tasks. v1 ran multi-turn LLM debate; v2 has no LLM provider,
// so we emit the structured arguments inline so downstream callers can
// reason over them or trigger their own debate.
//
// Author: Subash Karki
package strategies

import (
	"fmt"
	"math"
	"strings"
)

// DebateStrategy emits multi-perspective deliberation for high-risk tasks.
type DebateStrategy struct {
	numRounds int
}

// NewDebateStrategy creates a DebateStrategy with v1's 2-round default.
func NewDebateStrategy() *DebateStrategy { return &DebateStrategy{numRounds: 2} }

// ID returns the unique identifier for this strategy.
func (d *DebateStrategy) ID() string { return "debate" }

// Name returns a human-readable name.
func (d *DebateStrategy) Name() string { return "Debate" }

// Description returns a brief explanation of what this strategy does.
func (d *DebateStrategy) Description() string {
	return "Multi-perspective deliberation for high-risk decisions. Simulates advocate vs. critic debate with judge synthesis."
}

// ShouldActivate scores how strongly this strategy fits the task.
// Mirrors v1: critical risk → 0.9, high+complex → 0.8, high+simple → 0.6,
// large blast radius → 0.7.
func (d *DebateStrategy) ShouldActivate(t TaskAssessment) (float64, string) {
	switch {
	case t.Risk == CriticalRisk:
		return 0.9, "Critical risk — debate deliberation strongly recommended"
	case t.Risk == HighRisk && (t.Complexity == Moderate || t.Complexity == Complex || t.Complexity == Critical):
		return 0.8, fmt.Sprintf("High risk with %s complexity — debate deliberation recommended", t.Complexity)
	case t.Risk == HighRisk && t.Complexity == Simple:
		return 0.6, "High risk but simple complexity — debate may help identify hidden risks"
	case t.BlastRadius > 15:
		return 0.7, fmt.Sprintf("Large blast radius (%d files) — multi-perspective review recommended", t.BlastRadius)
	case t.IsAmbiguous && t.AmbiguityScore > 0.3:
		return 0.85, "Ambiguous requirements — debate can explore alternatives"
	case t.IsAmbiguous:
		return 0.7, "Mild ambiguity — debate may help clarify approach"
	default:
		return 0.05, "Low risk — debate deliberation rarely needed"
	}
}

// Enrich emits structured advocate / critic points and a judge synthesis.
func (d *DebateStrategy) Enrich(message string, t TaskAssessment, graphCtx string) string {
	advocate := buildAdvocatePoints(t, message)
	critic := buildCriticPoints(t)
	judgment := synthesizeDebate(t)

	guidance := fmt.Sprintf(`<strategy-guidance kind="debate" rounds="%d">
Task profile: complexity=%s, risk=%s, blastRadius=%d
Advocate points:
%s
Critic points:
%s
Judge synthesis: %s
%s</strategy-guidance>

%s`, d.numRounds, t.Complexity, t.Risk, t.BlastRadius,
		bulletList(advocate), bulletList(critic), judgment, graphCtx, message)
	return guidance
}

// confidence returns the v1 deterministic confidence for the synthesis.
// Exposed so callers (and tests) can validate the bound.
func (d *DebateStrategy) confidence(t TaskAssessment) float64 {
	c := 0.7
	if t.BlastRadius <= 5 {
		c += 0.1
	}
	if t.Complexity == Simple {
		c += 0.1
	}
	return math.Min(0.95, math.Round(c*100)/100)
}

// buildAdvocatePoints mirrors v1 buildAdvocatePoints.
func buildAdvocatePoints(t TaskAssessment, goal string) []string {
	pts := []string{
		fmt.Sprintf(`Given "%s", the direct approach addresses the goal head-on.`, goal),
	}
	if t.Complexity == Simple || t.Complexity == Moderate {
		pts = append(pts, "Task complexity is manageable, reducing implementation risk.")
	}
	if t.BlastRadius <= 5 {
		pts = append(pts, fmt.Sprintf("Small blast radius (%d files) limits potential damage.", t.BlastRadius))
	}
	pts = append(pts, "Proceeding promptly avoids accumulating technical debt from delayed decisions.")
	return pts
}

// buildCriticPoints mirrors v1 buildCriticPoints.
func buildCriticPoints(t TaskAssessment) []string {
	var pts []string
	if t.BlastRadius > 5 {
		pts = append(pts, fmt.Sprintf("Blast radius of %d files means errors could propagate widely.", t.BlastRadius))
	}
	if t.Risk == HighRisk || t.Risk == CriticalRisk {
		pts = append(pts, fmt.Sprintf("Risk level is %s — a single mistake could have significant consequences.", t.Risk))
	}
	if t.Complexity == Complex || t.Complexity == Critical {
		pts = append(pts, fmt.Sprintf("Task complexity is %s — hidden edge cases are likely.", t.Complexity))
	}
	if t.IsAmbiguous {
		pts = append(pts, "Requirements are ambiguous — the proposed approach may solve the wrong problem.")
	}
	pts = append(pts, "Consider whether incremental rollout or feature flags could reduce risk.")
	return pts
}

// synthesizeDebate mirrors v1 synthesize: a one-line judge recommendation.
func synthesizeDebate(t TaskAssessment) string {
	return fmt.Sprintf(
		"Proceed with safeguards (incremental rollout, tests, monitoring) given complexity=%s, risk=%s, blastRadius=%d.",
		t.Complexity, t.Risk, t.BlastRadius,
	)
}

// bulletList joins points as a bullet-prefixed multi-line block.
func bulletList(items []string) string {
	if len(items) == 0 {
		return "  (none)"
	}
	var sb strings.Builder
	for _, p := range items {
		sb.WriteString("  - ")
		sb.WriteString(p)
		sb.WriteString("\n")
	}
	return strings.TrimRight(sb.String(), "\n")
}
