// Package provider — ProviderConfig struct and YAML loading.
//
// Maps directly to the provider YAML schema in configs/providers/*.yaml.
// Each AI tool (Claude, Codex, Gemini) has a YAML config that this struct
// can unmarshal. The ConfigProvider uses this to implement the Provider
// interface generically.
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

// ProviderConfig is the Go representation of a provider YAML file.
type ProviderConfig struct {
	Provider      string              `yaml:"provider"`
	DisplayName_  string              `yaml:"display_name"`
	Icon_         string              `yaml:"icon"`
	Enabled_      bool                `yaml:"enabled"`
	Detection     DetectionConfig     `yaml:"detection"`
	Paths         PathsConfig         `yaml:"paths"`
	Sessions      SessionsConfig      `yaml:"sessions"`
	Conversations ConversationsConfig `yaml:"conversations"`
	Commands      CommandsConfig      `yaml:"commands"`
	Pricing       PricingConfig       `yaml:"pricing"`
	Adapter       AdapterConfig       `yaml:"adapter"`
}

// ---------------------------------------------------------------------------
// Sub-configs
// ---------------------------------------------------------------------------

// DetectionConfig describes how to find and verify a provider binary.
type DetectionConfig struct {
	Binary         string   `yaml:"binary"`
	BinaryPaths    []string `yaml:"binary_paths"`
	Paths          []string `yaml:"paths"`
	VersionCommand []string `yaml:"version_command"`
	VersionPattern string   `yaml:"version_pattern"`
}

// PathsConfig holds the filesystem locations for provider data.
type PathsConfig struct {
	Sessions      string `yaml:"sessions"`
	Conversations string `yaml:"conversations"`
	Settings      string `yaml:"settings"`
	Todos         string `yaml:"todos"`
	Tasks         string `yaml:"tasks"`
	Context       string `yaml:"context"`
}

// SessionsConfig describes how to discover sessions.
type SessionsConfig struct {
	DiscoveryMethod string            `yaml:"discovery_method"` // "glob" or "sqlite"
	Glob            string            `yaml:"glob,omitempty"`
	Exclude         []string          `yaml:"exclude,omitempty"`
	Fields          map[string]string `yaml:"fields,omitempty"`
	AliveCheck      string            `yaml:"alive_check"`
	SQLite          *SQLiteConfig     `yaml:"sqlite,omitempty"`
	JSONLIndex      *JSONLIndexConfig `yaml:"jsonl_index,omitempty"`
}

// SQLiteConfig is the sub-config for SQLite-based session discovery.
type SQLiteConfig struct {
	Path   string            `yaml:"path"`
	Table  string            `yaml:"table"`
	Fields map[string]string `yaml:"fields"`
}

// JSONLIndexConfig is the sub-config for JSONL-index-based session discovery.
type JSONLIndexConfig struct {
	Path   string            `yaml:"path"`
	Fields map[string]string `yaml:"fields"`
}

// ConversationsConfig describes how to parse conversation files.
type ConversationsConfig struct {
	Encoding          string                      `yaml:"encoding"`           // "jsonl" or "json"
	FileExtension     string                      `yaml:"file_extension"`
	PathConvention    string                      `yaml:"path_convention"`    // "encoded", "date-nested", "hash", "flat"
	ContentExtraction string                      `yaml:"content_extraction"` // "claude-blocks", "openai-events", "gemini-messages"
	TokenStrategy     string                      `yaml:"token_strategy"`     // "inline", "aggregate", "per-message"
	MessageTypes      map[string]MessageTypeConfig `yaml:"message_types"`
	Usage             UsageConfig                 `yaml:"usage"`
}

// MessageTypeConfig describes how to match a specific message type.
type MessageTypeConfig struct {
	Match []MatchRule `yaml:"match"`
}

// MatchRule is a field-value pair used to identify message types.
type MatchRule struct {
	Field string `yaml:"field"`
	Value string `yaml:"value"`
}

// UsageConfig describes where to find token usage data.
type UsageConfig struct {
	Locations []string          `yaml:"locations"`
	Fields    map[string]string `yaml:"fields"`
}

// CommandsConfig holds CLI command templates.
type CommandsConfig struct {
	Resume          string `yaml:"resume"`
	NewSession      string `yaml:"new_session"`
	AIGenerate      string `yaml:"ai_generate"`
	PromptTransport string `yaml:"prompt_transport"`
}

