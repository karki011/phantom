// Package provider — tests for MergeConfigs deep merge and LoadAll/InstantiateAll.
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

import (
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// MergeConfigs — scalar overrides
// ---------------------------------------------------------------------------

func TestMergeConfigs_ScalarOverride(t *testing.T) {
	base := &ProviderConfig{
		Provider:     "claude",
		DisplayName_: "Claude Code",
		Icon_:        "anthropic",
		Enabled_:     true,
	}
	override := &ProviderConfig{
		Provider:     "claude",
		DisplayName_: "Claude Code (Custom)",
	}

	merged := MergeConfigs(base, override)

	assertEqual(t, "provider", merged.Provider, "claude")
	assertEqual(t, "display_name", merged.DisplayName_, "Claude Code (Custom)")
	assertEqual(t, "icon", merged.Icon_, "anthropic") // preserved from base
}

func TestMergeConfigs_NilBase(t *testing.T) {
	override := &ProviderConfig{Provider: "test"}
	merged := MergeConfigs(nil, override)
	assertEqual(t, "provider", merged.Provider, "test")
}

func TestMergeConfigs_NilOverride(t *testing.T) {
	base := &ProviderConfig{Provider: "test"}
	merged := MergeConfigs(base, nil)
	assertEqual(t, "provider", merged.Provider, "test")
}

// ---------------------------------------------------------------------------
// MergeConfigs — path overrides
// ---------------------------------------------------------------------------

func TestMergeConfigs_PathOverride(t *testing.T) {
	base := &ProviderConfig{
		Provider: "claude",
		Paths: PathsConfig{
			Sessions:      "~/.claude/sessions/",
			Conversations: "~/.claude/projects/",
			Settings:      "~/.claude/settings.json",
			Todos:         "~/.claude/todos/",
			Tasks:         "~/.claude/tasks/",
			Context:       "~/.phantom-os/context/claude/",
		},
	}
	override := &ProviderConfig{
		Provider: "claude",
		Paths: PathsConfig{
			Sessions: "~/custom/claude/sessions/", // override only sessions
		},
	}

	merged := MergeConfigs(base, override)

	assertEqual(t, "sessions overridden", merged.Paths.Sessions, "~/custom/claude/sessions/")
	assertEqual(t, "conversations preserved", merged.Paths.Conversations, "~/.claude/projects/")
	assertEqual(t, "settings preserved", merged.Paths.Settings, "~/.claude/settings.json")
	assertEqual(t, "todos preserved", merged.Paths.Todos, "~/.claude/todos/")
	assertEqual(t, "tasks preserved", merged.Paths.Tasks, "~/.claude/tasks/")
	assertEqual(t, "context preserved", merged.Paths.Context, "~/.phantom-os/context/claude/")
}

// ---------------------------------------------------------------------------
// MergeConfigs — pricing tier add and override
// ---------------------------------------------------------------------------

func TestMergeConfigs_PricingTierAdd(t *testing.T) {
	base := &ProviderConfig{
		Provider: "claude",
		Pricing: PricingConfig{
			DefaultTier: "sonnet",
			Tiers: map[string]PriceTier{
				"sonnet": {Match: "sonnet", InputPerM: 3.0, OutputPerM: 15.0},
				"opus":   {Match: "opus", InputPerM: 15.0, OutputPerM: 75.0},
			},
		},
	}
	override := &ProviderConfig{
		Provider: "claude",
		Pricing: PricingConfig{
			Tiers: map[string]PriceTier{
				"haiku": {Match: "haiku", InputPerM: 0.80, OutputPerM: 4.0},
			},
		},
	}

	merged := MergeConfigs(base, override)

	// All 3 tiers should exist.
	if len(merged.Pricing.Tiers) != 3 {
		t.Fatalf("expected 3 tiers, got %d", len(merged.Pricing.Tiers))
	}
	// Original tiers preserved.
	assertFloat(t, "sonnet.input_per_m", merged.Pricing.Tiers["sonnet"].InputPerM, 3.0)
	assertFloat(t, "opus.input_per_m", merged.Pricing.Tiers["opus"].InputPerM, 15.0)
	// New tier added.
	assertFloat(t, "haiku.input_per_m", merged.Pricing.Tiers["haiku"].InputPerM, 0.80)
	// Default tier preserved from base.
	assertEqual(t, "default_tier", merged.Pricing.DefaultTier, "sonnet")
}

func TestMergeConfigs_PricingTierOverride(t *testing.T) {
	base := &ProviderConfig{
		Provider: "claude",
		Pricing: PricingConfig{
			DefaultTier: "sonnet",
			Tiers: map[string]PriceTier{
				"sonnet": {Match: "sonnet", InputPerM: 3.0, OutputPerM: 15.0},
			},
		},
	}
	override := &ProviderConfig{
		Provider: "claude",
		Pricing: PricingConfig{
			Tiers: map[string]PriceTier{
				"sonnet": {Match: "sonnet", InputPerM: 2.5, OutputPerM: 12.0},
			},
		},
	}

	merged := MergeConfigs(base, override)

	// Override rate should win.
	assertFloat(t, "sonnet.input_per_m", merged.Pricing.Tiers["sonnet"].InputPerM, 2.5)
	assertFloat(t, "sonnet.output_per_m", merged.Pricing.Tiers["sonnet"].OutputPerM, 12.0)
}

// ---------------------------------------------------------------------------
// MergeConfigs — command overrides
// ---------------------------------------------------------------------------

func TestMergeConfigs_CommandOverride(t *testing.T) {
	base := &ProviderConfig{
		Provider: "claude",
		Commands: CommandsConfig{
			Resume:          "claude --resume --session-id ${SESSION_ID}",
			NewSession:      "claude --dangerously-skip-permissions",
			AIGenerate:      "claude --print -p '${PROMPT}'",
			PromptTransport: "argv",
		},
	}
	override := &ProviderConfig{
		Provider: "claude",
		Commands: CommandsConfig{
			NewSession: "claude --no-permissions --model opus", // override only new_session
		},
	}

	merged := MergeConfigs(base, override)

	assertEqual(t, "new_session overridden", merged.Commands.NewSession, "claude --no-permissions --model opus")
	assertEqual(t, "resume preserved", merged.Commands.Resume, "claude --resume --session-id ${SESSION_ID}")
	assertEqual(t, "ai_generate preserved", merged.Commands.AIGenerate, "claude --print -p '${PROMPT}'")
	assertEqual(t, "prompt_transport preserved", merged.Commands.PromptTransport, "argv")
}

// ---------------------------------------------------------------------------
// MergeConfigs — empty override changes nothing
// ---------------------------------------------------------------------------

func TestMergeConfigs_EmptyOverride(t *testing.T) {
	base := loadTestConfig(t, "claude.yaml")
	override := &ProviderConfig{
		Provider: "claude",
	}

	merged := MergeConfigs(base, override)

	// Core fields should be identical to base.
	assertEqual(t, "display_name", merged.DisplayName_, base.DisplayName_)
	assertEqual(t, "icon", merged.Icon_, base.Icon_)
	assertEqual(t, "detection.binary", merged.Detection.Binary, base.Detection.Binary)
	assertEqual(t, "paths.sessions", merged.Paths.Sessions, base.Paths.Sessions)
	assertEqual(t, "sessions.discovery_method", merged.Sessions.DiscoveryMethod, base.Sessions.DiscoveryMethod)
	assertEqual(t, "conversations.encoding", merged.Conversations.Encoding, base.Conversations.Encoding)
	assertEqual(t, "pricing.default_tier", merged.Pricing.DefaultTier, base.Pricing.DefaultTier)
	assertEqual(t, "adapter.go_package", merged.Adapter.GoPackage, base.Adapter.GoPackage)
}

// ---------------------------------------------------------------------------
// MergeConfigs — message type map merge
// ---------------------------------------------------------------------------

func TestMergeConfigs_MessageTypeMapMerge(t *testing.T) {
	base := &ProviderConfig{
		Provider: "claude",
		Conversations: ConversationsConfig{
			MessageTypes: map[string]MessageTypeConfig{
				"user":      {Match: []MatchRule{{Field: "type", Value: "human"}}},
				"assistant": {Match: []MatchRule{{Field: "type", Value: "assistant"}}},
			},
		},
	}
	override := &ProviderConfig{
		Provider: "claude",
		Conversations: ConversationsConfig{
			MessageTypes: map[string]MessageTypeConfig{
				// Add a new type.
				"thinking": {Match: []MatchRule{{Field: "type", Value: "thinking"}}},
				// Override an existing type.
				"user": {Match: []MatchRule{{Field: "role", Value: "user"}}},
			},
		},
	}

	merged := MergeConfigs(base, override)

	// Should have 3 types: user (overridden), assistant (preserved), thinking (added).
	if len(merged.Conversations.MessageTypes) != 3 {
		t.Fatalf("expected 3 message types, got %d", len(merged.Conversations.MessageTypes))
	}
	// "user" should use the override match rule.
	assertMessageType(t, merged.Conversations.MessageTypes, "user", "role", "user")
	// "assistant" should be preserved from base.
	assertMessageType(t, merged.Conversations.MessageTypes, "assistant", "type", "assistant")
	// "thinking" should be added from override.
	assertMessageType(t, merged.Conversations.MessageTypes, "thinking", "type", "thinking")
}

// ---------------------------------------------------------------------------
// MergeConfigs — sessions fields map merge
// ---------------------------------------------------------------------------

func TestMergeConfigs_SessionFieldsMapMerge(t *testing.T) {
	base := &ProviderConfig{
		Provider: "claude",
		Sessions: SessionsConfig{
			Fields: map[string]string{
				"id":  "sessionId",
				"pid": "pid",
				"cwd": "cwd",
			},
		},
	}
	override := &ProviderConfig{
		Provider: "claude",
		Sessions: SessionsConfig{
			Fields: map[string]string{
				"id":   "id",    // override existing
				"name": "title", // add new
			},
		},
	}

	merged := MergeConfigs(base, override)

	assertFieldMapping(t, merged.Sessions.Fields, "id", "id")       // overridden
	assertFieldMapping(t, merged.Sessions.Fields, "pid", "pid")     // preserved
	assertFieldMapping(t, merged.Sessions.Fields, "cwd", "cwd")     // preserved
	assertFieldMapping(t, merged.Sessions.Fields, "name", "title")  // added
}

// ---------------------------------------------------------------------------
// MergeConfigs — does not mutate base
// ---------------------------------------------------------------------------

func TestMergeConfigs_DoesNotMutateBase(t *testing.T) {
	base := &ProviderConfig{
		Provider:     "claude",
		DisplayName_: "Claude Code",
		Pricing: PricingConfig{
			DefaultTier: "sonnet",
			Tiers: map[string]PriceTier{
				"sonnet": {Match: "sonnet", InputPerM: 3.0},
			},
		},
	}
	override := &ProviderConfig{
		Provider:     "claude",
		DisplayName_: "Custom Claude",
		Pricing: PricingConfig{
			Tiers: map[string]PriceTier{
				"haiku": {Match: "haiku", InputPerM: 0.80},
			},
		},
	}

	_ = MergeConfigs(base, override)

	// Base should be unchanged.
	assertEqual(t, "base display_name", base.DisplayName_, "Claude Code")
	if len(base.Pricing.Tiers) != 1 {
		t.Errorf("base pricing tiers mutated: got %d tiers, want 1", len(base.Pricing.Tiers))
	}
}

// ---------------------------------------------------------------------------
// LoadAll — embedded only (no user dirs)
// ---------------------------------------------------------------------------

func TestLoadAll_EmbeddedOnly(t *testing.T) {
	reg := NewRegistry()

	// LoadAll should succeed with just embedded configs (user dirs may not exist).
	if err := reg.LoadAll(); err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}

	// Should have at least the 3 embedded providers.
	names := reg.Names()
	if len(names) < 3 {
		t.Fatalf("expected at least 3 providers after LoadAll, got %d: %v", len(names), names)
	}

	for _, name := range []string{"claude", "codex", "gemini"} {
		if _, ok := reg.Get(name); !ok {
			t.Errorf("provider %q not found after LoadAll", name)
		}
	}
}

