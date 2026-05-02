// Author: Subash Karki
package namegen

import (
	"regexp"
	"testing"
)

var titleCasePattern = regexp.MustCompile(`^[A-Z][a-z]+$`)

func TestGenerate(t *testing.T) {
	for i := 0; i < 100; i++ {
		name := Generate()
		if name == "" {
			t.Fatal("Generate returned empty string")
		}
		// First character must be uppercase.
		if name[0] < 'A' || name[0] > 'Z' {
			t.Errorf("Generate returned %q — first char not uppercase", name)
		}
	}
}

func TestGenerateUnique(t *testing.T) {
	existing := make(map[string]bool)
	// Generate 50 unique names — none should repeat.
	for i := 0; i < 50; i++ {
		name := GenerateUnique(existing)
		if existing[name] {
			t.Fatalf("GenerateUnique returned duplicate %q on iteration %d", name, i)
		}
		existing[name] = true
	}
}

func TestCollisionSuffix(t *testing.T) {
	// Pre-populate existing with EVERY name in the pool so collisions are guaranteed.
	existing := make(map[string]bool, len(names))
	for _, n := range names {
		existing[titleCase(n)] = true
	}

	name := GenerateUnique(existing)
	if name == "" {
		t.Fatal("GenerateUnique returned empty string when all names exhausted")
	}
	// The result must contain a hyphen+number suffix.
	matched, _ := regexp.MatchString(`-\d+$`, name)
	if !matched {
		t.Errorf("expected suffix like -N, got %q", name)
	}
	// Must not be in the original set.
	if existing[name] {
		t.Errorf("GenerateUnique returned %q which is already in existing", name)
	}
}

func TestNamesPoolNotEmpty(t *testing.T) {
	if len(names) < 100 {
		t.Errorf("expected at least 100 names in pool, got %d", len(names))
	}
}
