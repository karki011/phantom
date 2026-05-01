// bindings_provider.go exposes provider management to the Wails frontend.
//
// Provides CRUD for providers: list, detail, enable/disable, override config,
// add/remove custom providers, health checks, and active provider switching.
//
// Author: Subash Karki
package app

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"sort"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------------------------------------------------------------------------
// Event constants
// ---------------------------------------------------------------------------

const (
	EventProviderChanged = "provider:changed"
	EventProviderReload  = "provider:reload"
)

// ---------------------------------------------------------------------------
// Frontend-safe view types
// ---------------------------------------------------------------------------

// ProviderInfo is the frontend-friendly representation of a provider.
type ProviderInfo struct {
	Name        string                `json:"name"`
	DisplayName string                `json:"display_name"`
	Icon        string                `json:"icon"`
	Enabled     bool                  `json:"enabled"`
	Installed   bool                  `json:"installed"`
	Version     string                `json:"version"`
	Health      provider.HealthStatus `json:"health"`
	IsActive    bool                  `json:"is_active"`
	IsBuiltin   bool                  `json:"is_builtin"`
	HasOverride bool                  `json:"has_override"`
	Config      *ProviderConfigView   `json:"config"`
}

// ProviderConfigView is a safe subset of ProviderConfig for frontend display.
// Excludes sensitive fields, includes only what the UI needs.
type ProviderConfigView struct {
	Commands  CommandsView  `json:"commands"`
	Pricing   PricingView   `json:"pricing"`
	Paths     PathsView     `json:"paths"`
	Detection DetectionView `json:"detection"`
}

// CommandsView is the frontend-safe view of command templates.
type CommandsView struct {
	Resume          string `json:"resume"`
	NewSession      string `json:"new_session"`
	AIGenerate      string `json:"ai_generate"`
	PromptTransport string `json:"prompt_transport"`
}

// PricingView is the frontend-safe view of pricing configuration.
type PricingView struct {
	DefaultTier string                       `json:"default_tier"`
	Tiers       map[string]PriceTierView     `json:"tiers"`
}

// PriceTierView is the frontend-safe view of a pricing tier.
type PriceTierView struct {
	Match          string  `json:"match"`
	InputPerM      float64 `json:"input_per_m"`
	OutputPerM     float64 `json:"output_per_m"`
	CacheReadPerM  float64 `json:"cache_read_per_m"`
	CacheWritePerM float64 `json:"cache_write_per_m"`
}

// PathsView is the frontend-safe view of provider paths.
// Shows directory names only, not full absolute paths.
type PathsView struct {
	Sessions      string `json:"sessions"`
	Conversations string `json:"conversations"`
	Settings      string `json:"settings"`
	Todos         string `json:"todos"`
	Tasks         string `json:"tasks"`
	Context       string `json:"context"`
}

// DetectionView is the frontend-safe view of provider detection config.
type DetectionView struct {
	Binary         string `json:"binary"`
	VersionPattern string `json:"version_pattern"`
}

// ---------------------------------------------------------------------------
// Bindings — list / detail
// ---------------------------------------------------------------------------

// GetProviders returns info for all known providers (builtin + custom).
func (a *App) GetProviders() []ProviderInfo {
	if a.provRegistry == nil {
		return nil
	}

	all := a.provRegistry.All()
	result := make([]ProviderInfo, 0, len(all))

	for _, p := range all {
		info := a.buildProviderInfo(p)
		result = append(result, info)
	}

	// Sort alphabetically by name for stable ordering.
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result
}

// GetProviderDetail returns full config detail for a specific provider.
func (a *App) GetProviderDetail(name string) (*ProviderInfo, error) {
	if a.provRegistry == nil {
		return nil, fmt.Errorf("provider registry not initialised")
	}

	p, ok := a.provRegistry.Get(name)
	if !ok {
		return nil, fmt.Errorf("provider %q not found", name)
	}

	info := a.buildProviderInfo(p)
	return &info, nil
}

// ---------------------------------------------------------------------------
// Bindings — enable/disable, overrides
// ---------------------------------------------------------------------------