// ---------------------------------------------------------------------------
// InstantiateAll — creates providers from loaded configs
// ---------------------------------------------------------------------------

func TestInstantiateAll(t *testing.T) {
	reg := NewRegistry()

	// Register a test factory.
	factoryCalled := false
	reg.RegisterAdapterFactory("claude", func(cfg *ProviderConfig) Provider {
		factoryCalled = true
		return NewConfigProvider(cfg) // just wrap it for testing
	})

	if err := reg.LoadAll(); err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}

	reg.InstantiateAll()

	if !factoryCalled {
		t.Error("expected claude adapter factory to be called during InstantiateAll")
	}

	// All providers should still be accessible.
	for _, name := range []string{"claude", "codex", "gemini"} {
		p, ok := reg.Get(name)
		if !ok {
			t.Errorf("provider %q not found after InstantiateAll", name)
			continue
		}
		assertEqual(t, name+" Name()", p.Name(), name)
	}
}

// ---------------------------------------------------------------------------
// LoadOverrides — with temp directory
// ---------------------------------------------------------------------------

func TestLoadOverrides_AppliesOverride(t *testing.T) {
	reg := NewRegistry()
	if err := reg.LoadFromEmbed(); err != nil {
		t.Fatalf("LoadFromEmbed failed: %v", err)
	}

	// Create a temp dir with a Claude override YAML.
	tmpDir := t.TempDir()
	overrideYAML := `
provider: claude
display_name: "Claude Code (Custom)"
pricing:
  tiers:
    budget:
      match: "haiku"
      input_per_m: 0.50
      output_per_m: 2.0
`
	if err := os.WriteFile(filepath.Join(tmpDir, "claude.yaml"), []byte(overrideYAML), 0o644); err != nil {
		t.Fatalf("write override: %v", err)
	}

	if err := reg.LoadOverrides(tmpDir); err != nil {
		t.Fatalf("LoadOverrides failed: %v", err)
	}

	// Config should have the override applied.
	cfg, ok := reg.Config("claude")
	if !ok {
		t.Fatal("claude config not found after override")
	}

	assertEqual(t, "display_name overridden", cfg.DisplayName_, "Claude Code (Custom)")

	// Original tiers should be preserved + new "budget" tier added.
	if _, ok := cfg.Pricing.Tiers["sonnet"]; !ok {
		t.Error("sonnet tier should be preserved from base")
	}
	if tier, ok := cfg.Pricing.Tiers["budget"]; !ok {
		t.Error("budget tier should be added from override")
	} else {
		assertFloat(t, "budget.input_per_m", tier.InputPerM, 0.50)
	}
}

