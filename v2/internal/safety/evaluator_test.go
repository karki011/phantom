// evaluator_test.go tests the Evaluator rule evaluation engine.
// Author: Subash Karki
package safety

import (
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// makeLoader builds a Loader pre-populated with the given rules (no file I/O).
func makeLoader(rules []Rule) *Loader {
	l := &Loader{}
	for i := range rules {
		_ = rules[i].Compile()
	}
	l.rules = rules
	return l
}

func TestEvaluator_BlockLevel(t *testing.T) {
	rules := []Rule{
		{ID: "block1", Name: "BlockRule", Level: LevelBlock, Tool: "Bash", Enabled: true},
	}
	ev := NewEvaluator(makeLoader(rules))
	evals := ev.Evaluate(&stream.Event{ToolName: "Bash", ToolInput: "rm -rf /"})
	if len(evals) != 1 {
		t.Fatalf("expected 1 evaluation, got %d", len(evals))
	}
	if evals[0].Outcome != "blocked" {
		t.Errorf("expected outcome 'blocked', got %q", evals[0].Outcome)
	}
	if evals[0].Level != LevelBlock {
		t.Errorf("expected level 'block', got %q", evals[0].Level)
	}
}

func TestEvaluator_WarnLevel(t *testing.T) {
	rules := []Rule{
		{ID: "warn1", Name: "WarnRule", Level: LevelWarn, Tool: "Edit", Enabled: true},
	}
	ev := NewEvaluator(makeLoader(rules))
	evals := ev.Evaluate(&stream.Event{ToolName: "Edit", ToolInput: "some content"})
	if len(evals) != 1 {
		t.Fatalf("expected 1 evaluation, got %d", len(evals))
	}
	if evals[0].Outcome != "warned" {
		t.Errorf("expected outcome 'warned', got %q", evals[0].Outcome)
	}
}

func TestEvaluator_MultipleRules(t *testing.T) {
	rules := []Rule{
		{ID: "r1", Name: "Rule1", Level: LevelBlock, Tool: "Bash", Enabled: true},
		{ID: "r2", Name: "Rule2", Level: LevelWarn, Pattern: `secret`, Enabled: true},
	}
	ev := NewEvaluator(makeLoader(rules))
	// Event matches both: Bash tool AND contains "secret".
	evals := ev.Evaluate(&stream.Event{ToolName: "Bash", ToolInput: "echo secret"})
	if len(evals) != 2 {
		t.Fatalf("expected 2 evaluations, got %d", len(evals))
	}
}

func TestEvaluator_NoMatch(t *testing.T) {
	rules := []Rule{
		{ID: "r1", Name: "Rule1", Level: LevelBlock, Tool: "Bash", Enabled: true},
	}
	ev := NewEvaluator(makeLoader(rules))
	evals := ev.Evaluate(&stream.Event{ToolName: "Read", ToolInput: "something"})
	if len(evals) != 0 {
		t.Fatalf("expected 0 evaluations, got %d", len(evals))
	}
}
