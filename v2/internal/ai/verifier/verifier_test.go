// Package verifier tests
//
// Author: Subash Karki
package verifier

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestDetectProjectType(t *testing.T) {
	tests := []struct {
		name     string
		marker   string
		expected string
	}{
		{name: "typescript project", marker: "package.json", expected: "typescript"},
		{name: "go project", marker: "go.mod", expected: "go"},
		{name: "rust project", marker: "Cargo.toml", expected: "rust"},
		{name: "python project", marker: "pyproject.toml", expected: "python"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.WriteFile(filepath.Join(dir, tt.marker), []byte("{}"), 0644); err != nil {
				t.Fatalf("failed to create marker: %v", err)
			}

			got := DetectProjectType(dir)
			if got != tt.expected {
				t.Errorf("DetectProjectType() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestDetectProjectType_Unknown(t *testing.T) {
	dir := t.TempDir()
	got := DetectProjectType(dir)
	if got != "" {
		t.Errorf("DetectProjectType() = %q, want empty string for unknown project", got)
	}
}

func TestFindProjectRoot(t *testing.T) {
	// Create a temp dir with package.json at the root and a nested file
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "package.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to create package.json: %v", err)
	}

	nested := filepath.Join(root, "src", "components")
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatalf("failed to create nested dir: %v", err)
	}

	filePath := filepath.Join(nested, "button.tsx")
	if err := os.WriteFile(filePath, []byte("export {}"), 0644); err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	got := FindProjectRoot(filePath)
	if got != root {
		t.Errorf("FindProjectRoot() = %q, want %q", got, root)
	}
}

func TestFindProjectRoot_NotFound(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "orphan.txt")
	if err := os.WriteFile(filePath, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	got := FindProjectRoot(filePath)
	if got != "" {
		t.Errorf("FindProjectRoot() = %q, want empty string", got)
	}
}

func TestResolveVerifyRoot_RootMarker(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("write marker: %v", err)
	}

	gotDir, gotType := ResolveVerifyRoot(dir)
	if gotDir != dir {
		t.Errorf("dir = %q, want %q", gotDir, dir)
	}
	if gotType != "typescript" {
		t.Errorf("type = %q, want %q", gotType, "typescript")
	}
}

func TestResolveVerifyRoot_MonorepoChildMarker(t *testing.T) {
	// Mirrors the ai-collector layout: no marker at root, but proxy/go.mod
	// and tap/go.mod live one level down. The verifier must find one of them
	// rather than reporting verifier_unavailable.
	root := t.TempDir()
	proxy := filepath.Join(root, "proxy")
	if err := os.MkdirAll(proxy, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(proxy, "go.mod"), []byte("module x\n"), 0644); err != nil {
		t.Fatalf("write marker: %v", err)
	}

	gotDir, gotType := ResolveVerifyRoot(root)
	if gotDir != proxy {
		t.Errorf("dir = %q, want %q", gotDir, proxy)
	}
	if gotType != "go" {
		t.Errorf("type = %q, want %q", gotType, "go")
	}
}

func TestResolveVerifyRoot_SkipsHiddenDirs(t *testing.T) {
	// `.git/` and similar should never be picked as a verify root, even if
	// they happened to contain a marker file (defensive — keeps behaviour
	// predictable).
	root := t.TempDir()
	hidden := filepath.Join(root, ".git")
	if err := os.MkdirAll(hidden, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(hidden, "go.mod"), []byte("module x\n"), 0644); err != nil {
		t.Fatalf("write marker: %v", err)
	}

	gotDir, gotType := ResolveVerifyRoot(root)
	if gotDir != "" || gotType != "" {
		t.Errorf("expected no resolution, got dir=%q type=%q", gotDir, gotType)
	}
}

func TestResolveVerifyRoot_UnknownReturnsEmpty(t *testing.T) {
	root := t.TempDir()
	gotDir, gotType := ResolveVerifyRoot(root)
	if gotDir != "" || gotType != "" {
		t.Errorf("expected empty, got dir=%q type=%q", gotDir, gotType)
	}
}

func TestVerify_UnknownProject(t *testing.T) {
	dir := t.TempDir()
	result := Verify(context.Background(), dir)

	if !result.AllPassed {
		t.Error("expected AllPassed=true for unknown project type")
	}
	if len(result.Results) != 0 {
		t.Errorf("expected empty results, got %d", len(result.Results))
	}
	if result.Timestamp == "" {
		t.Error("expected non-empty timestamp")
	}
}
