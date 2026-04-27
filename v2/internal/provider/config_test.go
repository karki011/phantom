// Package provider — tests for config loading, validation, and helpers.
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Config Loading — real YAML files
// ---------------------------------------------------------------------------

func TestLoadConfig_Claude(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")

	assertEqual(t, "provider", cfg.Provider, "claude")
	assertEqual(t, "display_name", cfg.DisplayName_, "Claude Code")
	assertEqual(t, "icon", cfg.Icon_, "anthropic")
	assertEqual(t, "enabled", cfg.Enabled_, true)

	// Detection
	assertEqual(t, "detection.binary", cfg.Detection.Binary, "claude")
	assertEqual(t, "detection.paths len", len(cfg.Detection.Paths), 2)
	assertEqual(t, "detection.version_command[0]", cfg.Detection.VersionCommand[0], "claude")
	assertEqual(t, "detection.version_pattern", cfg.Detection.VersionPattern, `claude-code/(\d+\.\d+\.\d+)`)

	// Paths
	assertEqual(t, "paths.sessions", cfg.Paths.Sessions, "~/.claude/sessions/")
	assertEqual(t, "paths.conversations", cfg.Paths.Conversations, "~/.claude/projects/")

	// Sessions
	assertEqual(t, "sessions.discovery_method", cfg.Sessions.DiscoveryMethod, "glob")
	assertEqual(t, "sessions.glob", cfg.Sessions.Glob, "*.json")
	assertEqual(t, "sessions.alive_check", cfg.Sessions.AliveCheck, "pid")
	assertFieldMapping(t, cfg.Sessions.Fields, "id", "sessionId")
	assertFieldMapping(t, cfg.Sessions.Fields, "pid", "pid")
	assertFieldMapping(t, cfg.Sessions.Fields, "cwd", "cwd")

	// Conversations
	assertEqual(t, "conversations.encoding", cfg.Conversations.Encoding, "jsonl")
	assertEqual(t, "conversations.path_convention", cfg.Conversations.PathConvention, "encoded")
	assertEqual(t, "conversations.content_extraction", cfg.Conversations.ContentExtraction, "claude-blocks")
	assertEqual(t, "conversations.token_strategy", cfg.Conversations.TokenStrategy, "inline")

	// Message types
	assertMessageType(t, cfg.Conversations.MessageTypes, "user", "type", "human")
	assertMessageType(t, cfg.Conversations.MessageTypes, "assistant", "type", "assistant")
	assertMessageType(t, cfg.Conversations.MessageTypes, "thinking", "type", "thinking")

	// Usage fields
	assertFieldMapping(t, cfg.Conversations.Usage.Fields, "input", "input_tokens")
	assertFieldMapping(t, cfg.Conversations.Usage.Fields, "output", "output_tokens")

	// Pricing
	assertEqual(t, "pricing.default_tier", cfg.Pricing.DefaultTier, "sonnet")
	if tier, ok := cfg.Pricing.Tiers["sonnet"]; ok {
		assertEqual(t, "sonnet.match", tier.Match, "sonnet")
		assertFloat(t, "sonnet.input_per_m", tier.InputPerM, 3.0)
		assertFloat(t, "sonnet.output_per_m", tier.OutputPerM, 15.0)
	} else {
		t.Error("missing pricing tier: sonnet")
	}
	if tier, ok := cfg.Pricing.Tiers["opus"]; ok {
		assertFloat(t, "opus.input_per_m", tier.InputPerM, 15.0)
	} else {
		t.Error("missing pricing tier: opus")
	}

	// Commands
	assertContains(t, "commands.resume", cfg.Commands.Resume, "${SESSION_ID}")
	assertEqual(t, "commands.prompt_transport", cfg.Commands.PromptTransport, "argv")

	// Adapter
	assertEqual(t, "adapter.go_package", cfg.Adapter.GoPackage, "claude")
	assertContains(t, "adapter.overrides", strings.Join(cfg.Adapter.Overrides, ","), "ParseConversation")
}

