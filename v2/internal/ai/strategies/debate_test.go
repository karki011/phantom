// debate_test.go tests the DebateStrategy.
// Author: Subash Karki
package strategies

import (
	"strings"
	"testing"
)

func TestDebate_ShouldActivate(t *testing.T) {
	s := NewDebateStrategy()
	tests := []struct {
		name      string
		assess    TaskAssessment
		wantScore float64
	}{
		{"critical risk", TaskAssessment{Risk: CriticalRisk, Complexity: Simple}, 0.9},
		{"high+complex", TaskAssessment{Risk: HighRisk, Complexity: Complex}, 0.8},
		{"high+simple", TaskAssessment{Risk: HighRisk, Complexity: Simple}, 0.6},
		{"large blast", TaskAssessment{Risk: LowRisk, Complexity: Simple, BlastRadius: 20}, 0.7},
		{"ambiguous high score", TaskAssessment{Risk: LowRisk, Complexity: Simple, IsAmbiguous: true, AmbiguityScore: 0.6}, 0.85},
		{"ambiguous low score", TaskAssessment{Risk: LowRisk, Complexity: Simple, IsAmbiguous: true, AmbiguityScore: 0.2}, 0.7},
		{"low risk", TaskAssessment{Risk: LowRisk, Complexity: Simple}, 0.05},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			score, _ := s.ShouldActivate(tt.assess)
			if score != tt.wantScore {
				t.Errorf("score = %.2f, want %.2f", score, tt.wantScore)
			}
		})
	}
}

func TestDebate_Enrich(t *testing.T) {
	s := NewDebateStrategy()
	out := s.Enrich("delete old API", TaskAssessment{Complexity: Critical, Risk: CriticalRisk, BlastRadius: 30, IsAmbiguous: true}, "")
	if !strings.Contains(out, "debate") {
		t.Errorf("missing kind marker: %s", out)
	}
	if !strings.Contains(out, "Advocate") {
		t.Errorf("missing advocate section: %s", out)
	}
	if !strings.Contains(out, "Critic") {
		t.Errorf("missing critic section: %s", out)
	}
	if !strings.Contains(out, "delete old API") {
		t.Errorf("missing original message: %s", out)
	}
}

func TestDebate_Confidence(t *testing.T) {
	s := NewDebateStrategy()
	c := s.confidence(TaskAssessment{Complexity: Simple, BlastRadius: 1})
	if c < 0.7 || c > 0.95 {
		t.Errorf("confidence = %.2f, expected in [0.7, 0.95]", c)
	}
}

func TestDebate_IDName(t *testing.T) {
	s := NewDebateStrategy()
	if s.ID() != "debate" {
		t.Errorf("ID = %q, want %q", s.ID(), "debate")
	}
	if s.Name() == "" {
		t.Error("Name is empty")
	}
}
