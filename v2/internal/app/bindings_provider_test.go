// bindings_provider_test.go — tests for provider binding helpers.
//
// Tests config view conversion, patch application, builtin checks,
// and validation logic. Does not require Wails runtime.
//
// Author: Subash Karki
package app

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// ---------------------------------------------------------------------------
// buildConfigView
// ---------------------------------------------------------------------------

func TestBuildConfigView_Commands(t *testing.T) {
	cfg := &provider.ProviderConfig{
		Commands: provider.CommandsConfig{
			Resume:          "tool --resume --session-id ${SESSION_ID}",
			NewSession:      "tool --new",
			AIGenerate:      "tool -p '${PROMPT}'",
			PromptTransport: "argv",
		},
	}

	view := buildConfigView(cfg)

	assertEqual(t, "resume", view.Commands.Resume, cfg.Commands.Resume)
	assertEqual(t, "new_session", view.Commands.NewSession, cfg.Commands.NewSession)
	assertEqual(t, "ai_generate", view.Commands.AIGenerate, cfg.Commands.AIGenerate)
	assertEqual(t, "prompt_transport", view.Commands.PromptTransport, "argv")
}

func TestBuildConfigView_Pricing(t *testing.T) {
	cfg := &provider.ProviderConfig{
		Pricing: provider.PricingConfig{
			DefaultTier: "standard",
			Tiers: map[string]provider.PriceTier{
				"standard": {
					Match:          "standard",
					InputPerM:      3.0,
					OutputPerM:     15.0,
					CacheReadPerM:  0.30,
					CacheWritePerM: 3.75,
				},
			},
		},
	}

	view := buildConfigView(cfg)

	assertEqual(t, "default_tier", view.Pricing.DefaultTier, "standard")
	tier, ok := view.Pricing.Tiers["standard"]
	if !ok {
		t.Fatal("expected standard tier in view")
	}
	assertFloat(t, "input_per_m", tier.InputPerM, 3.0)
	assertFloat(t, "output_per_m", tier.OutputPerM, 15.0)
	assertFloat(t, "cache_read_per_m", tier.CacheReadPerM, 0.30)
	assertFloat(t, "cache_write_per_m", tier.CacheWritePerM, 3.75)
}

func TestBuildConfigView_Paths(t *testing.T) {
	cfg := &provider.ProviderConfig{
		Paths: provider.PathsConfig{
			Sessions:      "~/.tool/sessions/",
			Conversations: "~/.tool/conversations/",
			Settings:      "~/.tool/settings.json",
			Todos:         "~/.tool/todos/",
			Tasks:         "~/.tool/tasks/",
			Context:       "~/.phantom-os/context/tool/",
		},
	}

	view := buildConfigView(cfg)

	assertEqual(t, "sessions", view.Paths.Sessions, cfg.Paths.Sessions)
	assertEqual(t, "conversations", view.Paths.Conversations, cfg.Paths.Conversations)
	assertEqual(t, "settings", view.Paths.Settings, cfg.Paths.Settings)
}

func TestBuildConfigView_Detection(t *testing.T) {
	cfg := &provider.ProviderConfig{
		Detection: provider.DetectionConfig{
			Binary:         "mytool",
			VersionPattern: `v(\d+\.\d+\.\d+)`,
		},
	}

	view := buildConfigView(cfg)

	assertEqual(t, "binary", view.Detection.Binary, "mytool")
	assertEqual(t, "version_pattern", view.Detection.VersionPattern, `v(\d+\.\d+\.\d+)`)
}

func TestBuildConfigView_EmptyPricing(t *testing.T) {
	cfg := &provider.ProviderConfig{}
	view := buildConfigView(cfg)

	if view.Pricing.Tiers == nil {
		t.Fatal("expected non-nil tiers map even when empty")
	}
	assertEqual(t, "tiers len", len(view.Pricing.Tiers), 0)
}

// ---------------------------------------------------------------------------
// applyPatch
// ---------------------------------------------------------------------------

func TestApplyPatch_Enabled(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test", Enabled_: false}
	applyPatch(cfg, map[string]any{"enabled": true})
	assertEqual(t, "enabled", cfg.Enabled_, true)

	applyPatch(cfg, map[string]any{"enabled": false})
	assertEqual(t, "disabled", cfg.Enabled_, false)
}

func TestApplyPatch_DisplayName(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test", DisplayName_: "Old"}
	applyPatch(cfg, map[string]any{"display_name": "New Name"})
	assertEqual(t, "display_name", cfg.DisplayName_, "New Name")
}

func TestApplyPatch_Icon(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test", Icon_: "old-icon"}
	applyPatch(cfg, map[string]any{"icon": "new-icon"})
	assertEqual(t, "icon", cfg.Icon_, "new-icon")
}

func TestApplyPatch_Commands(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test"}
	applyPatch(cfg, map[string]any{
		"commands": map[string]any{
			"resume":           "tool --resume ${SESSION_ID}",
			"new_session":      "tool --new",
			"prompt_transport": "stdin",
		},
	})

	assertEqual(t, "resume", cfg.Commands.Resume, "tool --resume ${SESSION_ID}")
	assertEqual(t, "new_session", cfg.Commands.NewSession, "tool --new")
	assertEqual(t, "prompt_transport", cfg.Commands.PromptTransport, "stdin")
}