func TestLoadConfig_Codex(t *testing.T) {
	cfg := loadTestConfig(t, "codex.yaml")

	assertEqual(t, "provider", cfg.Provider, "codex")
	assertEqual(t, "display_name", cfg.DisplayName_, "OpenAI Codex CLI")
	assertEqual(t, "icon", cfg.Icon_, "openai")

	// Sessions — SQLite primary
	assertEqual(t, "sessions.discovery_method", cfg.Sessions.DiscoveryMethod, "sqlite")
	if cfg.Sessions.SQLite == nil {
		t.Fatal("sessions.sqlite should not be nil for codex")
	}
	assertEqual(t, "sessions.sqlite.table", cfg.Sessions.SQLite.Table, "threads")
	assertFieldMapping(t, cfg.Sessions.SQLite.Fields, "id", "id")
	assertFieldMapping(t, cfg.Sessions.SQLite.Fields, "git_branch", "git_branch")

	// JSONL index fallback
	if cfg.Sessions.JSONLIndex == nil {
		t.Fatal("sessions.jsonl_index should not be nil for codex")
	}
	assertContains(t, "jsonl_index.path", cfg.Sessions.JSONLIndex.Path, "session_index.jsonl")

	// Conversations
	assertEqual(t, "conversations.encoding", cfg.Conversations.Encoding, "jsonl")
	assertEqual(t, "conversations.path_convention", cfg.Conversations.PathConvention, "date-nested")
	assertEqual(t, "conversations.content_extraction", cfg.Conversations.ContentExtraction, "openai-events")
	assertEqual(t, "conversations.token_strategy", cfg.Conversations.TokenStrategy, "aggregate")

	// Message types include session_meta
	assertMessageType(t, cfg.Conversations.MessageTypes, "session_meta", "type", "session_meta")

	// Usage fields use OpenAI naming
	assertFieldMapping(t, cfg.Conversations.Usage.Fields, "input", "prompt_tokens")
	assertFieldMapping(t, cfg.Conversations.Usage.Fields, "output", "completion_tokens")

	// Pricing
	if tier, ok := cfg.Pricing.Tiers["o3"]; ok {
		assertFloat(t, "o3.input_per_m", tier.InputPerM, 2.0)
	} else {
		t.Error("missing pricing tier: o3")
	}

	// Commands — codex has no resume
	assertEqual(t, "commands.resume", cfg.Commands.Resume, "")

	// Adapter overrides
	if len(cfg.Adapter.Overrides) < 4 {
		t.Errorf("expected at least 4 adapter overrides for codex, got %d", len(cfg.Adapter.Overrides))
	}
}

func TestLoadConfig_Gemini(t *testing.T) {
	cfg := loadTestConfig(t, "gemini.yaml")

	assertEqual(t, "provider", cfg.Provider, "gemini")
	assertEqual(t, "display_name", cfg.DisplayName_, "Gemini CLI")
	assertEqual(t, "icon", cfg.Icon_, "google")

	// Sessions — glob with nested pattern
	assertEqual(t, "sessions.discovery_method", cfg.Sessions.DiscoveryMethod, "glob")
	assertEqual(t, "sessions.glob", cfg.Sessions.Glob, "*/chats/session-*.json")
	assertEqual(t, "sessions.alive_check", cfg.Sessions.AliveCheck, "none")

	// Conversations — JSON, not JSONL
	assertEqual(t, "conversations.encoding", cfg.Conversations.Encoding, "json")
	assertEqual(t, "conversations.path_convention", cfg.Conversations.PathConvention, "hash")
	assertEqual(t, "conversations.content_extraction", cfg.Conversations.ContentExtraction, "gemini-messages")
	assertEqual(t, "conversations.token_strategy", cfg.Conversations.TokenStrategy, "per-message")

	// Gemini assistant type matches "gemini"
	assertMessageType(t, cfg.Conversations.MessageTypes, "assistant", "type", "gemini")

	// Usage fields — direct names
	assertFieldMapping(t, cfg.Conversations.Usage.Fields, "input", "input")
	assertFieldMapping(t, cfg.Conversations.Usage.Fields, "output", "output")
	assertFieldMapping(t, cfg.Conversations.Usage.Fields, "thinking", "thoughts")

	// Commands — stdin transport
	assertEqual(t, "commands.prompt_transport", cfg.Commands.PromptTransport, "stdin")

	// Pricing — flash tier
	if tier, ok := cfg.Pricing.Tiers["flash"]; ok {
		assertFloat(t, "flash.input_per_m", tier.InputPerM, 0.10)
	} else {
		t.Error("missing pricing tier: flash")
	}
}

