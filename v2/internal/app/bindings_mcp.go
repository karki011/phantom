// bindings_mcp.go exposes MCP server list/toggle methods to the Wails frontend.
// Backed by internal/integration/mcp_list.go which reads ~/.mcp.json and
// the enabledMcpjsonServers whitelist in ~/.claude/settings.json.
// Author: Subash Karki
package app

import (
	"github.com/charmbracelet/log"

	"github.com/subashkarki/phantom-os-v2/internal/integration"
)

// ListMCPServers returns every MCP server registered in ~/.mcp.json with
// an `enabled` flag derived from the Claude Code whitelist.
func (a *App) ListMCPServers() []integration.MCPServer {
	servers, err := integration.ListMCPServers()
	if err != nil {
		log.Error("app: list mcp servers failed", "err", err)
		return []integration.MCPServer{}
	}
	if servers == nil {
		return []integration.MCPServer{}
	}
	return servers
}

// ToggleMCPServer flips the enabled state of an MCP server in
// ~/.claude/settings.json. Returns an error string ("" on success) so the
// frontend can surface it in a toast.
func (a *App) ToggleMCPServer(name string, enabled bool) string {
	if err := integration.ToggleMCPServer(name, enabled); err != nil {
		log.Error("app: toggle mcp server failed", "name", name, "err", err)
		return err.Error()
	}
	return ""
}

// RegisterPhantomMCPBinding is exposed to the frontend so the MCP Manager
// dialog's empty-state can offer a "Register phantom-ai" CTA without going
// through the onboarding flow.
func (a *App) RegisterPhantomMCPBinding() string {
	if err := integration.RegisterPhantomMCP(); err != nil {
		log.Error("app: register phantom-ai mcp failed", "err", err)
		return err.Error()
	}
	return ""
}