// SetProviderEnabled enables or disables a provider.
// Writes an override YAML to ~/.phantom-os/providers/{name}.yaml.
func (a *App) SetProviderEnabled(name string, enabled bool) error {
	if a.provRegistry == nil {
		return fmt.Errorf("provider registry not initialised")
	}

	if _, ok := a.provRegistry.Get(name); !ok {
		return fmt.Errorf("provider %q not found", name)
	}

	overridePath := provider.OverridePath(name)
	cfg, err := a.loadOrCreateOverride(overridePath, name)
	if err != nil {
		return fmt.Errorf("load override for %q: %w", name, err)
	}

	cfg.Enabled_ = enabled

	if err := provider.WriteOverride(overridePath, cfg); err != nil {
		return fmt.Errorf("write override for %q: %w", name, err)
	}

	return a.reloadRegistry()
}

// UpdateProviderOverride applies a partial config override.
// Accepts a JSON-like map with the fields to override, writes to override YAML.
func (a *App) UpdateProviderOverride(name string, patch map[string]any) error {
	if a.provRegistry == nil {
		return fmt.Errorf("provider registry not initialised")
	}

	if _, ok := a.provRegistry.Get(name); !ok {
		return fmt.Errorf("provider %q not found", name)
	}

	overridePath := provider.OverridePath(name)
	cfg, err := a.loadOrCreateOverride(overridePath, name)
	if err != nil {
		return fmt.Errorf("load override for %q: %w", name, err)
	}

	applyPatch(cfg, patch)

	if err := provider.WriteOverride(overridePath, cfg); err != nil {
		return fmt.Errorf("write override for %q: %w", name, err)
	}

	return a.reloadRegistry()
}

// ResetProviderOverride removes the user's override for a builtin provider.
func (a *App) ResetProviderOverride(name string) error {
	if a.provRegistry == nil {
		return fmt.Errorf("provider registry not initialised")
	}

	overridePath := provider.OverridePath(name)
	if err := os.Remove(overridePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove override for %q: %w", name, err)
	}

	return a.reloadRegistry()
}

// ---------------------------------------------------------------------------
// Bindings — custom providers
// ---------------------------------------------------------------------------

// AddCustomProvider adds a new provider from a YAML string.
// Validates the YAML, writes to ~/.phantom-os/providers/custom/{name}.yaml.
func (a *App) AddCustomProvider(yamlContent string) error {
	if a.provRegistry == nil {
		return fmt.Errorf("provider registry not initialised")
	}

	cfg, err := provider.ParseConfigBytes([]byte(yamlContent))
	if err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}

	if cfg.Provider == "" {
		return fmt.Errorf("provider name is required in YAML")
	}
	if cfg.DisplayName_ == "" {
		return fmt.Errorf("display_name is required in YAML")
	}

	// Check name doesn't conflict with builtins.
	if isBuiltinProvider(cfg.Provider) {
		return fmt.Errorf("provider name %q conflicts with a built-in provider", cfg.Provider)
	}

	path := provider.CustomProviderPath(cfg.Provider)
	if err := provider.WriteOverride(path, cfg); err != nil {
		return fmt.Errorf("write custom provider %q: %w", cfg.Provider, err)
	}

	return a.reloadRegistry()
}

// RemoveCustomProvider deletes a custom provider's YAML file.
func (a *App) RemoveCustomProvider(name string) error {
	if a.provRegistry == nil {
		return fmt.Errorf("provider registry not initialised")
	}

	if isBuiltinProvider(name) {
		return fmt.Errorf("cannot remove built-in provider %q", name)
	}

	path := provider.CustomProviderPath(name)
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("custom provider %q not found", name)
		}
		return fmt.Errorf("remove custom provider %q: %w", name, err)
	}

	return a.reloadRegistry()
}

// ---------------------------------------------------------------------------
// Bindings — health checks & detection
// ---------------------------------------------------------------------------

// TestProvider runs a health check on a specific provider.
func (a *App) TestProvider(name string) (*provider.HealthStatus, error) {
	if a.provRegistry == nil {
		return nil, fmt.Errorf("provider registry not initialised")
	}

	p, ok := a.provRegistry.Get(name)
	if !ok {
		return nil, fmt.Errorf("provider %q not found", name)
	}

	status := p.HealthCheck(context.Background())
	return &status, nil
}

// AutoDetectProviders scans the system for installed AI tools.
func (a *App) AutoDetectProviders() map[string]provider.HealthStatus {
	if a.provRegistry == nil {
		return nil
	}
	return a.provRegistry.AutoDetect()
}

