// Author: Subash Karki
package embedding

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
)

const (
	// ModelName is the HuggingFace model identifier.
	ModelName = "all-MiniLM-L6-v2"

	modelONNXURL     = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx"
	tokenizerJSONURL = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json"
)

// DefaultModelDir returns ~/.phantom-os/models/all-MiniLM-L6-v2.
func DefaultModelDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".phantom-os", "models", ModelName), nil
}

// ModelExists returns true when both model.onnx and tokenizer.json are present
// in modelDir.
func ModelExists(modelDir string) bool {
	for _, name := range []string{"model.onnx", "tokenizer.json"} {
		info, err := os.Stat(filepath.Join(modelDir, name))
		if err != nil || info.Size() == 0 {
			return false
		}
	}
	return true
}

// EnsureModel downloads model.onnx and tokenizer.json from HuggingFace into
// modelDir if they don't already exist. It is safe to call concurrently — the
// worst case is a redundant download that overwrites an identical file.
func EnsureModel(modelDir string) error {
	if ModelExists(modelDir) {
		return nil
	}

	if err := os.MkdirAll(modelDir, 0o755); err != nil {
		return fmt.Errorf("create model dir: %w", err)
	}

	downloads := []struct {
		url  string
		dest string
	}{
		{modelONNXURL, filepath.Join(modelDir, "model.onnx")},
		{tokenizerJSONURL, filepath.Join(modelDir, "tokenizer.json")},
	}

	for _, dl := range downloads {
		if fileExistsNonEmpty(dl.dest) {
			slog.Info("embedding: model file already present", "path", dl.dest)
			continue
		}
		slog.Info("embedding: downloading model file", "url", dl.url, "dest", dl.dest)
		if err := downloadFile(dl.url, dl.dest); err != nil {
			return fmt.Errorf("download %s: %w", dl.url, err)
		}
	}
	return nil
}

// downloadFile fetches url into destPath via a temporary file + rename to
// avoid partial-write corruption.
func downloadFile(url, destPath string) error {
	resp, err := http.Get(url) //nolint:gosec // trusted HuggingFace URL
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}

	tmp, err := os.CreateTemp(filepath.Dir(destPath), ".dl-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}

	// Atomic rename.
	if err := os.Rename(tmpPath, destPath); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

// fileExistsNonEmpty returns true when path exists and has size > 0.
func fileExistsNonEmpty(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Size() > 0
}
