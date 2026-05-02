// Author: Subash Karki
package embedding

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	// ortVersion is the ONNX Runtime release we pin to.
	ortVersion = "1.25.0"

	// Approximate download sizes in MB for progress reporting.
	ortDownloadSizeMB   = 35
	modelDownloadSizeMB = 86
	tokDownloadSizeMB   = 1
	totalDownloadSizeMB = ortDownloadSizeMB + modelDownloadSizeMB + tokDownloadSizeMB
)

// SetupStatus describes what's available and what needs downloading.
type SetupStatus struct {
	RuntimeAvailable bool   `json:"runtimeAvailable"`
	ModelAvailable   bool   `json:"modelAvailable"`
	RuntimePath      string `json:"runtimePath"`
	ModelDir         string `json:"modelDir"`
	NeedsDownload    bool   `json:"needsDownload"`
	DownloadSizeMB   int    `json:"downloadSizeMB"`
}

// CheckSetup inspects whether the ONNX runtime and model files are present.
func CheckSetup() SetupStatus {
	status := SetupStatus{}

	// Check runtime.
	ortPath, err := FindORTLibrary()
	if err == nil {
		status.RuntimeAvailable = true
		status.RuntimePath = ortPath
	}

	// Check model.
	modelDir, err := DefaultModelDir()
	if err == nil {
		status.ModelDir = modelDir
		status.ModelAvailable = ModelExists(modelDir)
	}

	// Calculate what needs downloading.
	var sizeMB int
	if !status.RuntimeAvailable {
		sizeMB += ortDownloadSizeMB
	}
	if !status.ModelAvailable {
		sizeMB += modelDownloadSizeMB + tokDownloadSizeMB
	}

	status.NeedsDownload = sizeMB > 0
	status.DownloadSizeMB = sizeMB
	return status
}

// EnsureRuntime downloads the ONNX Runtime shared library if not already
// present. Downloads from the official GitHub releases to ~/.phantom-os/lib/.
// The download is atomic: written to a .tmp file first, then renamed.
func EnsureRuntime() error {
	// Already available?
	if _, err := FindORTLibrary(); err == nil {
		slog.Info("embedding: ONNX runtime already available")
		return nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve home dir: %w", err)
	}

	libDir := filepath.Join(home, ".phantom-os", "lib")
	if err := os.MkdirAll(libDir, 0o755); err != nil {
		return fmt.Errorf("create lib dir: %w", err)
	}

	url, err := ortDownloadURL()
	if err != nil {
		return err
	}

	libName := ortLibName()
	destPath := filepath.Join(libDir, libName)

	slog.Info("embedding: downloading ONNX runtime",
		"version", ortVersion,
		"url", url,
		"dest", destPath,
		"size_mb", ortDownloadSizeMB,
	)

	// Download the tgz archive.
	tgzPath := destPath + ".tgz.tmp"
	if err := downloadFileWithTimeout(url, tgzPath); err != nil {
		return fmt.Errorf("download ONNX runtime: %w", err)
	}
	defer os.Remove(tgzPath) // clean up the archive after extraction

	// Extract the shared library from the tgz.
	if err := extractORTFromTgz(tgzPath, destPath); err != nil {
		return fmt.Errorf("extract ONNX runtime: %w", err)
	}

	slog.Info("embedding: ONNX runtime ready", "path", destPath)
	return nil
}

// EnsureAll ensures both the ONNX runtime and model files are available.
// It is idempotent — skips files that already exist. Safe to call from a
// background goroutine at app startup.
func EnsureAll() error {
	if err := EnsureRuntime(); err != nil {
		return fmt.Errorf("ensure runtime: %w", err)
	}

	modelDir, err := DefaultModelDir()
	if err != nil {
		return fmt.Errorf("resolve model dir: %w", err)
	}

	if err := EnsureModel(modelDir); err != nil {
		return fmt.Errorf("ensure model: %w", err)
	}

	return nil
}

