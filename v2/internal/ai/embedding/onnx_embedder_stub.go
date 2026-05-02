// Author: Subash Karki
//go:build !onnx

package embedding

import "fmt"

// ONNXEmbedder is a placeholder when built without the "onnx" build tag.
// The real implementation lives in onnx_embedder.go (guarded by //go:build onnx).
type ONNXEmbedder struct{}

// NewONNXEmbedder returns an error when the ONNX build tag is not set.
func NewONNXEmbedder(_, _ string) (*ONNXEmbedder, error) {
	return nil, fmt.Errorf("ONNX support not compiled; rebuild with: go build -tags onnx")
}

func (e *ONNXEmbedder) Embed(_ string) ([]float32, error)        { return nil, ErrONNXNotAvailable }
func (e *ONNXEmbedder) EmbedBatch(_ []string) ([][]float32, error) { return nil, ErrONNXNotAvailable }
func (e *ONNXEmbedder) Dimensions() int                           { return Dimensions }
func (e *ONNXEmbedder) Close() error                              { return nil }
