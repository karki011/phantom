// Author: Subash Karki
package embedding

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
)

// NewEmbedder creates the best available embedder for the current environment.
//
// When the ONNX model files and runtime shared library are both present it
// returns an ONNXEmbedder. Otherwise it returns a StubEmbedder that degrades
// gracefully (all Embed calls return ErrONNXNotAvailable).
func NewEmbedder() (Embedder, error) {
	modelDir, err := DefaultModelDir()
	if err != nil {
		slog.Warn("embedding: cannot resolve model dir", "err", err)
		return &StubEmbedder{}, nil
	}

	if !ModelExists(modelDir) {
		slog.Info("embedding: model not downloaded — using stub", "dir", modelDir)
		return &StubEmbedder{}, nil
	}

	ortLib, err := FindORTLibrary()
	if err != nil {
		slog.Info("embedding: ONNX Runtime not found — using stub", "err", err)
		return &StubEmbedder{}, nil
	}

	embedder, err := NewONNXEmbedder(modelDir, ortLib)
	if err != nil {
		slog.Warn("embedding: failed to init ONNX embedder — using stub", "err", err)
		return &StubEmbedder{}, nil
	}

	slog.Info("embedding: ONNX embedder active",
		"model", ModelName,
		"dims", Dimensions,
		"runtime", ortLib,
	)
	return embedder, nil
}

// FindORTLibrary searches for the ONNX Runtime shared library in well-known
// locations and returns the first valid path found.
//
// Search order:
//  1. ONNX_RUNTIME_LIB environment variable
//  2. ~/.phantom-os/lib/
//  3. Relative to executable (for .app bundles)
//  4. /usr/local/lib/
//  5. Homebrew prefix (/opt/homebrew/lib/ on ARM, /usr/local/lib/ on Intel)
func FindORTLibrary() (string, error) {
	libName := ortLibName()

	// 1. Explicit environment variable.
	if p := os.Getenv("ONNX_RUNTIME_LIB"); p != "" {
		if fileExistsNonEmpty(p) {
			return p, nil
		}
	}

	var candidates []string

	// 2. ~/.phantom-os/lib/
	if home, err := os.UserHomeDir(); err == nil {
		candidates = append(candidates,
			filepath.Join(home, ".phantom-os", "lib", libName),
		)
	}

	// 3. Relative to executable (inside .app bundle on macOS).
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates,
			filepath.Join(filepath.Dir(exe), "..", "Resources", libName),
			filepath.Join(filepath.Dir(exe), libName),
		)
	}

	// 4. Standard system paths.
	candidates = append(candidates,
		filepath.Join("/usr", "local", "lib", libName),
	)

	// 5. Homebrew (ARM macOS).
	if runtime.GOOS == "darwin" && runtime.GOARCH == "arm64" {
		candidates = append(candidates,
			filepath.Join("/opt", "homebrew", "lib", libName),
		)
	}

	for _, p := range candidates {
		if fileExistsNonEmpty(p) {
			return p, nil
		}
	}

	return "", fmt.Errorf(
		"%s not found; set ONNX_RUNTIME_LIB env var or place the library in ~/.phantom-os/lib/",
		libName,
	)
}

// ortLibName returns the platform-specific shared library filename.
func ortLibName() string {
	switch runtime.GOOS {
	case "windows":
		return "onnxruntime.dll"
	case "darwin":
		return "libonnxruntime.dylib"
	default:
		return "libonnxruntime.so"
	}
}
