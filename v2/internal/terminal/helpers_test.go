// Run with: go test -race -v ./internal/terminal/...
// Author: Subash Karki
//
//go:build !windows

package terminal

import (
	"os"
	"strings"
	"testing"
)

func TestResolveShell(t *testing.T) {
	t.Parallel()

	shell := resolveShell()
	if shell == "" {
		t.Fatal("resolveShell() returned empty string")
	}

	// The returned path should exist (or be "sh" for PATH lookup).
	if shell != "sh" {
		if _, err := os.Stat(shell); err != nil {
			t.Fatalf("resolveShell() returned %q which does not exist: %v", shell, err)
		}
	}
}

func TestBuildCleanEnv(t *testing.T) {
	t.Parallel()

	env := buildCleanEnv()

	hasTerm := false
	hasLang := false
	hasElectron := false

	for _, kv := range env {
		switch {
		case kv == "TERM=xterm-256color":
			hasTerm = true
		case kv == "LANG=en_US.UTF-8":
			hasLang = true
		case strings.HasPrefix(kv, "ELECTRON_RUN_AS_NODE="):
			hasElectron = true
		}
	}

	if !hasTerm {
		t.Fatal("buildCleanEnv missing TERM=xterm-256color")
	}
	if !hasLang {
		t.Fatal("buildCleanEnv missing LANG=en_US.UTF-8")
	}
	if hasElectron {
		t.Fatal("buildCleanEnv should strip ELECTRON_RUN_AS_NODE")
	}
}

func TestEnsurePATH(t *testing.T) {
	t.Parallel()

	result := ensurePATH("PATH=/usr/bin:/bin")
	val := strings.TrimPrefix(result, "PATH=")

	if !strings.Contains(val, "/usr/local/bin") {
		t.Fatalf("ensurePATH missing /usr/local/bin; got: %s", val)
	}
	if !strings.Contains(val, "/opt/homebrew/bin") {
		t.Fatalf("ensurePATH missing /opt/homebrew/bin; got: %s", val)
	}
}

func TestEnsurePATH_AlreadyPresent(t *testing.T) {
	t.Parallel()

	original := "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
	result := ensurePATH(original)

	val := strings.TrimPrefix(result, "PATH=")

	// Count occurrences — should not be duplicated.
	homebrewCount := strings.Count(val, "/opt/homebrew/bin")
	localCount := strings.Count(val, "/usr/local/bin")

	if homebrewCount != 1 {
		t.Fatalf("/opt/homebrew/bin appears %d times, want 1; PATH=%s", homebrewCount, val)
	}
	if localCount != 1 {
		t.Fatalf("/usr/local/bin appears %d times, want 1; PATH=%s", localCount, val)
	}
}
