// Author: Subash Karki
package embedding

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewEmbedder_NoModel(t *testing.T) {
	// When model files don't exist, NewEmbedder should return a StubEmbedder
	// that degrades gracefully instead of erroring.
	embedder, err := NewEmbedder()
	if err != nil {
		t.Fatalf("NewEmbedder should not error when model is missing: %v", err)
	}

	_, ok := embedder.(*StubEmbedder)
	if !ok {
		// On CI/environments with ONNX set up, we might get an ONNXEmbedder.
		// That's also acceptable — just skip the stub assertion.
		t.Skipf("got %T instead of *StubEmbedder (ONNX env may be configured)", embedder)
	}

	// StubEmbedder should return ErrONNXNotAvailable.
	_, embedErr := embedder.Embed("test")
	if embedErr != ErrONNXNotAvailable {
		t.Errorf("StubEmbedder.Embed: want ErrONNXNotAvailable, got %v", embedErr)
	}
}

func TestFindORTLibrary_EnvVar(t *testing.T) {
	// Create a temporary file to act as the library.
	dir := t.TempDir()
	libPath := filepath.Join(dir, "libonnxruntime.dylib")
	if err := os.WriteFile(libPath, []byte("fake-lib"), 0o644); err != nil {
		t.Fatalf("write fake lib: %v", err)
	}

	t.Setenv("ONNX_RUNTIME_LIB", libPath)

	got, err := FindORTLibrary()
	if err != nil {
		t.Fatalf("FindORTLibrary with env var: %v", err)
	}
	if got != libPath {
		t.Errorf("want %q, got %q", libPath, got)
	}
}

func TestFindORTLibrary_EnvVar_Missing(t *testing.T) {
	t.Setenv("ONNX_RUNTIME_LIB", "/nonexistent/path/libonnxruntime.dylib")

	// Should fall through to other candidates (which also don't exist).
	_, err := FindORTLibrary()
	if err == nil {
		t.Skip("ONNX Runtime found in a system path — cannot test missing case")
	}
}

func TestFindORTLibrary_NotFound(t *testing.T) {
	// Clear env var and verify it fails when lib doesn't exist anywhere.
	t.Setenv("ONNX_RUNTIME_LIB", "")

	_, err := FindORTLibrary()
	if err == nil {
		t.Skip("ONNX Runtime found in a system path — cannot test missing case")
	}
	// Just verify it returns a meaningful error.
	if err.Error() == "" {
		t.Error("FindORTLibrary: expected non-empty error message")
	}
}

func TestModelExists_False(t *testing.T) {
	dir := t.TempDir()
	if ModelExists(dir) {
		t.Error("ModelExists should be false for empty dir")
	}
}

func TestModelExists_True(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"model.onnx", "tokenizer.json"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("data"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	if !ModelExists(dir) {
		t.Error("ModelExists should be true when both files present")
	}
}

func TestModelExists_PartialFiles(t *testing.T) {
	dir := t.TempDir()
	// Only model.onnx present — should be false.
	if err := os.WriteFile(filepath.Join(dir, "model.onnx"), []byte("data"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if ModelExists(dir) {
		t.Error("ModelExists should be false with only model.onnx")
	}
}

func TestModelExists_EmptyFiles(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"model.onnx", "tokenizer.json"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte{}, 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	if ModelExists(dir) {
		t.Error("ModelExists should be false when files are empty")
	}
}

func TestOrtLibName(t *testing.T) {
	name := ortLibName()
	if name == "" {
		t.Error("ortLibName returned empty string")
	}
}

func TestNewONNXEmbedder_Stub_NoBuildTag(t *testing.T) {
	// Without the onnx build tag, NewONNXEmbedder should return an error.
	_, err := NewONNXEmbedder("/nonexistent", "/nonexistent")
	if err == nil {
		t.Skip("ONNX build tag is active — cannot test stub path")
	}
}