func TestApplyPatch_Detection(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test"}
	applyPatch(cfg, map[string]any{
		"detection": map[string]any{
			"binary": "newtool",
		},
	})

	assertEqual(t, "binary", cfg.Detection.Binary, "newtool")
}

func TestApplyPatch_Paths(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test"}
	applyPatch(cfg, map[string]any{
		"paths": map[string]any{
			"sessions": "~/.newtool/sessions/",
			"settings": "~/.newtool/settings.json",
		},
	})

	assertEqual(t, "sessions", cfg.Paths.Sessions, "~/.newtool/sessions/")
	assertEqual(t, "settings", cfg.Paths.Settings, "~/.newtool/settings.json")
}

func TestApplyPatch_PricingDefaultTier(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test"}
	applyPatch(cfg, map[string]any{
		"pricing": map[string]any{
			"default_tier": "opus",
		},
	})

	assertEqual(t, "default_tier", cfg.Pricing.DefaultTier, "opus")
}

func TestApplyPatch_IgnoresWrongTypes(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test", DisplayName_: "Original"}

	// Pass wrong types — should be silently ignored.
	applyPatch(cfg, map[string]any{
		"display_name": 42,        // not string
		"enabled":      "yes",     // not bool
		"commands":     "invalid", // not map
	})

	assertEqual(t, "display_name unchanged", cfg.DisplayName_, "Original")
	assertEqual(t, "enabled unchanged", cfg.Enabled_, false)
}

func TestApplyPatch_EmptyPatch(t *testing.T) {
	cfg := &provider.ProviderConfig{Provider: "test", DisplayName_: "Original"}
	applyPatch(cfg, map[string]any{})
	assertEqual(t, "unchanged", cfg.DisplayName_, "Original")
}

// ---------------------------------------------------------------------------
// isBuiltinProvider
// ---------------------------------------------------------------------------

func TestIsBuiltinProvider(t *testing.T) {
	cases := []struct {
		name    string
		builtin bool
	}{
		{"claude", true},
		{"codex", true},
		{"gemini", true},
		{"custom-tool", false},
		{"Claude", false}, // case-sensitive
		{"", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isBuiltinProvider(tc.name)
			if got != tc.builtin {
				t.Errorf("isBuiltinProvider(%q) = %v, want %v", tc.name, got, tc.builtin)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// WriteOverride / OverridePath / CustomProviderPath / HasOverride
// ---------------------------------------------------------------------------

func TestOverridePath(t *testing.T) {
	path := provider.OverridePath("claude")
	home, _ := os.UserHomeDir()
	expected := filepath.Join(home, ".phantom-os", "providers", "claude.yaml")
	assertEqual(t, "override path", path, expected)
}

func TestCustomProviderPath(t *testing.T) {
	path := provider.CustomProviderPath("mytool")
	home, _ := os.UserHomeDir()
	expected := filepath.Join(home, ".phantom-os", "providers", "custom", "mytool.yaml")
	assertEqual(t, "custom path", path, expected)
}

func TestWriteOverride_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.yaml")

	cfg := &provider.ProviderConfig{
		Provider:     "test-tool",
		DisplayName_: "Test Tool",
		Icon_:        "wrench",
		Enabled_:     true,
	}

	if err := provider.WriteOverride(path, cfg); err != nil {
		t.Fatalf("WriteOverride failed: %v", err)
	}

	// Read it back.
	loaded, err := provider.LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	assertEqual(t, "provider", loaded.Provider, "test-tool")
	assertEqual(t, "display_name", loaded.DisplayName_, "Test Tool")
	assertEqual(t, "icon", loaded.Icon_, "wrench")
	assertEqual(t, "enabled", loaded.Enabled_, true)
}

func TestWriteOverride_CreatesParentDirs(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nested", "deep", "test.yaml")

	cfg := &provider.ProviderConfig{Provider: "test"}
	if err := provider.WriteOverride(path, cfg); err != nil {
		t.Fatalf("WriteOverride with nested dirs failed: %v", err)
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatal("expected file to exist after WriteOverride")
	}
}

func TestHasOverride_Missing(t *testing.T) {
	// This tests against a random name that almost certainly doesn't exist.
	got := provider.HasOverride("nonexistent-provider-12345")
	if got {
		t.Error("expected HasOverride to return false for nonexistent provider")
	}
}

// ---------------------------------------------------------------------------
// Registry Reload
// ---------------------------------------------------------------------------

func TestRegistryReload(t *testing.T) {
	reg := provider.NewRegistry()
	if err := reg.LoadAll(); err != nil {
		t.Fatalf("initial LoadAll failed: %v", err)
	}

	namesBefore := reg.Names()
	if len(namesBefore) < 3 {
		t.Fatalf("expected at least 3 providers before reload, got %d", len(namesBefore))
	}

	if err := reg.Reload(); err != nil {
		t.Fatalf("Reload failed: %v", err)
	}

	namesAfter := reg.Names()
	if len(namesAfter) < 3 {
		t.Fatalf("expected at least 3 providers after reload, got %d", len(namesAfter))
	}
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

func assertEqual[T comparable](t *testing.T, label string, got, want T) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %v, want %v", label, got, want)
	}
}

func assertFloat(t *testing.T, label string, got, want float64) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %f, want %f", label, got, want)
	}
}
