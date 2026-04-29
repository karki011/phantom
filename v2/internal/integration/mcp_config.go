// mcp_config.go — Register/unregister phantom-ai MCP server globally.
// Writes to ~/.mcp.json and manages enabledMcpjsonServers in ~/.claude/settings.json.
// Port of v1 TypeScript implementation in packages/server/src/services/mcp-config.ts.
// Author: Subash Karki
package integration

import (
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
)

const (
	serverName    = "phantom-ai"
	mcpBinaryName = "phantom-mcp"
)

// findMCPBinaryPath locates the compiled phantom-mcp Go binary.
// Walks up from the running binary toward known build/bin locations.
func findMCPBinaryPath() string {
	// Strategy 1: Walk up from the running binary, checking common output dirs.
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		for i := 0; i < 8; i++ {
			candidates := []string{
				filepath.Join(dir, mcpBinaryName),
				filepath.Join(dir, "bin", mcpBinaryName),
				filepath.Join(dir, "build", "bin", mcpBinaryName),
			}
			for _, c := range candidates {
				if _, err := os.Stat(c); err == nil {
					return c
				}
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	// Strategy 2: Well-known v2 source roots relative to home.
	home, _ := os.UserHomeDir()
	roots := []string{
		filepath.Join(home, "phantom-os", "v2"),
		filepath.Join(home, "Phantom-OS", "v2"),
		filepath.Join(home, "CZ", "phantom-os", "v2"),
	}
	for _, root := range roots {
		for _, sub := range []string{"build/bin", "bin"} {
			candidate := filepath.Join(root, sub, mcpBinaryName)
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
		}
	}

	// Strategy 3: PATH lookup.
	if p, err := exec.LookPath(mcpBinaryName); err == nil {
		return p
	}

	// Fallback: best-guess path under v2 build dir.
	return filepath.Join(home, "phantom-os", "v2", "build", "bin", mcpBinaryName)
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

	binaryPath := findMCPBinaryPath()

	serverDef := map[string]any{
		"command": binaryPath,
		"args":    []any{},
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

	// Check if already registered with the same binary path (skip write).
	if existing, ok := servers[serverName].(map[string]any); ok {
		if cmd, ok := existing["command"].(string); ok && cmd == binaryPath {
			slog.Info("🧠 MCP already registered with correct path", "path", mcpPath)
			return ensureEnabledInClaudeSettings(home)
		}
	}

	servers[serverName] = serverDef
	config["mcpServers"] = servers
	if err := writeJSONFile(mcpPath, config); err != nil {
		return err
	}
	slog.Info("🧠 MCP registered", "path", mcpPath, "binary", binaryPath)

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