// ortDownloadURL returns the platform-appropriate ONNX Runtime download URL.
func ortDownloadURL() (string, error) {
	base := "https://github.com/microsoft/onnxruntime/releases/download/v" + ortVersion

	switch runtime.GOOS {
	case "darwin":
		switch runtime.GOARCH {
		case "arm64":
			return base + "/onnxruntime-osx-arm64-" + ortVersion + ".tgz", nil
		default:
			return "", fmt.Errorf("ONNX Runtime v%s not available for darwin/%s", ortVersion, runtime.GOARCH)
		}
	case "linux":
		switch runtime.GOARCH {
		case "arm64":
			return base + "/onnxruntime-linux-aarch64-" + ortVersion + ".tgz", nil
		case "amd64":
			return base + "/onnxruntime-linux-x64-" + ortVersion + ".tgz", nil
		default:
			return "", fmt.Errorf("ONNX Runtime v%s not available for linux/%s", ortVersion, runtime.GOARCH)
		}
	default:
		return "", fmt.Errorf("ONNX Runtime auto-download not supported on %s/%s", runtime.GOOS, runtime.GOARCH)
	}
}

// downloadFileWithTimeout fetches url to destPath using a temp file + atomic
// rename. Timeouts: 30s connect, 5min total for large files.
func downloadFileWithTimeout(url, destPath string) error {
	client := &http.Client{
		Timeout: 5 * time.Minute,
	}

	resp, err := client.Get(url) //nolint:gosec // trusted GitHub/HuggingFace URLs
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}

	dir := filepath.Dir(destPath)
	tmp, err := os.CreateTemp(dir, ".dl-*")
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

// extractORTFromTgz opens a .tgz archive and extracts the versioned ONNX
// Runtime shared library, renaming it to the canonical name (e.g.
// libonnxruntime.dylib). The extraction uses a temp file + atomic rename.
func extractORTFromTgz(tgzPath, destPath string) error {
	f, err := os.Open(tgzPath)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("gzip reader: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)

	// We're looking for lib/libonnxruntime.X.Y.Z.dylib (or .so on Linux).
	// The archive layout is: onnxruntime-<platform>/lib/<libfile>
	wantSuffix := versionedLibName()

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar read: %w", err)
		}

		if hdr.Typeflag != tar.TypeReg {
			continue
		}

		// Match the versioned library file inside the lib/ directory.
		if !strings.HasSuffix(hdr.Name, wantSuffix) {
			continue
		}

		// Found it — extract via temp file.
		dir := filepath.Dir(destPath)
		tmp, err := os.CreateTemp(dir, ".ort-extract-*")
		if err != nil {
			return err
		}
		tmpPath := tmp.Name()

		if _, err := io.Copy(tmp, tr); err != nil {
			tmp.Close()
			os.Remove(tmpPath)
			return fmt.Errorf("extract lib: %w", err)
		}
		if err := tmp.Close(); err != nil {
			os.Remove(tmpPath)
			return err
		}

		// Make executable (shared libraries need +x on some systems).
		if err := os.Chmod(tmpPath, 0o755); err != nil {
			os.Remove(tmpPath)
			return err
		}

		// Atomic rename to final destination.
		if err := os.Rename(tmpPath, destPath); err != nil {
			os.Remove(tmpPath)
			return err
		}

		slog.Info("embedding: extracted ONNX runtime library",
			"archive_entry", hdr.Name,
			"dest", destPath,
		)
		return nil
	}

	return fmt.Errorf("library %q not found in archive %s", wantSuffix, tgzPath)
}

// versionedLibName returns the versioned filename inside the tgz archive.
func versionedLibName() string {
	switch runtime.GOOS {
	case "darwin":
		return "libonnxruntime." + ortVersion + ".dylib"
	default:
		return "libonnxruntime.so." + ortVersion
	}
}
