// Author: Subash Karki
package embedding

import (
	"fmt"
	"math"
)

// Dimensions is the output dimensionality for all-MiniLM-L6-v2.
const Dimensions = 384

// Embedder produces dense vector embeddings from text.
type Embedder interface {
	// Embed returns a normalized embedding for a single text input.
	Embed(text string) ([]float32, error)
	// EmbedBatch returns normalized embeddings for multiple texts.
	EmbedBatch(texts []string) ([][]float32, error)
	// Dimensions returns the embedding vector length.
	Dimensions() int
	// Close releases underlying resources (ONNX session, tokenizer).
	Close() error
}

// ErrONNXNotAvailable is returned by the stub embedder when native ONNX
// runtime libraries are not linked.
var ErrONNXNotAvailable = fmt.Errorf("ONNX runtime not available — build with CGO or use a stub")

// StubEmbedder implements Embedder but returns ErrONNXNotAvailable for all
// operations. This allows the rest of the system to compile and degrade
// gracefully when native ONNX/tokenizer libraries aren't present.
type StubEmbedder struct{}

func (s *StubEmbedder) Embed(_ string) ([]float32, error)        { return nil, ErrONNXNotAvailable }
func (s *StubEmbedder) EmbedBatch(_ []string) ([][]float32, error) { return nil, ErrONNXNotAvailable }
func (s *StubEmbedder) Dimensions() int                           { return Dimensions }
func (s *StubEmbedder) Close() error                              { return nil }

// Normalize L2-normalizes a vector in place and returns it.
// A zero vector is returned unchanged.
func Normalize(v []float32) []float32 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if sum == 0 {
		return v
	}
	norm := float32(math.Sqrt(sum))
	for i := range v {
		v[i] /= norm
	}
	return v
}
