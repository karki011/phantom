// Package provider — Provider Registry.
//
// The Registry manages all known providers, loading them from YAML configs
// and allowing manual registration of Go adapters. It provides discovery,
// lookup, and health-check capabilities.
//
// Config loading follows a 3-tier priority order:
//  1. Embedded configs (builtin defaults — compiled into the binary)
//  2. User overrides from ~/.phantom-os/providers/ (deep-merged onto builtins)
//  3. Custom providers from ~/.phantom-os/providers/custom/ (entirely new providers)
//
// Error handling tiers:
//  - Embedded YAML errors = fatal (these should never happen)
//  - User override YAML errors = log warning, skip override, use builtin
//  - Custom provider YAML errors = log warning, skip that provider
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Registry holds all registered providers.
type Registry struct {
	mu        sync.RWMutex
	providers map[string]Provider
	configs   map[string]*ProviderConfig
	factories map[string]AdapterFactory
}

// NewRegistry creates an empty Registry.
func NewRegistry() *Registry {
	return &Registry{
		providers: make(map[string]Provider),
		configs:   make(map[string]*ProviderConfig),
		factories: make(map[string]AdapterFactory),
	}
}

// LoadFromDir reads all YAML files from a directory and registers a
// ConfigProvider for each valid config. Returns an error if the directory
// cannot be read, but skips individual files that fail to parse.
func (r *Registry) LoadFromDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read config dir %s: %w", dir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}

		path := filepath.Join(dir, name)
		cfg, err := LoadConfig(path)
		if err != nil {
			continue // skip unparseable files
		}

		if err := cfg.Validate(); err != nil {
			continue // skip invalid configs
		}

		r.mu.Lock()
		r.configs[cfg.Provider] = cfg
		// Only register a ConfigProvider if no Go adapter has been registered yet
		if _, exists := r.providers[cfg.Provider]; !exists {
			r.providers[cfg.Provider] = NewConfigProvider(cfg)
		}
		r.mu.Unlock()
	}

	return nil
}

// LoadFromEmbed loads configs from the embedded filesystem.
func (r *Registry) LoadFromEmbed() error {
	entries, err := EmbeddedConfigs.ReadDir("configs")
	if err != nil {
		return fmt.Errorf("read embedded configs: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}

		data, err := EmbeddedConfigs.ReadFile("configs/" + name)
		if err != nil {
			continue
		}

		cfg, err := ParseConfigBytes(data)
		if err != nil {
			continue
		}

		if err := cfg.Validate(); err != nil {
			continue
		}

		r.mu.Lock()
		r.configs[cfg.Provider] = cfg
		if _, exists := r.providers[cfg.Provider]; !exists {
			r.providers[cfg.Provider] = NewConfigProvider(cfg)
		}
		r.mu.Unlock()
	}

	return nil
}

// Register manually registers a Provider. This is used by Go adapters
// that need to override ConfigProvider methods. If a config for this
// provider name was already loaded, it remains accessible via Config().
func (r *Registry) Register(name string, p Provider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[name] = p
}

// Get returns a provider by name.
func (r *Registry) Get(name string) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.providers[name]
	return p, ok
}

// Config returns the raw ProviderConfig for a given provider name.
func (r *Registry) Config(name string) (*ProviderConfig, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	cfg, ok := r.configs[name]
	return cfg, ok
}

// Enabled returns all providers that are both enabled in config and
// installed on the system.
func (r *Registry) Enabled() []Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []Provider
	for _, p := range r.providers {
		if p.Enabled() && p.IsInstalled() {
			result = append(result, p)
		}
	}
	return result
}

// All returns every registered provider regardless of enabled/installed state.
func (r *Registry) All() []Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]Provider, 0, len(r.providers))
	for _, p := range r.providers {
		result = append(result, p)
	}
	return result
}

// Names returns the names of all registered providers.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.providers))
	for name := range r.providers {
		names = append(names, name)
	}
	return names
}

// AutoDetect runs HealthCheck on all registered providers and returns
// a map of provider name to health status.
func (r *Registry) AutoDetect() map[string]HealthStatus {
	r.mu.RLock()
	providers := make(map[string]Provider, len(r.providers))
	for name, p := range r.providers {
		providers[name] = p
	}
	r.mu.RUnlock()

	ctx := context.Background()
	results := make(map[string]HealthStatus, len(providers))
	for name, p := range providers {
		results[name] = p.HealthCheck(ctx)
	}
	return results
}

// ---------------------------------------------------------------------------
// 3-Tier Config Loading
// ---------------------------------------------------------------------------

// AdapterFactory is a function that creates a Provider from a ProviderConfig.
// Used by the registry to instantiate Go adapters based on the adapter.go_package
// field in the YAML config.
type AdapterFactory func(cfg *ProviderConfig) Provider

