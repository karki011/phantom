// mcp_config.go — Register/unregister phantom-ai MCP server globally.
// Writes to ~/.mcp.json and manages enabledMcpjsonServers in ~/.claude/settings.json.
// Port of v1 TypeScript implementation in packages/server/src/services/mcp-config.ts.
// Author: Subash Karki
package integration

import (
	"log/slog"
	"os"
	"path/filepath"
)

const serverName = "phantom-ai"

// findStdioEntryPath locates the MCP stdio-entry.ts file.
// Walks up from the running binary to find the phantom-os root,
// then falls back to well-known locations.
func findStdioEntryPath() string {
	const relPath = "packages/server/src/mcp/stdio-entry.ts"

	// Strategy 1: Walk up from the running binary.
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		for i := 0; i < 6; i++ {
			candidate := filepath.Join(dir, relPath)
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
			dir = filepath.Dir(dir)
		}
	}

	// Strategy 2: Well-known locations relative to home.
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "phantom-os"),
		filepath.Join(home, "Phantom-OS"),
		filepath.Join(home, "CZ", "phantom-os"),
	}
	for _, root := range candidates {
		entry := filepath.Join(root, relPath)
		if _, err := os.Stat(entry); err == nil {
			return entry
		}
	}

	// Fallback: best-guess path.
	return filepath.Join(home, "phantom-os", relPath)
}

// RegisterPhantomMCP registers the phantom-ai MCP server globally.
// Writes the server definition to ~/.mcp.json and ensures it appears
// in the enabledMcpjsonServers list in ~/.claude/settings.json.
// Idempotent — safe to call multiple times.
func RegisterPhantomMCP() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	entryPath := findStdioEntryPath()

	serverDef := map[string]any{
		"command": "npx",
		"args":    []any{"tsx", entryPath},
		"env": map[string]any{
			"PHANTOM_API_PORT": "3849",
		},
	}

	// ── ~/.mcp.json ──────────────────────────────────────────────────────
	mcpPath := filepath.Join(home, ".mcp.json")
	config := readJSONFile(mcpPath)

	servers, _ := config["mcpServers"].(map[string]any)
	if servers == nil {
		servers = make(map[string]any)
	}

	// Check if already registered with the same entry path (skip write).
	if existing, ok := servers[serverName].(map[string]any); ok {
		if args, ok := existing["args"].([]any); ok && len(args) >= 2 {
			if args[1] == entryPath {
				slog.Info("🧠 MCP already registered with correct path", "path", mcpPath)
				return ensureEnabledInClaudeSettings(home)
			}
		}
	}

	servers[serverName] = serverDef
	config["mcpServers"] = servers
	if err := writeJSONFile(mcpPath, config); err != nil {
		return err
	}
	slog.Info("🧠 MCP registered", "path", mcpPath, "entry", entryPath)

	return ensureEnabledInClaudeSettings(home)
}

// ensureEnabledInClaudeSettings adds phantom-ai to the enabledMcpjsonServers
// list in ~/.claude/settings.json. Claude only activates servers from .mcp.json
// that appear in this whitelist.
func ensureEnabledInClaudeSettings(home string) error {
	settingsPath := filepath.Join(home, ".claude", "settings.json")
	settings := readJSONFile(settingsPath)

	enabled, _ := settings["enabledMcpjsonServers"].([]any)
	if containsString(enabled, serverName) {
		return nil
	}

	enabled = append(enabled, serverName)
	settings["enabledMcpjsonServers"] = enabled
	if err := writeJSONFile(settingsPath, settings); err != nil {
		return err
	}
	slog.Info("🧠 MCP enabled in Claude settings")
	return nil
}

// UnregisterPhantomMCP removes phantom-ai from ~/.mcp.json and
// the enabledMcpjsonServers list in ~/.claude/settings.json.
func UnregisterPhantomMCP() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	// ── Remove from ~/.mcp.json ──────────────────────────────────────────
	mcpPath := filepath.Join(home, ".mcp.json")
	config := readJSONFile(mcpPath)
	if servers, ok := config["mcpServers"].(map[string]any); ok {
		if _, exists := servers[serverName]; exists {
			delete(servers, serverName)
			config["mcpServers"] = servers
			if err := writeJSONFile(mcpPath, config); err != nil {
				slog.Warn("🧠 Failed to remove MCP from config", "err", err)
			} else {
				slog.Info("🧠 MCP removed from config", "path", mcpPath)
			}
		}
	}

	// ── Remove from enabledMcpjsonServers ────────────────────────────────
	settingsPath := filepath.Join(home, ".claude", "settings.json")
	settings := readJSONFile(settingsPath)
	if enabled, ok := settings["enabledMcpjsonServers"].([]any); ok {
		filtered := removeString(enabled, serverName)
		settings["enabledMcpjsonServers"] = filtered
		if err := writeJSONFile(settingsPath, settings); err != nil {
			slog.Warn("🧠 Failed to update Claude settings", "err", err)
		} else {
			slog.Info("🧠 MCP removed from Claude settings")
		}
	}

	return nil
}
