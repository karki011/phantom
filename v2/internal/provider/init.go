// Package provider — Config directory initialization.
//
// EnsureConfigDir creates the user config directories for provider overrides
// and custom providers. Called during app boot.
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

import (
	"fmt"
	"os"
)

// EnsureConfigDir creates ~/.phantom-os/providers/ and
// ~/.phantom-os/providers/custom/ if they don't exist.
// Called during app boot to ensure the directory structure is ready
// for user overrides and custom providers.
func EnsureConfigDir() error {
	dirs := []string{
		ExpandPath("~/.phantom-os/providers/"),
		ExpandPath("~/.phantom-os/providers/custom/"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create config dir %s: %w", dir, err)
		}
	}

	return nil
}
