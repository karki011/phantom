// Author: Subash Karki
package embedding

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCheckSetup_NothingInstalled(t *testing.T) {
	// Use a temp dir so nothing is found.
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	// Clear ONNX_RUNTIME_LIB so it doesn't find an existing install.
	t.Setenv("ONNX_RUNTIME_LIB", "")

	status := CheckSetup()

	if status.RuntimeAvailable {
		t.Error("expected RuntimeAvailable=false with empty HOME")
	}
	if status.ModelAvailable {
		t.Error("expected ModelAvailable=false with empty HOME")
	}
	if !status.NeedsDownload {
		t.Error("expected NeedsDownload=true")
	}
	if status.DownloadSizeMB != totalDownloadSizeMB {
		t.Errorf("expected DownloadSizeMB=%d, got %d", totalDownloadSizeMB, status.DownloadSizeMB)
	}
}

func TestCheckSetup_AllInstalled(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	// Create fake runtime library.
	libDir := filepath.Join(tmp, ".phantom-os", "lib")
	os.MkdirAll(libDir, 0o755)
	libPath := filepath.Join(libDir, ortLibName())
	os.WriteFile(libPath, []byte("fake-ort-lib-data"), 0o755)
	t.Setenv("ONNX_RUNTIME_LIB", libPath)

	// Create fake model files.
	modelDir := filepath.Join(tmp, ".phantom-os", "models", ModelName)
	os.MkdirAll(modelDir, 0o755)
	os.WriteFile(filepath.Join(modelDir, "model.onnx"), []byte("fake-model"), 0o644)
	os.WriteFile(filepath.Join(modelDir, "tokenizer.json"), []byte("fake-tokenizer"), 0o644)

	status := CheckSetup()

	if !status.RuntimeAvailable {
		t.Error("expected RuntimeAvailable=true")
	}
	if !status.ModelAvailable {
		t.Error("expected ModelAvailable=true")
	}
	if status.NeedsDownload {
		t.Error("expected NeedsDownload=false when everything is installed")
	}
	if status.DownloadSizeMB != 0 {
		t.Errorf("expected DownloadSizeMB=0, got %d", status.DownloadSizeMB)
	}
}

func TestCheckSetup_PartialInstall(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	// Create fake runtime library but NO model.
	libDir := filepath.Join(tmp, ".phantom-os", "lib")
	os.MkdirAll(libDir, 0o755)
	libPath := filepath.Join(libDir, ortLibName())
	os.WriteFile(libPath, []byte("fake-ort-lib-data"), 0o755)
	t.Setenv("ONNX_RUNTIME_LIB", libPath)

	status := CheckSetup()

	if !status.RuntimeAvailable {
		t.Error("expected RuntimeAvailable=true")
	}
	if status.ModelAvailable {
		t.Error("expected ModelAvailable=false (no model files)")
	}
	if !status.NeedsDownload {
		t.Error("expected NeedsDownload=true (model missing)")
	}
	// Only model + tokenizer size should be counted.
	expectedMB := modelDownloadSizeMB + tokDownloadSizeMB
	if status.DownloadSizeMB != expectedMB {
		t.Errorf("expected DownloadSizeMB=%d, got %d", expectedMB, status.DownloadSizeMB)
	}
}

func TestEnsureAll_AlreadyExists(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	// Create fake runtime library.
	libDir := filepath.Join(tmp, ".phantom-os", "lib")
	os.MkdirAll(libDir, 0o755)
	libPath := filepath.Join(libDir, ortLibName())
	os.WriteFile(libPath, []byte("fake-ort-lib-data"), 0o755)
	t.Setenv("ONNX_RUNTIME_LIB", libPath)

	// Create fake model files.
	modelDir := filepath.Join(tmp, ".phantom-os", "models", ModelName)
	os.MkdirAll(modelDir, 0o755)
	os.WriteFile(filepath.Join(modelDir, "model.onnx"), []byte("fake-model"), 0o644)
	os.WriteFile(filepath.Join(modelDir, "tokenizer.json"), []byte("fake-tokenizer"), 0o644)

	// EnsureAll should be a no-op (no network calls).
	err := EnsureAll()
	if err != nil {
		t.Fatalf("EnsureAll with everything present should succeed, got: %v", err)
	}
}

func TestOrtDownloadURL(t *testing.T) {
	url, err := ortDownloadURL()
	if err != nil {
		t.Skipf("no download URL for this platform: %v", err)
	}
	if url == "" {
		t.Error("expected non-empty URL")
	}
	if !contains(url, ortVersion) {
		t.Errorf("expected URL to contain version %s, got: %s", ortVersion, url)
	}
}

func TestVersionedLibName(t *testing.T) {
	name := versionedLibName()
	if name == "" {
		t.Error("expected non-empty versioned lib name")
	}
	if !contains(name, ortVersion) {
		t.Errorf("expected versioned lib name to contain %s, got: %s", ortVersion, name)
	}
}

// contains checks if s contains substr.
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
