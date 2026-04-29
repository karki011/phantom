// tree_of_thought_test.go tests the TreeOfThoughtStrategy.
// Author: Subash Karki
package strategies

import (
	"strings"
	"testing"
)

func TestTreeOfThought_ShouldActivate(t *testing.T) {
	s := NewTreeOfThoughtStrategy()
	tests := []struct {
		name      string
		assess    TaskAssessment
		wantScore float64
	}{
		{"ambiguous moderate", TaskAssessment{IsAmbiguous: true, Complexity: Moderate}, 0.85},
		{"ambiguous complex", TaskAssessment{IsAmbiguous: true, Complexity: Complex}, 0.85},
		{"ambiguous critical", TaskAssessment{IsAmbiguous: true, Complexity: Critical}, 0.85},
		{"ambiguous simple", TaskAssessment{IsAmbiguous: true, Complexity: Simple}, 0.5},
		{"complex+medium", TaskAssessment{Complexity: Complex, Risk: MediumRisk}, 0.6},
		{"clear simple", TaskAssessment{Complexity: Simple, Risk: LowRisk}, 0.1},
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

func TestTreeOfThought_Enrich(t *testing.T) {
	s := NewTreeOfThoughtStrategy()
	out := s.Enrich("design caching", TaskAssessment{Complexity: Complex, Risk: MediumRisk, IsAmbiguous: true}, "")
	if !strings.Contains(out, "tree-of-thought") {
		t.Errorf("missing kind marker: %s", out)
	}
	if !strings.Contains(out, "Branch 1") {
		t.Errorf("missing branch enumeration: %s", out)
	}
	if !strings.Contains(out, "design caching") {
		t.Errorf("missing original message: %s", out)
	}
}

func TestTreeOfThought_BranchScoresDeterministic(t *testing.T) {
	a := TaskAssessment{Complexity: Complex, Risk: HighRisk, BlastRadius: 5}
	b1 := scoreBranches(a)
	b2 := scoreBranches(a)
	if len(b1) != 3 || len(b2) != 3 {
		t.Fatalf("expected 3 branches, got %d / %d", len(b1), len(b2))
	}
	for i := range b1 {
		if b1[i].combined != b2[i].combined {
			t.Errorf("branch %d combined non-deterministic: %.2f vs %.2f", i, b1[i].combined, b2[i].combined)
		}
	}
}

func TestTreeOfThought_IDName(t *testing.T) {
	s := NewTreeOfThoughtStrategy()
	if s.ID() != "tree-of-thought" {
		t.Errorf("ID = %q, want %q", s.ID(), "tree-of-thought")
	}
	if s.Name() == "" {
		t.Error("Name is empty")
	}
}
