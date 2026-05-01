// Tests for ResolveBinary fallback behaviour.
// Author: Subash Karki

package provider

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveBinary_FallbackToBinaryPaths(t *testing.T) {
	// Create a fake binary in a temp dir that won't be on PATH.
	tmp := t.TempDir()
	fakeBin := filepath.Join(tmp, "fake-cli")
	if err := os.WriteFile(fakeBin, []byte("#!/bin/sh\necho fake\n"), 0o755); err != nil {
		t.Fatalf("create fake binary: %v", err)
	}

	p := &ConfigProvider{
		Cfg: &ProviderConfig{
			Provider: "fake",
			Detection: DetectionConfig{
				Binary:      "this-binary-does-not-exist-on-path-12345",
				BinaryPaths: []string{fakeBin},
			},
		},
	}

	got, ok := p.ResolveBinary()
	if !ok {
		t.Fatal("expected ResolveBinary to fall back to BinaryPaths")
	}
	if got != fakeBin {
		t.Errorf("expected %q, got %q", fakeBin, got)
	}
}

func TestResolveBinary_ReturnsFalseWhenNothingFound(t *testing.T) {
	p := &ConfigProvider{
		Cfg: &ProviderConfig{
			Provider: "fake",
			Detection: DetectionConfig{
				Binary:      "this-binary-does-not-exist-on-path-12345",
				BinaryPaths: []string{"/nonexistent/path/to/cli"},
			},
		},
	}

	if _, ok := p.ResolveBinary(); ok {
		t.Error("expected ResolveBinary to return false when binary not found anywhere")
	}
}

func TestResolveBinary_PrefersPATHOverFallbacks(t *testing.T) {
	// `sh` is on PATH on every supported platform — use it as a known-good binary.
	p := &ConfigProvider{
		Cfg: &ProviderConfig{
			Provider: "test",
			Detection: DetectionConfig{
				Binary:      "sh",
				BinaryPaths: []string{"/should/not/be/used/sh"},
			},
		},
	}

	got, ok := p.ResolveBinary()
	if !ok {
		t.Fatal("expected sh to resolve")
	}
	if got == "/should/not/be/used/sh" {
		t.Errorf("expected PATH lookup to win, got fallback %q", got)
	}
}
