// graph_of_thought_test.go tests the GraphOfThoughtStrategy.
// Author: Subash Karki
package strategies

import (
	"strings"
	"testing"
)

func TestGraphOfThought_ShouldActivate(t *testing.T) {
	s := NewGraphOfThoughtStrategy()
	tests := []struct {
		name      string
		assess    TaskAssessment
		wantScore float64
	}{
		{"critical", TaskAssessment{Complexity: Critical}, 0.9},
		{"complex+huge blast", TaskAssessment{Complexity: Complex, BlastRadius: 12}, 0.85},
		{"complex clear", TaskAssessment{Complexity: Complex, BlastRadius: 0}, 0.7},
		{"moderate huge blast", TaskAssessment{Complexity: Moderate, BlastRadius: 16}, 0.6},
		{"simple", TaskAssessment{Complexity: Simple}, 0.05},
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

func TestGraphOfThought_Enrich(t *testing.T) {
	s := NewGraphOfThoughtStrategy()
	out := s.Enrich("rewrite scheduler", TaskAssessment{Complexity: Critical, BlastRadius: 20}, "")
	if !strings.Contains(out, "graph-of-thought") {
		t.Errorf("missing kind marker: %s", out)
	}
	if !strings.Contains(out, "rewrite scheduler") {
		t.Errorf("missing original message: %s", out)
	}
	if !strings.Contains(out, "Step ") {
		t.Errorf("missing step enumeration: %s", out)
	}
}

func TestGraphOfThought_TopologicalSort(t *testing.T) {
	nodes := decomposeGraph(TaskAssessment{Complexity: Critical, BlastRadius: 20})
	order := topologicalSort(nodes)
	pos := make(map[string]int, len(order))
	for i, id := range order {
		pos[id] = i
	}
	// Each node must come after all its dependencies.
	for _, n := range nodes {
		for _, dep := range n.dependencies {
			if pos[dep] >= pos[n.id] {
				t.Errorf("node %q appears before its dependency %q (positions %d vs %d)",
					n.id, dep, pos[n.id], pos[dep])
			}
		}
	}
}

func TestGraphOfThought_ParallelGroups(t *testing.T) {
	nodes := decomposeGraph(TaskAssessment{Complexity: Critical, BlastRadius: 20})
	order := topologicalSort(nodes)
	groups := identifyParallelGroups(nodes, order)
	if len(groups) == 0 {
		t.Fatal("expected at least one group")
	}
}

func TestGraphOfThought_IDName(t *testing.T) {
	s := NewGraphOfThoughtStrategy()
	if s.ID() != "graph-of-thought" {
		t.Errorf("ID = %q, want %q", s.ID(), "graph-of-thought")
	}
	if s.Name() == "" {
		t.Error("Name is empty")
	}
}