// ---------------------------------------------------------------------------
// Bindings — active provider
// ---------------------------------------------------------------------------

// SetActiveProvider changes which provider is used for new sessions.
func (a *App) SetActiveProvider(name string) error {
	if a.provRegistry == nil {
		return fmt.Errorf("provider registry not initialised")
	}

	p, ok := a.provRegistry.Get(name)
	if !ok {
		return fmt.Errorf("provider %q not found", name)
	}

	if !p.Enabled() {
		return fmt.Errorf("provider %q is not enabled", name)
	}

	a.mu.Lock()
	a.prov = p
	a.mu.Unlock()

	// Emit event so frontend knows the active provider changed.
	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, EventProviderChanged, map[string]string{
			"name":         p.Name(),
			"display_name": p.DisplayName(),
		})
	}

	return nil
}

// GetActiveProvider returns the name of the currently active provider.
func (a *App) GetActiveProvider() string {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if a.prov == nil {
		return ""
	}
	return a.prov.Name()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// builtinProviders is the set of provider names embedded in the binary.
var builtinProviders = map[string]bool{
	"claude": true,
	"codex":  true,
	"gemini": true,
}

// isBuiltinProvider returns true if the name is a built-in provider.
func isBuiltinProvider(name string) bool {
	return builtinProviders[name]
}

// buildProviderInfo creates a ProviderInfo from a Provider.
// When includeConfig is true, the full config view is populated.
func (a *App) buildProviderInfo(p provider.Provider) ProviderInfo {
	name := p.Name()

	health := p.HealthCheck(context.Background())

	info := ProviderInfo{
		Name:        name,
		DisplayName: p.DisplayName(),
		Icon:        p.Icon(),
		Enabled:     p.Enabled(),
		Installed:   health.Installed,
		Version:     health.Version,
		Health:      health,
		IsActive:    a.isActiveProvider(name),
		IsBuiltin:   isBuiltinProvider(name),
		HasOverride: provider.HasOverride(name),
	}

	// Always include config — the frontend needs paths, commands, pricing
	cfg, ok := a.provRegistry.Config(name)
	if ok {
		info.Config = buildConfigView(cfg)
	}

	return info
}

// isActiveProvider checks if the named provider is the currently active one.
func (a *App) isActiveProvider(name string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.prov != nil && a.prov.Name() == name
}

// buildConfigView creates a sanitized config view for the frontend.
func buildConfigView(cfg *provider.ProviderConfig) *ProviderConfigView {
	view := &ProviderConfigView{
		Commands: CommandsView{
			Resume:          cfg.Commands.Resume,
			NewSession:      cfg.Commands.NewSession,
			AIGenerate:      cfg.Commands.AIGenerate,
			PromptTransport: cfg.Commands.PromptTransport,
		},
		Pricing: PricingView{
			DefaultTier: cfg.Pricing.DefaultTier,
			Tiers:       make(map[string]PriceTierView, len(cfg.Pricing.Tiers)),
		},
		Paths: PathsView{
			Sessions:      cfg.Paths.Sessions,
			Conversations: cfg.Paths.Conversations,
			Settings:      cfg.Paths.Settings,
			Todos:         cfg.Paths.Todos,
			Tasks:         cfg.Paths.Tasks,
			Context:       cfg.Paths.Context,
		},
		Detection: DetectionView{
			Binary:         cfg.Detection.Binary,
			VersionPattern: cfg.Detection.VersionPattern,
		},
	}

	for name, tier := range cfg.Pricing.Tiers {
		view.Pricing.Tiers[name] = PriceTierView{
			Match:          tier.Match,
			InputPerM:      tier.InputPerM,
			OutputPerM:     tier.OutputPerM,
			CacheReadPerM:  tier.CacheReadPerM,
			CacheWritePerM: tier.CacheWritePerM,
		}
	}

	return view
}

// OpenProviderPath opens a provider's directory in the OS file manager.
// pathKey is one of: "sessions", "conversations", "todos", "tasks", "context", "settings".
func (a *App) OpenProviderPath(name string, pathKey string) error {
	if a.provRegistry == nil {
		return fmt.Errorf("provider registry not initialized")
	}

	cfg, ok := a.provRegistry.Config(name)
	if !ok {
		return fmt.Errorf("provider %q not found", name)
	}

	var raw string
	switch pathKey {
	case "sessions":
		raw = cfg.Paths.Sessions
	case "conversations":
		raw = cfg.Paths.Conversations
	case "todos":
		raw = cfg.Paths.Todos
	case "tasks":
		raw = cfg.Paths.Tasks
	case "context":
		raw = cfg.Paths.Context
	case "settings":
		raw = cfg.Paths.Settings
	default:
		return fmt.Errorf("unknown path key %q", pathKey)
	}

	if raw == "" {
		return fmt.Errorf("path %q is not configured for provider %q", pathKey, name)
	}

	resolved := provider.ExpandPath(raw)

	if _, err := os.Stat(resolved); err != nil {
		return fmt.Errorf("path does not exist: %s", resolved)
	}

	return exec.Command("open", resolved).Start()
}

// loadOrCreateOverride loads an existing override file or creates a minimal one.
func (a *App) loadOrCreateOverride(path, name string) (*provider.ProviderConfig, error) {
	if _, err := os.Stat(path); err == nil {
		return provider.LoadConfig(path)
	}

	// Create a minimal override with just the provider name.
	return &provider.ProviderConfig{
		Provider: name,
	}, nil
}

// reloadRegistry reloads the provider registry and emits a reload event.
func (a *App) reloadRegistry() error {
	if err := a.provRegistry.Reload(); err != nil {
		return fmt.Errorf("reload provider registry: %w", err)
	}

	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, EventProviderReload, nil)
	}

	return nil
}

