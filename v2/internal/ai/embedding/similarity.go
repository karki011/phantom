// Author: Subash Karki
package embedding

import (
	"math"
	"sort"
)

// ScoredVector pairs an identifier with a precomputed vector and an optional
// similarity score (populated by TopK).
type ScoredVector struct {
	ID     string
	Vector []float32
	Score  float32
}

// CosineSimilarity computes the cosine of the angle between two vectors.
// Returns 0 if either vector has zero magnitude.
func CosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		ai, bi := float64(a[i]), float64(b[i])
		dot += ai * bi
		normA += ai * ai
		normB += bi * bi
	}
	denom := math.Sqrt(normA) * math.Sqrt(normB)
	if denom == 0 {
		return 0
	}
	return float32(dot / denom)
}

// TopK returns the top-K candidates by cosine similarity to the query vector,
// sorted descending. Each returned ScoredVector has its Score field populated.
func TopK(query []float32, candidates []ScoredVector, k int) []ScoredVector {
	if k <= 0 || len(candidates) == 0 {
		return nil
	}

	scored := make([]ScoredVector, len(candidates))
	for i, c := range candidates {
		scored[i] = ScoredVector{
			ID:     c.ID,
			Vector: c.Vector,
			Score:  CosineSimilarity(query, c.Vector),
		}
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].Score > scored[j].Score
	})

	if k > len(scored) {
		k = len(scored)
	}
	return scored[:k]
}
