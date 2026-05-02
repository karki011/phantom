// Author: Subash Karki
//go:build onnx

package embedding

import (
	"fmt"
	"path/filepath"
	"sync"

	"github.com/daulet/tokenizers"
	ort "github.com/yalue/onnxruntime_go"
)

// ONNXEmbedder produces 384-dim embeddings using the all-MiniLM-L6-v2 ONNX
// model and a HuggingFace tokenizer. The ONNX Runtime session is not
// thread-safe, so all inference is serialised with a mutex.
type ONNXEmbedder struct {
	mu        sync.Mutex
	session   *ort.DynamicAdvancedSession
	tokenizer *tokenizers.Tokenizer
	dims      int
}

// NewONNXEmbedder loads the ONNX model and tokenizer from modelDir and
// initialises the ONNX Runtime using the shared library at ortLibPath.
//
// The caller must call Close() when the embedder is no longer needed.
func NewONNXEmbedder(modelDir, ortLibPath string) (*ONNXEmbedder, error) {
	ort.SetSharedLibraryPath(ortLibPath)
	if !ort.IsInitialized() {
		if err := ort.InitializeEnvironment(); err != nil {
			return nil, fmt.Errorf("onnx: init environment: %w", err)
		}
	}

	tk, err := tokenizers.FromFile(filepath.Join(modelDir, "tokenizer.json"))
	if err != nil {
		return nil, fmt.Errorf("onnx: load tokenizer: %w", err)
	}

	modelPath := filepath.Join(modelDir, "model.onnx")
	inputNames := []string{"input_ids", "attention_mask", "token_type_ids"}
	outputNames := []string{"token_embeddings"}

	session, err := ort.NewDynamicAdvancedSession(
		modelPath,
		inputNames,
		outputNames,
		nil, // default SessionOptions
	)
	if err != nil {
		tk.Close()
		return nil, fmt.Errorf("onnx: create session: %w", err)
	}

	return &ONNXEmbedder{
		session:   session,
		tokenizer: tk,
		dims:      Dimensions,
	}, nil
}

// Embed tokenises text and runs ONNX inference, returning a mean-pooled,
// L2-normalised 384-dim vector.
func (e *ONNXEmbedder) Embed(text string) ([]float32, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	// Tokenize with all attributes we need for the model.
	enc := e.tokenizer.EncodeWithOptions(
		text,
		true, // add special tokens ([CLS], [SEP])
		tokenizers.WithReturnTypeIDs(),
		tokenizers.WithReturnAttentionMask(),
	)

	seqLen := int64(len(enc.IDs))
	if seqLen == 0 {
		return make([]float32, e.dims), nil
	}

	// Convert uint32 token data to int64 (ONNX expects int64 for BERT-like
	// models).
	inputIDs := toInt64(enc.IDs)
	attMask := toInt64(enc.AttentionMask)
	typeIDs := toInt64(enc.TypeIDs)

	shape := ort.NewShape(1, seqLen)

	tInputIDs, err := ort.NewTensor(shape, inputIDs)
	if err != nil {
		return nil, fmt.Errorf("onnx: tensor input_ids: %w", err)
	}
	defer tInputIDs.Destroy()

	tAttMask, err := ort.NewTensor(shape, attMask)
	if err != nil {
		return nil, fmt.Errorf("onnx: tensor attention_mask: %w", err)
	}
	defer tAttMask.Destroy()

	tTypeIDs, err := ort.NewTensor(shape, typeIDs)
	if err != nil {
		return nil, fmt.Errorf("onnx: tensor token_type_ids: %w", err)
	}
	defer tTypeIDs.Destroy()

	// Output tensor: [1, seqLen, 384]
	outShape := ort.NewShape(1, seqLen, int64(e.dims))
	tOutput, err := ort.NewEmptyTensor[float32](outShape)
	if err != nil {
		return nil, fmt.Errorf("onnx: tensor output: %w", err)
	}
	defer tOutput.Destroy()

	inputs := []ort.Value{tInputIDs, tAttMask, tTypeIDs}
	outputs := []ort.Value{tOutput}

	if err := e.session.Run(inputs, outputs); err != nil {
		return nil, fmt.Errorf("onnx: run inference: %w", err)
	}

	// Mean pooling with attention mask.
	raw := tOutput.GetData() // flat [1 * seqLen * dims]
	embedding := meanPool(raw, attMask, int(seqLen), e.dims)

	return Normalize(embedding), nil
}

// EmbedBatch embeds each text sequentially. Batched ONNX inference with
// dynamic sequence lengths adds considerable complexity for minimal gain at
// our expected scale.
func (e *ONNXEmbedder) EmbedBatch(texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i, t := range texts {
		vec, err := e.Embed(t)
		if err != nil {
			return nil, fmt.Errorf("onnx: batch embed [%d]: %w", i, err)
		}
		out[i] = vec
	}
	return out, nil
}

// Dimensions returns the embedding vector length (384).
func (e *ONNXEmbedder) Dimensions() int { return e.dims }

// Close releases the ONNX session, tokenizer, and runtime environment.
func (e *ONNXEmbedder) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.session != nil {
		if err := e.session.Destroy(); err != nil {
			return fmt.Errorf("onnx: destroy session: %w", err)
		}
		e.session = nil
	}
	if e.tokenizer != nil {
		e.tokenizer.Close()
		e.tokenizer = nil
	}
	return nil
}

// --- helpers ---

// toInt64 converts a uint32 slice to int64 (ONNX BERT inputs use int64).
func toInt64(u []uint32) []int64 {
	out := make([]int64, len(u))
	for i, v := range u {
		out[i] = int64(v)
	}
	return out
}

// meanPool computes attention-weighted mean pooling over token embeddings.
//
//	output shape: [1, seqLen, dims] (flattened)
//	For each dimension d:
//	  embedding[d] = sum(output[t][d] * attMask[t]) / sum(attMask[t])
func meanPool(output []float32, attMask []int64, seqLen, dims int) []float32 {
	embedding := make([]float32, dims)

	var maskSum float32
	for t := 0; t < seqLen; t++ {
		mask := float32(attMask[t])
		maskSum += mask
		offset := t * dims
		for d := 0; d < dims; d++ {
			embedding[d] += output[offset+d] * mask
		}
	}

	if maskSum > 0 {
		for d := range embedding {
			embedding[d] /= maskSum
		}
	}

	return embedding
}
