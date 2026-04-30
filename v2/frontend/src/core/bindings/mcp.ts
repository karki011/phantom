// Phantom — Wails bindings for MCP server list/toggle.
// Author: Subash Karki

import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

export async function listMCPServers(): Promise<MCPServer[]> {
  try {
    const raw = (await App()?.ListMCPServers()) ?? [];
    return normalize<MCPServer[]>(raw);
  } catch {
    return [];
  }
}

/**
 * Flips the enabled flag for a given MCP server in
 * ~/.claude/settings.json. Returns an error string (empty on success) so
 * callers can surface it in a toast.
 */
export async function toggleMCPServer(name: string, enabled: boolean): Promise<string> {
  try {
    return (await App()?.ToggleMCPServer(name, enabled)) ?? '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Re-registers the phantom-ai MCP server (writes ~/.mcp.json + adds to
 * enabledMcpjsonServers). Used by the MCP Manager empty-state CTA.
 */
export async function registerPhantomMCP(): Promise<string> {
  try {
    return (await App()?.RegisterPhantomMCPBinding()) ?? '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
