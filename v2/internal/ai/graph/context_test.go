// context_test.go tests the graph context provider.
// Author: Subash Karki
package graph

import (
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/project"
)

func TestFormatProjectProfile(t *testing.T) {
	p := project.Profile{
		Type:       project.TypeGo,
		BuildSystem: "go",
		PackageMgr:  "go",
		Recipes: []project.Recipe{
			{Label: "Go Build", Command: "go build ./...", Category: project.CategoryBuild},
			{Label: "Go Test", Command: "go test ./...", Category: project.CategoryTest},
			{Label: "Go Vet", Command: "go vet ./...", Category: project.CategoryLint},
		},
		EnvNeeds: []string{"go"},
		Detected: true,
	}

	result := formatProjectProfile(p)

	if result == "" {
		t.Fatal("expected non-empty result")
	}
	if !contains(result, "Type: go") {
		t.Error("expected project type in output")
	}
	if !contains(result, "Build: go") {
		t.Error("expected build system in output")
	}
	if !contains(result, "Go Build") {
		t.Error("expected build recipe in output")
	}
	if !contains(result, "Go Test") {
		t.Error("expected test recipe in output")
	}
}

func TestFormatRecentFiles(t *testing.T) {
	files := []string{"main.go", "internal/app/app.go", "go.mod"}
	result := formatRecentFiles(files)

	if result == "" {
		t.Fatal("expected non-empty result")
	}
	if !contains(result, "Recently Touched Files") {
		t.Error("expected header in output")
	}
	if !contains(result, "main.go") {
		t.Error("expected file in output")
	}
}

func TestMaxContextChars(t *testing.T) {
	if MaxContextChars != 8000 {
		t.Errorf("expected MaxContextChars=8000, got %d", MaxContextChars)
	}
}

func TestLastPathComponent(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"/Users/foo/bar/main.go", "main.go"},
		{"main.go", "main.go"},
		{"/single", "single"},
		{"", ""},
	}

	for _, tt := range tests {
		got := lastPathComponent(tt.input)
		if got != tt.want {
			t.Errorf("lastPathComponent(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