func TestLoadOverrides_SkipsUnknownProvider(t *testing.T) {
	reg := NewRegistry()
	if err := reg.LoadFromEmbed(); err != nil {
		t.Fatalf("LoadFromEmbed failed: %v", err)
	}

	tmpDir := t.TempDir()
	overrideYAML := `
provider: unknown-tool
display_name: "Unknown Tool"
`
	if err := os.WriteFile(filepath.Join(tmpDir, "unknown.yaml"), []byte(overrideYAML), 0o644); err != nil {
		t.Fatalf("write override: %v", err)
	}

	// Should not error — just log and skip.
	if err := reg.LoadOverrides(tmpDir); err != nil {
		t.Fatalf("LoadOverrides failed: %v", err)
	}

	// Unknown provider should not be registered.
	if _, ok := reg.Get("unknown-tool"); ok {
		t.Error("unknown-tool should not be registered via overrides")
	}
}

func TestLoadOverrides_SkipsInvalidYAML(t *testing.T) {
	reg := NewRegistry()
	if err := reg.LoadFromEmbed(); err != nil {
		t.Fatalf("LoadFromEmbed failed: %v", err)
	}

	tmpDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tmpDir, "bad.yaml"), []byte("{{invalid yaml"), 0o644); err != nil {
		t.Fatalf("write bad yaml: %v", err)
	}

	// Should not error — just log and skip.
	if err := reg.LoadOverrides(tmpDir); err != nil {
		t.Fatalf("LoadOverrides failed: %v", err)
	}
}

