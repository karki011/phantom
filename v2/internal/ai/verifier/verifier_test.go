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
