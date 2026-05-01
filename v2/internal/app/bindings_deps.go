// Author: Subash Karki
package app

import (
	"context"
	"fmt"
	"os"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// RecheckProviderHealth re-runs HealthCheck for a single provider by name.
func (a *App) RecheckProviderHealth(name string) (*provider.HealthStatus, error) {
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

// SetProviderBinaryPath persists a user-supplied absolute path as the highest
// priority entry in the provider's binary_paths fallback list. Empty path
// clears any custom override but leaves the builtin defaults.
func (a *App) SetProviderBinaryPath(name, absPath string) error {
	if a.provRegistry == nil {
		return fmt.Errorf("provider registry not initialised")
	}
	if _, ok := a.provRegistry.Get(name); !ok {
		return fmt.Errorf("provider %q not found", name)
	}

	if absPath != "" {
		if _, err := os.Stat(absPath); err != nil {
			return fmt.Errorf("path does not exist: %s", absPath)
		}
	}

	overridePath := provider.OverridePath(name)
	cfg, err := a.loadOrCreateOverride(overridePath, name)
	if err != nil {
		return fmt.Errorf("load override for %q: %w", name, err)
	}

	if absPath == "" {
		cfg.Detection.BinaryPaths = nil
	} else {
		cfg.Detection.BinaryPaths = []string{absPath}
	}

	if err := provider.WriteOverride(overridePath, cfg); err != nil {
		return fmt.Errorf("write override for %q: %w", name, err)
	}

	return a.reloadRegistry()
}
