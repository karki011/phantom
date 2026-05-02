// Author: Subash Karki
package embedding

import (
	"math"
	"testing"
)

func TestCosineSimilarity_Identical(t *testing.T) {
	a := []float32{1, 2, 3, 4}
	got := CosineSimilarity(a, a)
	if math.Abs(float64(got)-1.0) > 1e-6 {
		t.Errorf("identical vectors: want 1.0, got %f", got)
	}
}

func TestCosineSimilarity_Orthogonal(t *testing.T) {
	a := []float32{1, 0, 0}
	b := []float32{0, 1, 0}
	got := CosineSimilarity(a, b)
	if math.Abs(float64(got)) > 1e-6 {
		t.Errorf("orthogonal vectors: want 0.0, got %f", got)
	}
}

func TestCosineSimilarity_Opposite(t *testing.T) {
	a := []float32{1, 2, 3}
	b := []float32{-1, -2, -3}
	got := CosineSimilarity(a, b)
	if math.Abs(float64(got)+1.0) > 1e-6 {
		t.Errorf("opposite vectors: want -1.0, got %f", got)
	}
}

func TestCosineSimilarity_ZeroVector(t *testing.T) {
	a := []float32{1, 2, 3}
	zero := []float32{0, 0, 0}

	// Zero as second arg.
	if got := CosineSimilarity(a, zero); got != 0 {
		t.Errorf("zero vector (b): want 0, got %f", got)
	}
	// Zero as first arg.
	if got := CosineSimilarity(zero, a); got != 0 {
		t.Errorf("zero vector (a): want 0, got %f", got)
	}
	// Both zero.
	if got := CosineSimilarity(zero, zero); got != 0 {
		t.Errorf("both zero: want 0, got %f", got)
	}
}

func TestCosineSimilarity_DifferentLengths(t *testing.T) {
	a := []float32{1, 2}
	b := []float32{1, 2, 3}
	if got := CosineSimilarity(a, b); got != 0 {
		t.Errorf("different lengths: want 0, got %f", got)
	}
}

func TestCosineSimilarity_Empty(t *testing.T) {
	if got := CosineSimilarity(nil, nil); got != 0 {
		t.Errorf("nil slices: want 0, got %f", got)
	}
	if got := CosineSimilarity([]float32{}, []float32{}); got != 0 {
		t.Errorf("empty slices: want 0, got %f", got)
	}
}

func TestTopK_Ordering(t *testing.T) {
	query := []float32{1, 0, 0}
	candidates := []ScoredVector{
		{ID: "far", Vector: []float32{0, 1, 0}},
		{ID: "close", Vector: []float32{0.9, 0.1, 0}},
		{ID: "closest", Vector: []float32{1, 0, 0}},
	}

	results := TopK(query, candidates, 2)
	if len(results) != 2 {
		t.Fatalf("want 2 results, got %d", len(results))
	}
	if results[0].ID != "closest" {
		t.Errorf("first result: want 'closest', got %q", results[0].ID)
	}
	if results[1].ID != "close" {
		t.Errorf("second result: want 'close', got %q", results[1].ID)
	}
}

func TestTopK_LimitExceedsCandidates(t *testing.T) {
	query := []float32{1, 0}
	candidates := []ScoredVector{
		{ID: "a", Vector: []float32{1, 0}},
	}
	results := TopK(query, candidates, 10)
	if len(results) != 1 {
		t.Fatalf("want 1 result, got %d", len(results))
	}
}

func TestTopK_ZeroK(t *testing.T) {
	results := TopK([]float32{1}, []ScoredVector{{ID: "a", Vector: []float32{1}}}, 0)
	if results != nil {
		t.Errorf("k=0: want nil, got %v", results)
	}
}

func TestTopK_EmptyCandidates(t *testing.T) {
	results := TopK([]float32{1}, nil, 5)
	if results != nil {
		t.Errorf("empty candidates: want nil, got %v", results)
	}
}

func TestNormalize(t *testing.T) {
	v := []float32{3, 4}
	Normalize(v)
	// Expected: [0.6, 0.8]
	if math.Abs(float64(v[0])-0.6) > 1e-6 || math.Abs(float64(v[1])-0.8) > 1e-6 {
		t.Errorf("Normalize([3,4]): want [0.6, 0.8], got %v", v)
	}
}

func TestNormalize_ZeroVector(t *testing.T) {
	v := []float32{0, 0, 0}
	Normalize(v)
	for i, x := range v {
		if x != 0 {
			t.Errorf("Normalize zero vector: index %d is %f, want 0", i, x)
		}
	}
}
