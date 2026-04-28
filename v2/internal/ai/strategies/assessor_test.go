// assessor_test.go tests the task Assessor.
// Author: Subash Karki
package strategies

import (
	"testing"
)

func TestAssessComplexity(t *testing.T) {
	tests := []struct {
		name      string
		fileCount int
		want      TaskComplexity
	}{
		{"zero files", 0, Simple},
		{"one file", 1, Simple},
		{"two files", 2, Simple},
		{"three files", 3, Moderate},
		{"eight files", 8, Moderate},
		{"nine files", 9, Complex},
		{"twenty files", 20, Complex},
		{"twenty-one files", 21, Critical},
		{"many files", 100, Critical},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := assessComplexity(tt.fileCount)
			if got != tt.want {
				t.Errorf("assessComplexity(%d) = %q, want %q", tt.fileCount, got, tt.want)
			}
		})
	}
}

func TestAssessRisk(t *testing.T) {
	tests := []struct {
		name        string
		blastRadius int
		want        TaskRisk
	}{
		{"zero blast", 0, LowRisk},
		{"three blast", 3, LowRisk},
		{"four blast", 4, MediumRisk},
		{"ten blast", 10, MediumRisk},
		{"eleven blast", 11, HighRisk},
		{"twenty-five blast", 25, HighRisk},
		{"twenty-six blast", 26, CriticalRisk},
		{"huge blast", 200, CriticalRisk},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := assessRisk(tt.blastRadius)
			if got != tt.want {
				t.Errorf("assessRisk(%d) = %q, want %q", tt.blastRadius, got, tt.want)
			}
		})
	}
}

func TestAssessAmbiguity(t *testing.T) {
	tests := []struct {
		name    string
		message string
		minWant float64
	}{
		{"question mark", "what is this?", 0.3},
		{"hedging words", "maybe we should refactor this", 0.2},
		{"uncertain phrasing", "I'm not sure about the approach", 0.4},
		{"comparison", "option A or vs option B", 0.25},
		{"which is better", "which approach is better", 0.35},
		{"clear directive", "add a logger to the service", 0.0},
		{"how should", "how should we handle errors", 0.35},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := assessAmbiguity(tt.message)
			if got < tt.minWant {
				t.Errorf("assessAmbiguity(%q) = %.2f, want >= %.2f", tt.message, got, tt.minWant)
			}
		})
	}
}

func TestAssessAmbiguity_ClearMessage(t *testing.T) {
	score := assessAmbiguity("add a logger to the service")
	if score != 0.0 {
		t.Errorf("expected 0.0 for clear message, got %.2f", score)
	}
}

func TestAssessor_Assess(t *testing.T) {
	a := NewAssessor()

	t.Run("simple low-risk unambiguous", func(t *testing.T) {
		result := a.Assess("fix the typo", 1, 1)
		if result.Complexity != Simple {
			t.Errorf("expected Simple, got %s", result.Complexity)
		}
		if result.Risk != LowRisk {
			t.Errorf("expected LowRisk, got %s", result.Risk)
		}
		if result.IsAmbiguous {
			t.Error("expected not ambiguous")
		}
		if result.FileCount != 1 {
			t.Errorf("expected FileCount=1, got %d", result.FileCount)
		}
		if result.BlastRadius != 1 {
			t.Errorf("expected BlastRadius=1, got %d", result.BlastRadius)
		}
	})

	t.Run("critical high-risk ambiguous", func(t *testing.T) {
		result := a.Assess("should we maybe refactor the entire module? I'm not sure which approach is better", 30, 50)
		if result.Complexity != Critical {
			t.Errorf("expected Critical, got %s", result.Complexity)
		}
		if result.Risk != CriticalRisk {
			t.Errorf("expected CriticalRisk, got %s", result.Risk)
		}
		if !result.IsAmbiguous {
			t.Error("expected ambiguous")
		}
		if result.AmbiguityScore < 0.3 {
			t.Errorf("expected ambiguity >= 0.3, got %.2f", result.AmbiguityScore)
		}
	})

	t.Run("moderate medium-risk", func(t *testing.T) {
		result := a.Assess("update the handler", 5, 7)
		if result.Complexity != Moderate {
			t.Errorf("expected Moderate, got %s", result.Complexity)
		}
		if result.Risk != MediumRisk {
			t.Errorf("expected MediumRisk, got %s", result.Risk)
		}
	})
}
