// bindings_mcp.go exposes MCP server list/toggle methods to the Wails frontend.
// Backed by internal/integration/mcp_list.go which reads ~/.mcp.json and
// the enabledMcpjsonServers whitelist in ~/.claude/settings.json.
// Author: Subash Karki
package app

import (
	"fmt"

	"github.com/charmbracelet/log"

	"github.com/subashkarki/phantom-os-v2/internal/db"
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
		a.emitMCPFailure("register", err)
		return err.Error()
	}
	return ""
}

// GetMCPRegistrationStatus reports whether the phantom-ai MCP entry is
// present in ~/.mcp.json and points at the correct binary. Used by the
// onboarding consent screen to surface a "Repair" CTA when the registration
// is missing or stale.
func (a *App) GetMCPRegistrationStatus() integration.MCPRegistrationStatus {
	return integration.GetMCPRegistrationStatus()
}

// RepairMCPRegistration re-runs registration (writes ~/.mcp.json + enables
// in ~/.claude/settings.json) and re-applies per-project enablement for
// every linked workspace. Returns "" on success, an error string otherwise.
// Also emits mcp:registration-failed so the toast listener fires whether the
// user clicked Repair from onboarding or the MCP manager.
func (a *App) RepairMCPRegistration() string {
	if err := integration.RegisterPhantomMCP(); err != nil {
		log.Error("app: repair mcp registration failed", "err", err)
		a.emitMCPFailure("register", err)
		return err.Error()
	}
	if a.DB != nil {
		q := db.New(a.DB.Reader)
		projects, err := q.ListProjects(a.ctx)
		if err != nil {
			log.Warn("app: repair mcp — list projects failed", "err", err)
			return ""
		}
		paths := make([]string, 0, len(projects))
		for _, p := range projects {
			if p.RepoPath != "" {
				paths = append(paths, p.RepoPath)
			}
		}
		_, failed := integration.EnsureProjectsHaveMCP(paths)
		if failed > 0 {
			a.emitMCPFailure("enable-projects", fmt.Errorf("%d of %d project(s) failed to enable phantom-ai (see logs)", failed, len(paths)))
		}
	}
	return ""
}