// ---------------------------------------------------------------------------
// Config Loading — embedded configs
// ---------------------------------------------------------------------------

func TestLoadFromEmbed(t *testing.T) {
	entries, err := EmbeddedConfigs.ReadDir("configs")
	if err != nil {
		t.Fatalf("failed to read embedded configs: %v", err)
	}

	if len(entries) < 3 {
		t.Fatalf("expected at least 3 embedded configs, got %d", len(entries))
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}

	for _, expected := range []string{"claude.yaml", "codex.yaml", "gemini.yaml"} {
		found := false
		for _, n := range names {
			if n == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected embedded config %q not found in %v", expected, names)
		}
	}
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

func TestValidate_MissingProvider(t *testing.T) {
	cfg := &ProviderConfig{
		DisplayName_: "Test",
		Detection:    DetectionConfig{Binary: "test"},
		Sessions:     SessionsConfig{DiscoveryMethod: "glob", Glob: "*.json"},
		Conversations: ConversationsConfig{
			Encoding:          "jsonl",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
		},
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for missing provider")
	}
	assertContains(t, "error message", err.Error(), "provider is required")
}

func TestValidate_MissingDisplayName(t *testing.T) {
	cfg := &ProviderConfig{
		Provider:  "test",
		Detection: DetectionConfig{Binary: "test"},
		Sessions:  SessionsConfig{DiscoveryMethod: "glob", Glob: "*.json"},
		Conversations: ConversationsConfig{
			Encoding:          "jsonl",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
		},
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for missing display_name")
	}
	assertContains(t, "error message", err.Error(), "display_name is required")
}

func TestValidate_MissingBinary(t *testing.T) {
	cfg := &ProviderConfig{
		Provider:     "test",
		DisplayName_: "Test",
		Sessions:     SessionsConfig{DiscoveryMethod: "glob", Glob: "*.json"},
		Conversations: ConversationsConfig{
			Encoding:          "jsonl",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
		},
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for missing binary")
	}
	assertContains(t, "error message", err.Error(), "detection.binary is required")
}

func TestValidate_InvalidDiscoveryMethod(t *testing.T) {
	cfg := &ProviderConfig{
		Provider:     "test",
		DisplayName_: "Test",
		Detection:    DetectionConfig{Binary: "test"},
		Sessions:     SessionsConfig{DiscoveryMethod: "magic"},
		Conversations: ConversationsConfig{
			Encoding:          "jsonl",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
		},
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for invalid discovery_method")
	}
	assertContains(t, "error message", err.Error(), "not supported")
}

func TestValidate_GlobRequiresPattern(t *testing.T) {
	cfg := &ProviderConfig{
		Provider:     "test",
		DisplayName_: "Test",
		Detection:    DetectionConfig{Binary: "test"},
		Sessions:     SessionsConfig{DiscoveryMethod: "glob"},
		Conversations: ConversationsConfig{
			Encoding:          "jsonl",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
		},
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for glob without pattern")
	}
	assertContains(t, "error message", err.Error(), "sessions.glob is required")
}

func TestValidate_SQLiteRequiresConfig(t *testing.T) {
	cfg := &ProviderConfig{
		Provider:     "test",
		DisplayName_: "Test",
		Detection:    DetectionConfig{Binary: "test"},
		Sessions:     SessionsConfig{DiscoveryMethod: "sqlite"},
		Conversations: ConversationsConfig{
			Encoding:          "jsonl",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
		},
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for sqlite without config")
	}
	assertContains(t, "error message", err.Error(), "sessions.sqlite is required")
}

func TestValidate_InvalidEncoding(t *testing.T) {
	cfg := &ProviderConfig{
		Provider:     "test",
		DisplayName_: "Test",
		Detection:    DetectionConfig{Binary: "test"},
		Sessions:     SessionsConfig{DiscoveryMethod: "glob", Glob: "*.json"},
		Conversations: ConversationsConfig{
			Encoding:          "xml",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
		},
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for invalid encoding")
	}
	assertContains(t, "error message", err.Error(), "not supported")
}

func TestValidate_MissingDefaultTier(t *testing.T) {
	cfg := &ProviderConfig{
		Provider:     "test",
		DisplayName_: "Test",
		Detection:    DetectionConfig{Binary: "test"},
		Sessions:     SessionsConfig{DiscoveryMethod: "glob", Glob: "*.json"},
		Conversations: ConversationsConfig{
			Encoding:          "jsonl",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
		},
		Pricing: PricingConfig{
			DefaultTier: "nonexistent",
			Tiers:       map[string]PriceTier{"basic": {Match: "basic"}},
		},
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for missing default tier")
	}
	assertContains(t, "error message", err.Error(), "not found in pricing.tiers")
}

func TestValidate_ValidConfig(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	if err := cfg.Validate(); err != nil {
		t.Errorf("claude.yaml should be valid, got: %v", err)
	}
}

func TestValidate_AllRealConfigs(t *testing.T) {
	for _, name := range []string{"claude.yaml", "codex.yaml", "gemini.yaml"} {
		t.Run(name, func(t *testing.T) {
			cfg := loadTestConfig(t, name)
			if err := cfg.Validate(); err != nil {
				t.Errorf("%s should be valid, got: %v", name, err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// expandPath
// ---------------------------------------------------------------------------

func TestExpandPath_Tilde(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("cannot determine home dir")
	}

	result := ExpandPath("~/test/dir")
	expected := filepath.Join(home, "test/dir")
	assertEqual(t, "expandPath ~/test/dir", result, expected)
}

func TestExpandPath_TildeOnly(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("cannot determine home dir")
	}

	result := ExpandPath("~")
	assertEqual(t, "expandPath ~", result, home)
}

func TestExpandPath_Absolute(t *testing.T) {
	result := ExpandPath("/usr/local/bin")
	assertEqual(t, "expandPath absolute", result, "/usr/local/bin")
}

func TestExpandPath_Relative(t *testing.T) {
	result := ExpandPath("relative/path")
	assertEqual(t, "expandPath relative", result, "relative/path")
}

// ---------------------------------------------------------------------------
// ParseConfigBytes
// ---------------------------------------------------------------------------

func TestParseConfigBytes_InvalidYAML(t *testing.T) {
	_, err := ParseConfigBytes([]byte("{{invalid yaml"))
	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
}

func TestParseConfigBytes_EmptyYAML(t *testing.T) {
	cfg, err := ParseConfigBytes([]byte(""))
	if err != nil {
		t.Fatalf("empty YAML should parse without error: %v", err)
	}
	if cfg.Provider != "" {
		t.Error("expected empty provider for empty YAML")
	}
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

func TestRegistry_LoadFromEmbed(t *testing.T) {
	reg := NewRegistry()
	if err := reg.LoadFromEmbed(); err != nil {
		t.Fatalf("LoadFromEmbed failed: %v", err)
	}

	names := reg.Names()
	if len(names) < 3 {
		t.Fatalf("expected at least 3 providers, got %d: %v", len(names), names)
	}

	for _, name := range []string{"claude", "codex", "gemini"} {
		p, ok := reg.Get(name)
		if !ok {
			t.Errorf("provider %q not found in registry", name)
			continue
		}
		if p.Name() != name {
			t.Errorf("expected Name() = %q, got %q", name, p.Name())
		}
	}
}

func TestRegistry_ManualRegister(t *testing.T) {
	reg := NewRegistry()

	// Load embedded first
	if err := reg.LoadFromEmbed(); err != nil {
		t.Fatalf("LoadFromEmbed failed: %v", err)
	}

	// Create a mock provider config
	cfg := &ProviderConfig{
		Provider:     "test-tool",
		DisplayName_: "Test Tool",
		Icon_:        "test",
		Enabled_:     true,
	}

	reg.Register("test-tool", NewConfigProvider(cfg))

	p, ok := reg.Get("test-tool")
	if !ok {
		t.Fatal("registered provider not found")
	}
	assertEqual(t, "Name()", p.Name(), "test-tool")
	assertEqual(t, "DisplayName()", p.DisplayName(), "Test Tool")
}

func TestRegistry_All(t *testing.T) {
	reg := NewRegistry()
	if err := reg.LoadFromEmbed(); err != nil {
		t.Fatalf("LoadFromEmbed failed: %v", err)
	}

	all := reg.All()
	if len(all) < 3 {
		t.Errorf("expected at least 3 providers from All(), got %d", len(all))
	}
}

func TestRegistry_Config(t *testing.T) {
	reg := NewRegistry()
	if err := reg.LoadFromEmbed(); err != nil {
		t.Fatalf("LoadFromEmbed failed: %v", err)
	}

	cfg, ok := reg.Config("claude")
	if !ok {
		t.Fatal("claude config not found")
	}
	assertEqual(t, "config.Provider", cfg.Provider, "claude")
}

// ---------------------------------------------------------------------------
// CostCalculator
// ---------------------------------------------------------------------------

func TestCalculateCost_Claude(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	usage := TokenUsage{
		Input:      1_000_000,
		Output:     500_000,
		CacheRead:  200_000,
		CacheWrite: 100_000,
	}

	// sonnet tier: input=3.0, output=15.0, cache_read=0.30, cache_write=3.75
	// cost = 1M*3.0 + 500K*15.0 + 200K*0.30 + 100K*3.75
	//      = 3_000_000 + 7_500_000 + 60_000 + 375_000 = 10_935_000 microdollars
	cost := cp.CalculateCost("claude-3-5-sonnet-20241022", usage)
	if cost != 10_935_000 {
		t.Errorf("expected 10935000 microdollars, got %d", cost)
	}
}

func TestCalculateCost_Opus(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	usage := TokenUsage{
		Input:  100_000,
		Output: 50_000,
	}

	// opus tier: input=15.0, output=75.0
	// cost = 100K*15.0 + 50K*75.0 = 1_500_000 + 3_750_000 = 5_250_000
	cost := cp.CalculateCost("claude-opus-4-6", usage)
	if cost != 5_250_000 {
		t.Errorf("expected 5250000 microdollars, got %d", cost)
	}
}

func TestCalculateCost_DefaultTier(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	usage := TokenUsage{
		Input:  1_000_000,
		Output: 0,
	}

	// Unknown model falls back to default "sonnet" tier: input=3.0
	cost := cp.CalculateCost("unknown-model-xyz", usage)
	// Should match sonnet: 1M * 3.0 = 3_000_000
	if cost != 3_000_000 {
		t.Errorf("expected 3000000 microdollars for default tier, got %d", cost)
	}
}

// ---------------------------------------------------------------------------
// CommandRunner
// ---------------------------------------------------------------------------

func TestResumeCommand(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	cmd := cp.ResumeCommand("abc-123")
	assertContains(t, "resume command", cmd, "abc-123")
	assertContains(t, "resume command", cmd, "--session-id")
}

func TestNewSessionCommand(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	cmd := cp.NewSessionCommand("/home/user/project")
	// Claude's new session command doesn't interpolate CWD
	assertEqual(t, "new session", cmd, "claude --dangerously-skip-permissions")
}

func TestAIGenerateCommand(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	cmd := cp.AIGenerateCommand("explain this code")
	assertContains(t, "ai generate", cmd, "explain this code")
}

func TestPromptTransport_Argv(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)
	assertEqual(t, "prompt transport", cp.PromptTransport(), PromptArgv)
}

func TestPromptTransport_Stdin(t *testing.T) {
	cfg := loadTestConfig(t, "gemini.yaml")
	cp := NewConfigProvider(cfg)
	assertEqual(t, "prompt transport", cp.PromptTransport(), PromptStdin)
}

// ---------------------------------------------------------------------------
// ParseUsage
// ---------------------------------------------------------------------------

func TestParseUsage_Claude(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	raw := map[string]any{
		"usage": map[string]any{
			"input_tokens":                  float64(1500),
			"output_tokens":                 float64(500),
			"cache_read_input_tokens":       float64(200),
			"cache_creation_input_tokens":   float64(100),
		},
	}

	usage := cp.ParseUsage(raw)
	if usage == nil {
		t.Fatal("expected non-nil usage")
	}
	assertEqual(t, "input", usage.Input, int64(1500))
	assertEqual(t, "output", usage.Output, int64(500))
	assertEqual(t, "cache_read", usage.CacheRead, int64(200))
	assertEqual(t, "cache_write", usage.CacheWrite, int64(100))
}

func TestParseUsage_NestedPath(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	raw := map[string]any{
		"message": map[string]any{
			"usage": map[string]any{
				"input_tokens":  float64(1000),
				"output_tokens": float64(200),
			},
		},
	}

	usage := cp.ParseUsage(raw)
	if usage == nil {
		t.Fatal("expected non-nil usage from nested path")
	}
	assertEqual(t, "input", usage.Input, int64(1000))
	assertEqual(t, "output", usage.Output, int64(200))
}

func TestParseUsage_NoUsage(t *testing.T) {
	cfg := loadTestConfig(t, "claude.yaml")
	cp := NewConfigProvider(cfg)

	raw := map[string]any{
		"content": "hello",
	}

	usage := cp.ParseUsage(raw)
	if usage != nil {
		t.Error("expected nil usage when no usage data present")
	}
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

func TestExtractString_Simple(t *testing.T) {
	m := map[string]any{"name": "test"}
	v, ok := extractString(m, "name")
	if !ok || v != "test" {
		t.Errorf("expected (test, true), got (%q, %v)", v, ok)
	}
}

func TestExtractString_Nested(t *testing.T) {
	m := map[string]any{
		"outer": map[string]any{
			"inner": "value",
		},
	}
	v, ok := extractString(m, "outer.inner")
	if !ok || v != "value" {
		t.Errorf("expected (value, true), got (%q, %v)", v, ok)
	}
}

func TestExtractString_Missing(t *testing.T) {
	m := map[string]any{"name": "test"}
	_, ok := extractString(m, "missing")
	if ok {
		t.Error("expected false for missing key")
	}
}

func TestExtractString_EmptyKey(t *testing.T) {
	m := map[string]any{"name": "test"}
	_, ok := extractString(m, "")
	if ok {
		t.Error("expected false for empty key")
	}
}

func TestExtractInt_Float64(t *testing.T) {
	m := map[string]any{"pid": float64(1234)}
	v, ok := extractInt(m, "pid")
	if !ok || v != 1234 {
		t.Errorf("expected (1234, true), got (%d, %v)", v, ok)
	}
}

func TestExtractInt64_Float64(t *testing.T) {
	m := map[string]any{"tokens": float64(1500)}
	v, ok := extractInt64(m, "tokens")
	if !ok || v != 1500 {
		t.Errorf("expected (1500, true), got (%d, %v)", v, ok)
	}
}

func TestNavigatePath_Simple(t *testing.T) {
	m := map[string]any{
		"usage": map[string]any{
			"input": float64(100),
		},
	}
	result := navigatePath(m, "usage")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if v, ok := result["input"]; !ok || v != float64(100) {
		t.Error("expected input=100 in navigated map")
	}
}

func TestNavigatePath_Deep(t *testing.T) {
	m := map[string]any{
		"message": map[string]any{
			"usage": map[string]any{
				"tokens": float64(500),
			},
		},
	}
	result := navigatePath(m, "message.usage")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if v, ok := result["tokens"]; !ok || v != float64(500) {
		t.Error("expected tokens=500 in navigated map")
	}
}

func TestNavigatePath_Missing(t *testing.T) {
	m := map[string]any{"a": "string"}
	result := navigatePath(m, "b.c")
	if result != nil {
		t.Error("expected nil for missing path")
	}
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

func loadTestConfig(t *testing.T, name string) *ProviderConfig {
	t.Helper()
	data, err := EmbeddedConfigs.ReadFile("configs/" + name)
	if err != nil {
		t.Fatalf("failed to read embedded config %s: %v", name, err)
	}
	cfg, err := ParseConfigBytes(data)
	if err != nil {
		t.Fatalf("failed to parse %s: %v", name, err)
	}
	return cfg
}

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

func assertContains(t *testing.T, label, haystack, needle string) {
	t.Helper()
	if !strings.Contains(haystack, needle) {
		t.Errorf("%s: %q does not contain %q", label, haystack, needle)
	}
}

func assertFieldMapping(t *testing.T, fields map[string]string, key, expected string) {
	t.Helper()
	if v, ok := fields[key]; !ok {
		t.Errorf("field mapping %q not found", key)
	} else if v != expected {
		t.Errorf("field mapping %q: got %q, want %q", key, v, expected)
	}
}

func assertMessageType(t *testing.T, types map[string]MessageTypeConfig, typeName, field, value string) {
	t.Helper()
	mt, ok := types[typeName]
	if !ok {
		t.Errorf("message type %q not found", typeName)
		return
	}
	if len(mt.Match) == 0 {
		t.Errorf("message type %q has no match rules", typeName)
		return
	}
	found := false
	for _, rule := range mt.Match {
		if rule.Field == field && rule.Value == value {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("message type %q: no match rule {field: %q, value: %q}", typeName, field, value)
	}
}
