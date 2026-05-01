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
	"strings"
)

const (
	serverName    = "phantom-ai"
	mcpBinaryName = "phantom-mcp"
)

// findMCPBinaryPath locates the compiled phantom-mcp Go binary.
// Search order:
//  1. Sibling of the running executable (the .app bundle case — Phantom and
//     phantom-mcp ship in the same Contents/MacOS directory).
//  2. Walk up from the executable looking for build/bin layouts (wails dev).
//  3. Well-known v2 source roots under $HOME (developer machines).
//  4. PATH lookup.
//  5. Fallback: best-guess path under ~/phantom-os/v2/build/bin.
func findMCPBinaryPath() string {
	if exe, err := os.Executable(); err == nil {
		// Strategy 1: Sibling next to the running binary. This is the
		// canonical location inside a packaged Phantom.app — both the GUI
		// binary and phantom-mcp live in Contents/MacOS/.
		sibling := filepath.Join(filepath.Dir(exe), mcpBinaryName)
		if _, err := os.Stat(sibling); err == nil {
			return sibling
		}

		// Strategy 2: Walk up from the running binary, checking common output dirs.
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

	// Strategy 3: Well-known v2 source roots relative to home.
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

	// Strategy 4: PATH lookup.
	if p, err := exec.LookPath(mcpBinaryName); err == nil {
		return p
	}

	// Fallback: best-guess path under v2 build dir.
	return filepath.Join(home, "phantom-os", "v2", "build", "bin", mcpBinaryName)
}

// isStaleV1Entry reports whether the given server definition is the legacy v1
// TypeScript stdio entry point. We force-rewrite those even when an entry
// already exists in ~/.mcp.json.
func isStaleV1Entry(def map[string]any) bool {
	cmd, _ := def["command"].(string)
	if cmd != "npx" {
		return false
	}
	args, _ := def["args"].([]any)
	hasTsx := false
	hasStdioEntry := false
	for _, a := range args {
		s, ok := a.(string)
		if !ok {
			continue
		}
		if s == "tsx" {
			hasTsx = true
		}
		if strings.HasSuffix(s, "stdio-entry.ts") {
			hasStdioEntry = true
		}
	}
	return hasTsx && hasStdioEntry
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

	mcpPath := filepath.Join(home, ".mcp.json")
	config := readJSONFile(mcpPath)

	servers, _ := config["mcpServers"].(map[string]any)
	if servers == nil {
		servers = make(map[string]any)
	}

	if existing, ok := servers[serverName].(map[string]any); ok {
		if isStaleV1Entry(existing) {
			slog.Info("🧠 MCP rewriting stale v1 entry", "path", mcpPath)
		} else if cmd, ok := existing["command"].(string); ok && cmd == binaryPath {
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

// EnsureProjectHasMCP ensures phantom-ai appears in the
// projects.<projectPath>.enabledMcpjsonServers list of ~/.claude.json.
// Claude Code stores per-project trust state there: a project recorded with
// an empty enabledMcpjsonServers array opts the project out of MCP servers
// it would otherwise inherit from the user-global allowlist. Without this,
// the trust dialog only fires once per CWD, leaving the user permanently
// opted out for that workspace.
//
// Best-effort: missing file or missing project entry are not errors. If the
// project has not been recorded yet (Claude Code records on first launch in
// that CWD) we leave a stub entry so the next launch inherits enablement.
func EnsureProjectHasMCP(projectPath string) error {
	if projectPath == "" {
		return nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	claudePath := filepath.Join(home, ".claude.json")
	cfg := readJSONFile(claudePath)

	projects, _ := cfg["projects"].(map[string]any)
	if projects == nil {
		projects = make(map[string]any)
	}

	entry, _ := projects[projectPath].(map[string]any)
	if entry == nil {
		entry = make(map[string]any)
	}

	enabled, _ := entry["enabledMcpjsonServers"].([]any)
	if containsString(enabled, serverName) {
		return nil
	}
	entry["enabledMcpjsonServers"] = append(enabled, serverName)
	projects[projectPath] = entry
	cfg["projects"] = projects

	if err := writeJSONFile(claudePath, cfg); err != nil {
		return err
	}
	slog.Info("🧠 MCP enabled for project", "project", projectPath)
	return nil
}

// EnsureProjectsHaveMCP applies EnsureProjectHasMCP to every supplied path.
// Returns the count of projects updated and the count that errored. Errors
// are logged but never aborted — one bad project shouldn't block the others.
func EnsureProjectsHaveMCP(paths []string) (updated, failed int) {
	for _, p := range paths {
		if err := EnsureProjectHasMCP(p); err != nil {
			slog.Warn("🧠 MCP project enable failed", "project", p, "err", err)
			failed++
			continue
		}
		updated++
	}
	return updated, failed
}

// MCPRegistrationStatus describes the current state of the phantom-ai MCP
// entry in ~/.mcp.json. Used by the onboarding repair UI.
type MCPRegistrationStatus struct {
	Registered bool   `json:"registered"`
	BinaryPath string `json:"binaryPath"`
	Stale      bool   `json:"stale"`
	Error      string `json:"error,omitempty"`
}

// GetMCPRegistrationStatus inspects ~/.mcp.json and reports whether the
// phantom-ai entry exists, points at the expected binary, and is fresh.
func GetMCPRegistrationStatus() MCPRegistrationStatus {
	home, err := os.UserHomeDir()
	if err != nil {
		return MCPRegistrationStatus{Error: err.Error()}
	}
	mcpPath := filepath.Join(home, ".mcp.json")
	cfg := readJSONFile(mcpPath)

	expected := findMCPBinaryPath()
	servers, _ := cfg["mcpServers"].(map[string]any)
	entry, _ := servers[serverName].(map[string]any)
	if entry == nil {
		return MCPRegistrationStatus{Registered: false, BinaryPath: expected}
	}
	if isStaleV1Entry(entry) {
		return MCPRegistrationStatus{Registered: true, Stale: true, BinaryPath: expected}
	}
	cmd, _ := entry["command"].(string)
	return MCPRegistrationStatus{
		Registered: cmd == expected,
		BinaryPath: cmd,
		Stale:      cmd != expected,
	}
}

// UnregisterPhantomMCP removes phantom-ai from ~/.mcp.json and
// the enabledMcpjsonServers list in ~/.claude/settings.json.
func UnregisterPhantomMCP() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

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
