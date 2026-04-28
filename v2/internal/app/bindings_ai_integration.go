// Package app — Wails bindings for AI engine integration (MCP + hooks registration).
// Author: Subash Karki
package app

import (
	"log/slog"
	"os"
	"path/filepath"

	"github.com/subashkarki/phantom-os-v2/internal/integration"
)

// ApplyAIEngineConsent is called by the onboarding consent screen and settings UI.
func (a *App) ApplyAIEngineConsent(config map[string]bool) error {
	slog.Info("🧠 Applying AI engine consent", "config", config)

	if mcpEnabled, ok := config["ai.mcpTools"]; ok {
		if mcpEnabled {
			if err := integration.RegisterPhantomMCP(); err != nil {
				slog.Error("🧠 MCP registration failed", "err", err)
			}
		} else {
			if err := integration.UnregisterPhantomMCP(); err != nil {
				slog.Error("🧠 MCP unregistration failed", "err", err)
			}
		}
	}

	anyHookEnabled := config["ai.autoContext"] || config["ai.editGate"] || config["ai.outcomeCapture"] || config["ai.fileSync"]
	if anyHookEnabled {
		if err := integration.RegisterPhantomHooks(findHooksDir(), config); err != nil {
			slog.Error("🧠 Hooks registration failed", "err", err)
		}
	}

	// Save preferences
	if a.DB != nil {
		for k, v := range config {
			val := "false"
			if v {
				val = "true"
			}
			a.DB.Writer.Exec("INSERT OR REPLACE INTO user_preferences (key, value) VALUES (?, ?)", k, val)
		}
	}

	slog.Info("🧠 AI engine consent applied")
	return nil
}

// ToggleAIFeature is called by the settings UI when a single toggle changes.
func (a *App) ToggleAIFeature(key string, enabled bool) error {
	slog.Info("🧠 Toggle AI feature", "key", key, "enabled", enabled)

	if key == "ai.mcpTools" {
		if enabled {
			integration.RegisterPhantomMCP()
		} else {
			integration.UnregisterPhantomMCP()
		}
	}

	if a.DB != nil {
		val := "false"
		if enabled {
			val = "true"
		}
		a.DB.Writer.Exec("INSERT OR REPLACE INTO user_preferences (key, value) VALUES (?, ?)", key, val)
	}

	return nil
}

func findHooksDir() string {
	exe, _ := os.Executable()
	if exe != "" {
		dir := filepath.Dir(exe)
		for i := 0; i < 5; i++ {
			candidate := filepath.Join(dir, "v2", "hooks")
			if info, err := os.Stat(candidate); err == nil && info.IsDir() {
				return candidate
			}
			dir = filepath.Dir(dir)
		}
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "phantom-os", "v2", "hooks")
}
