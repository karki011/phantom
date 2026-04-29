// Package strategies provides AI prompt enhancement strategies.
// SelfRefineStrategy injects iterative-refinement guidance for moderate tasks
// with clear requirements. v1 ran an actual refine LLM loop; v2 has no LLM
// provider, so the enrichment is a structured "refine your previous answer"
// prompt that downstream callers (Claude Code) execute directly.
//
// Author: Subash Karki
package strategies

import "fmt"

// SelfRefineStrategy emits guidance for iterative output improvement.
type SelfRefineStrategy struct{}

// NewSelfRefineStrategy creates a SelfRefineStrategy.
func NewSelfRefineStrategy() *SelfRefineStrategy { return &SelfRefineStrategy{} }

// ID returns the unique identifier for this strategy.
func (s *SelfRefineStrategy) ID() string { return "self-refine" }

// Name returns a human-readable name.
func (s *SelfRefineStrategy) Name() string { return "Self-Refine" }

// Description returns a brief explanation of what this strategy does.
func (s *SelfRefineStrategy) Description() string {
	return "Iterative refinement strategy for improving near-final outputs to higher quality."
}

// ShouldActivate scores how strongly this strategy fits the task.
// v2 has no notion of "previous outputs" inside Process (each call is fresh),
// so we activate on moderate-complexity, non-ambiguous tasks where iterative
// polishing is most useful. Higher-complexity tasks fall through to other
// strategies (Advisor, Decompose, Tree/Graph-of-Thought, Debate).
func (s *SelfRefineStrategy) ShouldActivate(t TaskAssessment) (float64, string) {
	if t.Complexity == Moderate && !t.IsAmbiguous {
		return 0.5, "Moderate complexity with clear requirements — refinement may help"
	}
	if t.Complexity == Simple && t.Risk == LowRisk {
		return 0.2, "Simple low-risk task — refinement rarely necessary"
	}
	return 0.1, "No refinement opportunity detected"
}

// Enrich prepends self-refine guidance to the user message.
func (s *SelfRefineStrategy) Enrich(message string, t TaskAssessment, graphCtx string) string {
	guidance := fmt.Sprintf(`<strategy-guidance kind="self-refine">
Task profile: complexity=%s, risk=%s
Recommendation:
1. Produce an initial draft of the change.
2. Critique your own draft against: correctness, edge cases, naming, dead code.
3. Refine until you would be comfortable handing it to a senior reviewer.
4. Stop once the next iteration produces no meaningful improvement.
%s</strategy-guidance>

%s`, t.Complexity, t.Risk, graphCtx, message)
	return guidance
}