// RegisterAdapterFactory registers a factory function for a given adapter
// package name. This allows Go adapters to register themselves so the
// registry can instantiate them automatically during LoadAll.
func (r *Registry) RegisterAdapterFactory(goPackage string, factory AdapterFactory) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.factories == nil {
		r.factories = make(map[string]AdapterFactory)
	}
	r.factories[goPackage] = factory
}

// LoadAll loads configs in priority order: embedded -> user overrides -> custom.
//
// Error handling follows the 3-tier strategy:
//   - Embedded config errors are fatal (returned as error)
//   - User override errors are logged and skipped (builtin used instead)
//   - Custom provider errors are logged and skipped
func (r *Registry) LoadAll() error {
	// 1. Load embedded builtins (fatal on error — these are compiled in).
	if err := r.LoadFromEmbed(); err != nil {
		return fmt.Errorf("load embedded configs: %w", err)
	}

	// 2. Load user overrides (deep merge onto builtins).
	userDir := ExpandPath("~/.phantom-os/providers/")
	if _, err := os.Stat(userDir); err == nil {
		if err := r.LoadOverrides(userDir); err != nil {
			slog.Warn("provider registry: failed to load user overrides",
				"dir", userDir, "err", err)
		}
	}

	// 3. Load custom providers (entirely new providers).
	customDir := ExpandPath("~/.phantom-os/providers/custom/")
	if _, err := os.Stat(customDir); err == nil {
		if err := r.LoadFromDir(customDir); err != nil {
			slog.Warn("provider registry: failed to load custom providers",
				"dir", customDir, "err", err)
		}
	}

	return nil
}

// LoadOverrides reads YAML files from dir and deep-merges them onto
// existing configs with the same provider name. Files whose provider
// name doesn't match an existing builtin are logged and skipped.
//
// Returns an error only if the directory itself cannot be read.
// Individual file parse/validation errors are logged and skipped.
func (r *Registry) LoadOverrides(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read override dir %s: %w", dir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}

		path := filepath.Join(dir, name)
		overrideCfg, err := LoadConfig(path)
		if err != nil {
			slog.Warn("provider registry: skip unparseable override",
				"file", path, "err", err)
			continue
		}

		if overrideCfg.Provider == "" {
			slog.Warn("provider registry: skip override with empty provider name",
				"file", path)
			continue
		}

		// Only merge onto existing builtins — don't create new providers from overrides.
		r.mu.RLock()
		baseCfg, exists := r.configs[overrideCfg.Provider]
		r.mu.RUnlock()

		if !exists {
			slog.Warn("provider registry: skip override for unknown provider",
				"file", path, "provider", overrideCfg.Provider)
			continue
		}

		// Deep merge: override onto base.
		merged := MergeConfigs(baseCfg, overrideCfg)
		if err := merged.Validate(); err != nil {
			slog.Warn("provider registry: skip invalid merged config",
				"file", path, "provider", overrideCfg.Provider, "err", err)
			continue
		}

		r.mu.Lock()
		r.configs[merged.Provider] = merged
		// Update the provider to use the merged config.
		r.providers[merged.Provider] = NewConfigProvider(merged)
		r.mu.Unlock()

		slog.Info("provider registry: applied user override",
			"provider", merged.Provider, "file", path)
	}

	return nil
}

// Instantiate creates the correct Provider for a config by dispatching
// to the registered adapter factory based on adapter.go_package.
// Falls back to a generic ConfigProvider if no factory is registered.
func (r *Registry) Instantiate(cfg *ProviderConfig) Provider {
	r.mu.RLock()
	factory, ok := r.factories[cfg.Adapter.GoPackage]
	r.mu.RUnlock()

	if ok {
		return factory(cfg)
	}

	// No registered factory — use the generic config-driven provider.
	return NewConfigProvider(cfg)
}

// Reload clears and reloads all configs and providers, then re-instantiates
// adapters via registered factories. The factories map is preserved across reloads.
func (r *Registry) Reload() error {
	r.mu.Lock()
	r.providers = make(map[string]Provider)
	r.configs = make(map[string]*ProviderConfig)
	r.mu.Unlock()

	if err := r.LoadAll(); err != nil {
		return err
	}

	r.InstantiateAll()
	return nil
}

// InstantiateAll creates Provider instances for all loaded configs using
// the registered adapter factories. After this call, Get() returns fully
// instantiated providers (Go adapters where available, ConfigProvider otherwise).
func (r *Registry) InstantiateAll() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for name, cfg := range r.configs {
		if factory, ok := r.factories[cfg.Adapter.GoPackage]; ok {
			r.providers[name] = factory(cfg)
		}
		// If no factory, keep the existing ConfigProvider from Load phase.
	}
}
