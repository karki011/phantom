// mcp_list.go — Listing and toggling arbitrary MCP servers from ~/.mcp.json.
// Reads server definitions and the enabledMcpjsonServers whitelist in
// ~/.claude/settings.json. Read-modify-write of settings.json is guarded
// by a best-effort flock to avoid clobbering Claude Code's own writes.
// Author: Subash Karki
package integration

import (
	"errors"
	"log/slog"
	"os"
	"path/filepath"

	"golang.org/x/sys/unix"
)

// MCPServer is the wire shape returned to the Wails frontend.
// Fields use snake_case JSON via struct tags so the SolidJS layer can
// destructure the response without a normalize step.
type MCPServer struct {
	Name    string   `json:"name"`
	Command string   `json:"command"`
	Args    []string `json:"args"`
	Enabled bool     `json:"enabled"`
}

// ListMCPServers reads ~/.mcp.json and ~/.claude/settings.json and
// returns a flat list of every registered MCP server with its enable state.
// Missing files yield an empty slice (not an error) so the UI can show an
// empty-state with a "Register phantom-ai" CTA.
func ListMCPServers() ([]MCPServer, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	mcpPath := filepath.Join(home, ".mcp.json")
	cfg := readJSONFile(mcpPath)
	rawServers, _ := cfg["mcpServers"].(map[string]any)

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	settings := readJSONFile(settingsPath)
	enabled, _ := settings["enabledMcpjsonServers"].([]any)

	servers := make([]MCPServer, 0, len(rawServers))
	for name, raw := range rawServers {
		def, _ := raw.(map[string]any)
		cmd, _ := def["command"].(string)
		args := stringSliceFromAny(def["args"])
		servers = append(servers, MCPServer{
			Name:    name,
			Command: cmd,
			Args:    args,
			Enabled: containsString(enabled, name),
		})
	}
	return servers, nil
}

// ToggleMCPServer flips the membership of `name` in the enabledMcpjsonServers
// array of ~/.claude/settings.json. The MCP server definition in ~/.mcp.json
// is left untouched — Claude Code re-reads the whitelist on each session.
func ToggleMCPServer(name string, enabled bool) error {
	if name == "" {
		return errors.New("mcp: server name required")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	settingsPath := filepath.Join(home, ".claude", "settings.json")

	// Acquire a best-effort exclusive lock on the settings file to reduce
	// the race window with Claude Code's own writers. The lock is advisory;
	// if it fails (lock unsupported, file not yet created, etc.) we fall back
	// to a plain read-modify-write — the existing atomic-rename in
	// writeJSONFile already prevents partial writes.
	unlock := tryLockFile(settingsPath)
	defer unlock()

	settings := readJSONFile(settingsPath)
	current, _ := settings["enabledMcpjsonServers"].([]any)

	var next []any
	if enabled {
		if containsString(current, name) {
			return nil // already enabled — no-op
		}
		next = append(current, name)
	} else {
		if !containsString(current, name) {
			return nil // already disabled — no-op
		}
		next = removeString(current, name)
	}

	settings["enabledMcpjsonServers"] = next
	if err := writeJSONFile(settingsPath, settings); err != nil {
		return err
	}
	slog.Info("🧠 MCP toggle", "name", name, "enabled", enabled)
	return nil
}

// tryLockFile takes an exclusive advisory flock on path. If the file does not
// exist yet it is created with mode 0644. On any error a no-op unlock is
// returned so callers can defer it unconditionally.
func tryLockFile(path string) func() {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return func() {}
	}
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		return func() {}
	}
	if err := unix.Flock(int(f.Fd()), unix.LOCK_EX); err != nil {
		_ = f.Close()
		return func() {}
	}
	return func() {
		_ = unix.Flock(int(f.Fd()), unix.LOCK_UN)
		_ = f.Close()
	}
}

// stringSliceFromAny coerces a JSON []any of strings into []string.
// Non-string entries are skipped; nil input yields a nil slice.
func stringSliceFromAny(v any) []string {
	raw, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