// applyPatch applies a map of overrides to a ProviderConfig.
// Supports top-level keys: enabled, display_name, icon, commands, pricing.
func applyPatch(cfg *provider.ProviderConfig, patch map[string]any) {
	if v, ok := patch["enabled"]; ok {
		if b, ok := v.(bool); ok {
			cfg.Enabled_ = b
		}
	}
	if v, ok := patch["display_name"]; ok {
		if s, ok := v.(string); ok {
			cfg.DisplayName_ = s
		}
	}
	if v, ok := patch["icon"]; ok {
		if s, ok := v.(string); ok {
			cfg.Icon_ = s
		}
	}

	// Commands patch
	if cmds, ok := patch["commands"]; ok {
		if m, ok := cmds.(map[string]any); ok {
			if v, ok := m["resume"]; ok {
				if s, ok := v.(string); ok {
					cfg.Commands.Resume = s
				}
			}
			if v, ok := m["new_session"]; ok {
				if s, ok := v.(string); ok {
					cfg.Commands.NewSession = s
				}
			}
			if v, ok := m["ai_generate"]; ok {
				if s, ok := v.(string); ok {
					cfg.Commands.AIGenerate = s
				}
			}
			if v, ok := m["prompt_transport"]; ok {
				if s, ok := v.(string); ok {
					cfg.Commands.PromptTransport = s
				}
			}
		}
	}

	// Detection binary patch
	if det, ok := patch["detection"]; ok {
		if m, ok := det.(map[string]any); ok {
			if v, ok := m["binary"]; ok {
				if s, ok := v.(string); ok {
					cfg.Detection.Binary = s
				}
			}
			if v, ok := m["binary_paths"]; ok {
				if arr, ok := v.([]any); ok {
					paths := make([]string, 0, len(arr))
					for _, item := range arr {
						if s, ok := item.(string); ok && s != "" {
							paths = append(paths, s)
						}
					}
					cfg.Detection.BinaryPaths = paths
				}
			}
		}
	}

	// Paths patch
	if paths, ok := patch["paths"]; ok {
		if m, ok := paths.(map[string]any); ok {
			patchString := func(key string, target *string) {
				if v, ok := m[key]; ok {
					if s, ok := v.(string); ok {
						*target = s
					}
				}
			}
			patchString("sessions", &cfg.Paths.Sessions)
			patchString("conversations", &cfg.Paths.Conversations)
			patchString("settings", &cfg.Paths.Settings)
			patchString("todos", &cfg.Paths.Todos)
			patchString("tasks", &cfg.Paths.Tasks)
			patchString("context", &cfg.Paths.Context)
		}
	}

	// Pricing default tier patch
	if pricing, ok := patch["pricing"]; ok {
		if m, ok := pricing.(map[string]any); ok {
			if v, ok := m["default_tier"]; ok {
				if s, ok := v.(string); ok {
					cfg.Pricing.DefaultTier = s
				}
			}
		}
	}
}
