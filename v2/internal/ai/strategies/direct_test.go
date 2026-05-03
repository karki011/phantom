// direct_test.go tests the DirectStrategy.
// Author: Subash Karki
package strategies

import "testing"

func TestDirect_ShouldActivate(t *testing.T) {
	s := NewDirectStrategy()
	tests := []struct {
		name       string
		assess     TaskAssessment
		wantScore  float64
		wantSubstr string
	}{
		{"simple clear", TaskAssessment{Complexity: Simple}, 0.9, "simple task"},
		{"moderate clear", TaskAssessment{Complexity: Moderate}, 0.6, "moderate task"},
		{"complex clear", TaskAssessment{Complexity: Complex}, 0.3, "complex task"},
		{"critical clear", TaskAssessment{Complexity: Critical}, 0.3, "complex task"},
		{"simple ambiguous", TaskAssessment{Complexity: Simple, IsAmbiguous: true}, 0.45, "penalized"},
		{"moderate ambiguous", TaskAssessment{Complexity: Moderate, IsAmbiguous: true}, 0.3, "penalized"},
		{"complex ambiguous", TaskAssessment{Complexity: Complex, IsAmbiguous: true}, 0.15, "penalized"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			score, reason := s.ShouldActivate(tt.assess)
			if score != tt.wantScore {
				t.Errorf("score = %.2f, want %.2f", score, tt.wantScore)
			}
			if tt.wantSubstr != "" {
				if len(reason) == 0 || !contains(reason, tt.wantSubstr) {
					t.Errorf("reason %q missing %q", reason, tt.wantSubstr)
				}
			}
		})
	}
}

func TestDirect_Enrich(t *testing.T) {
	s := NewDirectStrategy()
	msg := "fix the typo"
	out := s.Enrich(msg, TaskAssessment{Complexity: Simple}, "")
	if out != msg {
		t.Errorf("Enrich changed message: got %q, want %q", out, msg)
	}
}

func TestDirect_IDName(t *testing.T) {
	s := NewDirectStrategy()
	if s.ID() != "direct" {
		t.Errorf("ID = %q, want %q", s.ID(), "direct")
	}
	if s.Name() == "" {
		t.Error("Name is empty")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchSubstr(s, substr)
}

func searchSubstr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
