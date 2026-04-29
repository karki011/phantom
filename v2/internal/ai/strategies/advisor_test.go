// advisor_test.go tests the AdvisorStrategy.
// Author: Subash Karki
package strategies

import (
	"strings"
	"testing"
)

func TestAdvisor_ShouldActivate(t *testing.T) {
	s := NewAdvisorStrategy()
	tests := []struct {
		name      string
		assess    TaskAssessment
		minScore  float64
		maxScore  float64
		wantInRsn string
	}{
		{"critical risk", TaskAssessment{Risk: CriticalRisk, Complexity: Simple}, 0.85, 0.85, "critical"},
		{"high risk", TaskAssessment{Risk: HighRisk, Complexity: Simple}, 0.85, 0.85, "high"},
		{"complex task", TaskAssessment{Risk: LowRisk, Complexity: Complex}, 0.8, 0.8, "complex"},
		{"ambiguous", TaskAssessment{Risk: LowRisk, Complexity: Simple, IsAmbiguous: true}, 0.7, 0.7, "Ambiguous"},
		{"large blast", TaskAssessment{Risk: LowRisk, Complexity: Simple, BlastRadius: 12}, 0.6, 0.6, "blast radius"},
		{"moderate medium", TaskAssessment{Risk: MediumRisk, Complexity: Moderate}, 0.4, 0.4, "Moderate"},
		{"trivial", TaskAssessment{Risk: LowRisk, Complexity: Simple}, 0.1, 0.1, "not needed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			score, reason := s.ShouldActivate(tt.assess)
			if score < tt.minScore || score > tt.maxScore {
				t.Errorf("score = %.2f, want in [%.2f, %.2f]", score, tt.minScore, tt.maxScore)
			}
			if !strings.Contains(strings.ToLower(reason), strings.ToLower(tt.wantInRsn)) {
				t.Errorf("reason = %q, want substring %q", reason, tt.wantInRsn)
			}
		})
	}
}

func TestAdvisor_Enrich(t *testing.T) {
	s := NewAdvisorStrategy()
	out := s.Enrich("refactor auth", TaskAssessment{Complexity: Critical, Risk: CriticalRisk}, "")
	if out == "" {
		t.Fatal("Enrich returned empty")
	}
	if !strings.Contains(out, "advisor") {
		t.Errorf("Enrich output missing 'advisor' marker: %s", out)
	}
	if !strings.Contains(out, "refactor auth") {
		t.Errorf("Enrich output missing original message: %s", out)
	}
}

func TestAdvisor_IDName(t *testing.T) {
	s := NewAdvisorStrategy()
	if s.ID() != "advisor" {
		t.Errorf("ID = %q, want %q", s.ID(), "advisor")
	}
	if s.Name() == "" {
		t.Error("Name is empty")
	}
}
