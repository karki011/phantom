// Author: Subash Karki
//
// strategies_adapter.go bridges HaikuAssessor to the strategies.LLMAssessor
// interface. Kept in the assess package to avoid an import cycle.
package assess

import (
	"context"

	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
)

// StrategiesAdapter wraps HaikuAssessor and satisfies strategies.LLMAssessor.
type StrategiesAdapter struct {
	inner *HaikuAssessor
}

// NewStrategiesAdapter returns a strategies.LLMAssessor backed by a
// HaikuAssessor. Returns nil when assessor is nil.
func NewStrategiesAdapter(a *HaikuAssessor) strategies.LLMAssessor {
	if a == nil {
		return nil
	}
	return &StrategiesAdapter{inner: a}
}

// Assess implements strategies.LLMAssessor.
func (s *StrategiesAdapter) Assess(ctx context.Context, goal string, projectContext string) (strategies.LLMAssessment, error) {
	ha, err := s.inner.Assess(ctx, goal, projectContext)
	if err != nil {
		return strategies.LLMAssessment{}, err
	}
	if ha == nil {
		// Haiku unavailable — return zero value so caller detects the nil path.
		return strategies.LLMAssessment{}, nil
	}
	return strategies.LLMAssessment{
		TaskType:   ha.TaskType,
		Complexity: ha.Complexity,
		Risk:       ha.Risk,
		RiskReason: ha.RiskReason,
		KeyFiles:   ha.KeyFiles,
		Summary:    ha.Summary,
	}, nil
}
