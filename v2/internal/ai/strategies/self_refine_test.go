// self_refine_test.go tests the SelfRefineStrategy.
// Author: Subash Karki
package strategies

import (
	"strings"
	"testing"
)

func TestSelfRefine_ShouldActivate(t *testing.T) {
	s := NewSelfRefineStrategy()
	tests := []struct {
		name      string
		assess    TaskAssessment
		wantScore float64
	}{
		{"moderate clear", TaskAssessment{Complexity: Moderate, IsAmbiguous: false}, 0.5},
		{"moderate ambiguous", TaskAssessment{Complexity: Moderate, IsAmbiguous: true}, 0.1},
		{"simple low-risk", TaskAssessment{Complexity: Simple, Risk: LowRisk}, 0.2},
		{"complex", TaskAssessment{Complexity: Complex}, 0.1},
		{"critical", TaskAssessment{Complexity: Critical}, 0.1},
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

func TestSelfRefine_Enrich(t *testing.T) {
	s := NewSelfRefineStrategy()
	out := s.Enrich("polish docstring", TaskAssessment{Complexity: Moderate}, "")
	if !strings.Contains(out, "self-refine") {
		t.Errorf("missing 'self-refine' marker: %s", out)
	}
	if !strings.Contains(out, "polish docstring") {
		t.Errorf("missing original message: %s", out)
	}
}

func TestSelfRefine_IDName(t *testing.T) {
	s := NewSelfRefineStrategy()
	if s.ID() != "self-refine" {
		t.Errorf("ID = %q, want %q", s.ID(), "self-refine")
	}
	if s.Name() == "" {
		t.Error("Name is empty")
	}
}