// ---------------------------------------------------------------------------
// AutoDetect — returns map keyed by name
// ---------------------------------------------------------------------------

func TestAutoDetect_ReturnsMap(t *testing.T) {
	reg := NewRegistry()
	if err := reg.LoadAll(); err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}

	results := reg.AutoDetect()
	if len(results) == 0 {
		t.Error("expected non-empty AutoDetect results")
	}

	// Every registered provider should have a health status entry.
	for _, name := range reg.Names() {
		if _, ok := results[name]; !ok {
			t.Errorf("provider %q missing from AutoDetect results", name)
		}
	}
}

// ---------------------------------------------------------------------------
// EnsureConfigDir
// ---------------------------------------------------------------------------

func TestEnsureConfigDir(t *testing.T) {
	// EnsureConfigDir creates real directories under ~/.phantom-os/.
	// We just verify it doesn't error; the directories may already exist.
	if err := EnsureConfigDir(); err != nil {
		t.Fatalf("EnsureConfigDir failed: %v", err)
	}

	// Verify directories exist.
	providersDir := ExpandPath("~/.phantom-os/providers/")
	if _, err := os.Stat(providersDir); os.IsNotExist(err) {
		t.Error("~/.phantom-os/providers/ should exist after EnsureConfigDir")
	}

	customDir := ExpandPath("~/.phantom-os/providers/custom/")
	if _, err := os.Stat(customDir); os.IsNotExist(err) {
		t.Error("~/.phantom-os/providers/custom/ should exist after EnsureConfigDir")
	}
}