// PricingConfig holds model pricing information.
type PricingConfig struct {
	DefaultTier string                `yaml:"default_tier"`
	Tiers       map[string]PriceTier  `yaml:"tiers"`
}

// PriceTier defines pricing for a specific model tier.
type PriceTier struct {
	Match           string  `yaml:"match"`
	InputPerM       float64 `yaml:"input_per_m"`
	OutputPerM      float64 `yaml:"output_per_m"`
	CacheReadPerM   float64 `yaml:"cache_read_per_m"`
	CacheWritePerM  float64 `yaml:"cache_write_per_m"`
}

// AdapterConfig describes the Go adapter for this provider.
type AdapterConfig struct {
	GoPackage string   `yaml:"go_package"`
	Overrides []string `yaml:"overrides"`
}

// ---------------------------------------------------------------------------
// Loading & validation
// ---------------------------------------------------------------------------

// LoadConfig reads a YAML file from disk and returns a parsed ProviderConfig.
func LoadConfig(path string) (*ProviderConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	return ParseConfigBytes(data)
}

// ParseConfigBytes parses raw YAML bytes into a ProviderConfig.
func ParseConfigBytes(data []byte) (*ProviderConfig, error) {
	var cfg ProviderConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	return &cfg, nil
}

// Validate checks that required fields are populated and values are within
// expected ranges. Returns an error describing all validation failures.
func (c *ProviderConfig) Validate() error {
	var errs []string

	if c.Provider == "" {
		errs = append(errs, "provider is required")
	}
	if c.DisplayName_ == "" {
		errs = append(errs, "display_name is required")
	}
	if c.Detection.Binary == "" {
		errs = append(errs, "detection.binary is required")
	}

	// Validate discovery method
	switch c.Sessions.DiscoveryMethod {
	case "glob":
		if c.Sessions.Glob == "" {
			errs = append(errs, "sessions.glob is required when discovery_method is 'glob'")
		}
	case "sqlite":
		if c.Sessions.SQLite == nil {
			errs = append(errs, "sessions.sqlite is required when discovery_method is 'sqlite'")
		}
	case "":
		errs = append(errs, "sessions.discovery_method is required")
	default:
		errs = append(errs, fmt.Sprintf("sessions.discovery_method %q is not supported (glob|sqlite)", c.Sessions.DiscoveryMethod))
	}

	// Validate conversation encoding
	switch c.Conversations.Encoding {
	case "jsonl", "json":
		// ok
	case "":
		errs = append(errs, "conversations.encoding is required")
	default:
		errs = append(errs, fmt.Sprintf("conversations.encoding %q is not supported (jsonl|json)", c.Conversations.Encoding))
	}

	// Validate content extraction
	switch c.Conversations.ContentExtraction {
	case "claude-blocks", "openai-events", "gemini-messages":
		// ok
	case "":
		errs = append(errs, "conversations.content_extraction is required")
	default:
		errs = append(errs, fmt.Sprintf("conversations.content_extraction %q is not supported", c.Conversations.ContentExtraction))
	}

	// Validate token strategy
	switch c.Conversations.TokenStrategy {
	case "inline", "aggregate", "per-message":
		// ok
	case "":
		errs = append(errs, "conversations.token_strategy is required")
	default:
		errs = append(errs, fmt.Sprintf("conversations.token_strategy %q is not supported", c.Conversations.TokenStrategy))
	}

	// Validate pricing has at least the default tier
	if c.Pricing.DefaultTier != "" {
		if _, ok := c.Pricing.Tiers[c.Pricing.DefaultTier]; !ok {
			errs = append(errs, fmt.Sprintf("pricing.default_tier %q not found in pricing.tiers", c.Pricing.DefaultTier))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("config validation failed for %q:\n  - %s", c.Provider, strings.Join(errs, "\n  - "))
	}
	return nil
}

// ---------------------------------------------------------------------------
// Deep Merge
// ---------------------------------------------------------------------------

// MergeConfigs deep-merges an override onto a base config.
// Rules:
//   - Scalar fields: override wins if non-zero
//   - Maps: deep merge (override keys overlay, base keys preserved)
//   - Slices: override replaces entirely
//   - Zero-value/omitted: inherits base
//
// This is used to apply user overrides from ~/.phantom-os/providers/ onto
// the builtin embedded configs. The base is never mutated; a new config is
// returned.
func MergeConfigs(base, override *ProviderConfig) *ProviderConfig {
	if base == nil {
		return override
	}
	if override == nil {
		return base
	}

	// Start with a shallow copy of base.
	merged := *base

	// Identity scalars — override wins if non-zero.
	if override.Provider != "" {
		merged.Provider = override.Provider
	}
	if override.DisplayName_ != "" {
		merged.DisplayName_ = override.DisplayName_
	}
	if override.Icon_ != "" {
		merged.Icon_ = override.Icon_
	}
	// For booleans, override always wins (YAML will set false explicitly).
	// We use the convention that if the override YAML has `enabled:` at all,
	// the override file was parsed, so we take the override value.
	// Since Go zero-value for bool is false, we can't distinguish "not set"
	// from "set to false" — so we always take the override.
	merged.Enabled_ = override.Enabled_

	// Detection — override non-empty fields.
	merged.Detection = mergeDetection(base.Detection, override.Detection)

	// Paths — override non-empty strings.
	merged.Paths = mergePaths(base.Paths, override.Paths)

	// Sessions — override non-empty fields, deep-merge maps.
	merged.Sessions = mergeSessions(base.Sessions, override.Sessions)

	// Conversations — override non-empty fields, deep-merge maps.
	merged.Conversations = mergeConversations(base.Conversations, override.Conversations)

	// Commands — override non-empty strings.
	merged.Commands = mergeCommands(base.Commands, override.Commands)

	// Pricing — deep-merge tiers map.
	merged.Pricing = mergePricing(base.Pricing, override.Pricing)

	// Adapter — override non-empty fields.
	merged.Adapter = mergeAdapter(base.Adapter, override.Adapter)

	return &merged
}

func mergeDetection(base, over DetectionConfig) DetectionConfig {
	merged := base
	if over.Binary != "" {
		merged.Binary = over.Binary
	}
	if len(over.BinaryPaths) > 0 {
		merged.BinaryPaths = over.BinaryPaths
	}
	if len(over.Paths) > 0 {
		merged.Paths = over.Paths
	}
	if len(over.VersionCommand) > 0 {
		merged.VersionCommand = over.VersionCommand
	}
	if over.VersionPattern != "" {
		merged.VersionPattern = over.VersionPattern
	}
	return merged
}

func mergePaths(base, over PathsConfig) PathsConfig {
	merged := base
	if over.Sessions != "" {
		merged.Sessions = over.Sessions
	}
	if over.Conversations != "" {
		merged.Conversations = over.Conversations
	}
	if over.Settings != "" {
		merged.Settings = over.Settings
	}
	if over.Todos != "" {
		merged.Todos = over.Todos
	}
	if over.Tasks != "" {
		merged.Tasks = over.Tasks
	}
	if over.Context != "" {
		merged.Context = over.Context
	}
	return merged
}

func mergeSessions(base, over SessionsConfig) SessionsConfig {
	merged := base
	if over.DiscoveryMethod != "" {
		merged.DiscoveryMethod = over.DiscoveryMethod
	}
	if over.Glob != "" {
		merged.Glob = over.Glob
	}
	if len(over.Exclude) > 0 {
		merged.Exclude = over.Exclude
	}
	if over.AliveCheck != "" {
		merged.AliveCheck = over.AliveCheck
	}
	// Deep-merge fields map.
	merged.Fields = mergeMaps(base.Fields, over.Fields)
	// SQLite and JSONLIndex — override entirely if present.
	if over.SQLite != nil {
		merged.SQLite = over.SQLite
	}
	if over.JSONLIndex != nil {
		merged.JSONLIndex = over.JSONLIndex
	}
	return merged
}

func mergeConversations(base, over ConversationsConfig) ConversationsConfig {
	merged := base
	if over.Encoding != "" {
		merged.Encoding = over.Encoding
	}
	if over.FileExtension != "" {
		merged.FileExtension = over.FileExtension
	}
	if over.PathConvention != "" {
		merged.PathConvention = over.PathConvention
	}
	if over.ContentExtraction != "" {
		merged.ContentExtraction = over.ContentExtraction
	}
	if over.TokenStrategy != "" {
		merged.TokenStrategy = over.TokenStrategy
	}
	// Deep-merge message types map.
	merged.MessageTypes = mergeMessageTypes(base.MessageTypes, over.MessageTypes)
	// Usage — merge locations (replace if override provides any) and fields (deep merge).
	merged.Usage = mergeUsage(base.Usage, over.Usage)
	return merged
}

func mergeUsage(base, over UsageConfig) UsageConfig {
	merged := base
	if len(over.Locations) > 0 {
		merged.Locations = over.Locations
	}
	merged.Fields = mergeMaps(base.Fields, over.Fields)
	return merged
}

func mergeMessageTypes(base, over map[string]MessageTypeConfig) map[string]MessageTypeConfig {
	if len(base) == 0 && len(over) == 0 {
		return nil
	}
	merged := make(map[string]MessageTypeConfig, len(base)+len(over))
	for k, v := range base {
		merged[k] = v
	}
	for k, v := range over {
		merged[k] = v // override replaces entire type config
	}
	return merged
}

func mergeCommands(base, over CommandsConfig) CommandsConfig {
	merged := base
	if over.Resume != "" {
		merged.Resume = over.Resume
	}
	if over.NewSession != "" {
		merged.NewSession = over.NewSession
	}
	if over.AIGenerate != "" {
		merged.AIGenerate = over.AIGenerate
	}
	if over.PromptTransport != "" {
		merged.PromptTransport = over.PromptTransport
	}
	return merged
}

func mergePricing(base, over PricingConfig) PricingConfig {
	merged := base
	if over.DefaultTier != "" {
		merged.DefaultTier = over.DefaultTier
	}
	// Deep-merge tiers map — add/replace tiers, preserve unmentioned.
	merged.Tiers = mergePriceTiers(base.Tiers, over.Tiers)
	return merged
}

func mergePriceTiers(base, over map[string]PriceTier) map[string]PriceTier {
	if len(base) == 0 && len(over) == 0 {
		return nil
	}
	merged := make(map[string]PriceTier, len(base)+len(over))
	for k, v := range base {
		merged[k] = v
	}
	for k, v := range over {
		merged[k] = v // override replaces entire tier
	}
	return merged
}

func mergeAdapter(base, over AdapterConfig) AdapterConfig {
	merged := base
	if over.GoPackage != "" {
		merged.GoPackage = over.GoPackage
	}
	if len(over.Overrides) > 0 {
		merged.Overrides = over.Overrides
	}
	return merged
}

// mergeMaps deep-merges string maps. Override keys overlay base keys;
// base keys not in override are preserved.
func mergeMaps(base, over map[string]string) map[string]string {
	if len(base) == 0 && len(over) == 0 {
		return nil
	}
	merged := make(map[string]string, len(base)+len(over))
	for k, v := range base {
		merged[k] = v
	}
	for k, v := range over {
		merged[k] = v
	}
	return merged
}

// ---------------------------------------------------------------------------
// Override file I/O
// ---------------------------------------------------------------------------

// WriteOverride writes a ProviderConfig as YAML to the given path.
// Creates parent directories if they don't exist.
func WriteOverride(path string, cfg *ProviderConfig) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create override dir %s: %w", dir, err)
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write override %s: %w", path, err)
	}

	return nil
}

// OverridePath returns the override file path for a provider.
func OverridePath(name string) string {
	return ExpandPath(fmt.Sprintf("~/.phantom-os/providers/%s.yaml", name))
}

// CustomProviderPath returns the custom provider file path.
func CustomProviderPath(name string) string {
	return ExpandPath(fmt.Sprintf("~/.phantom-os/providers/custom/%s.yaml", name))
}

// HasOverride returns true if a user override file exists for the named provider.
func HasOverride(name string) bool {
	_, err := os.Stat(OverridePath(name))
	return err == nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ExpandPath replaces a leading ~ with the user's home directory and
// cleans the resulting path.
func ExpandPath(p string) string {
	if strings.HasPrefix(p, "~/") || p == "~" {
		home, err := os.UserHomeDir()
		if err != nil {
			return p
		}
		return filepath.Join(home, p[1:])
	}
	return filepath.Clean(p)
}
