// Author: Subash Karki
package namegen

import (
	"regexp"
	"strings"
	"testing"
)

// TestGenerateUnique_FullPool exercises the full pool: 200 unique names must
// never collide. This exceeds the raw pool size (~200 names) so the suffix
// fallback path is also exercised.
func TestGenerateUnique_FullPool(t *testing.T) {
	t.Parallel()

	existing := make(map[string]bool)
	for i := 0; i < 200; i++ {
		name := GenerateUnique(existing)
		if name == "" {
			t.Fatalf("GenerateUnique returned empty string at iteration %d", i)
		}
		if existing[name] {
			t.Fatalf("collision at iteration %d: %s", i, name)
		}
		existing[name] = true
	}

	// Verify every name starts with uppercase and is either a base name or has -N suffix.
	pattern := regexp.MustCompile(`^[A-Z][a-z0-9]+(-\d+)?$`)
	for name := range existing {
		if !pattern.MatchString(name) {
			t.Errorf("unexpected name format: %q", name)
		}
	}
}

// TestGenerateUnique_ExhaustsPoolThenSuffix fills the pool with every base
// name, then generates 50 more — all must use the suffix path.
func TestGenerateUnique_ExhaustsPoolThenSuffix(t *testing.T) {
	t.Parallel()

	existing := make(map[string]bool, len(names)+50)
	// Pre-fill with every base name in the pool.
	for _, n := range names {
		existing[titleCase(n)] = true
	}

	suffixPattern := regexp.MustCompile(`-\d+$`)
	for i := 0; i < 50; i++ {
		name := GenerateUnique(existing)
		if existing[name] {
			t.Fatalf("collision at suffix iteration %d: %s", i, name)
		}
		if !suffixPattern.MatchString(name) {
			t.Errorf("expected suffix format at iteration %d, got %q", i, name)
		}
		existing[name] = true
	}
}

// TestGenerateUnique_AllNamesAreValidPokemon verifies that generated names
// are either a base pool name or a pool name with a numeric suffix.
func TestGenerateUnique_AllNamesAreValidPokemon(t *testing.T) {
	t.Parallel()

	poolSet := make(map[string]bool, len(names))
	for _, n := range names {
		poolSet[titleCase(n)] = true
	}

	existing := make(map[string]bool)
	for i := 0; i < 200; i++ {
		name := GenerateUnique(existing)
		// Name must either be in the pool OR be "PoolName-N" format.
		if !poolSet[name] {
			// Strip suffix to get base name.
			base := name
			if idx := strings.LastIndex(name, "-"); idx > 0 {
				base = name[:idx]
			}
			if !poolSet[base] {
				t.Errorf("iteration %d: %q base %q is not in the Pokémon pool", i, name, base)
			}
		}
		existing[name] = true
	}
}

// TestGenerate_Concurrent verifies Generate is safe for concurrent use.
func TestGenerate_Concurrent(t *testing.T) {
	t.Parallel()

	done := make(chan string, 500)
	for i := 0; i < 500; i++ {
		go func() {
			done <- Generate()
		}()
	}

	for i := 0; i < 500; i++ {
		name := <-done
		if name == "" {
			t.Fatal("concurrent Generate returned empty string")
		}
	}
}
