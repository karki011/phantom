// Phantom — MCP Manager signals (server list + dialog open state).
// Author: Subash Karki

import { createSignal, createResource } from 'solid-js';
import { listMCPServers, toggleMCPServer as toggleBinding, type MCPServer } from '@/core/bindings/mcp';

const [mcpManagerOpen, setMcpManagerOpen] = createSignal(false);

const [mcpServers, { refetch: refreshMcpServers, mutate: mutateMcpServers }] =
  createResource<MCPServer[]>(async () => await listMCPServers(), { initialValue: [] });

export function openMcpManager(): void {
  setMcpManagerOpen(true);
  // Refresh list each time the dialog opens to pick up out-of-band edits.
  void refreshMcpServers();
}

export function closeMcpManager(): void {
  setMcpManagerOpen(false);
}

/**
 * Optimistically flip a server's enabled flag, then call the backend.
 * If the backend reports an error the UI rolls back automatically.
 */
export async function toggleMcpServer(name: string, enabled: boolean): Promise<string> {
  mutateMcpServers((prev) => (prev ?? []).map((s) => (s.name === name ? { ...s, enabled } : s)));
  const err = await toggleBinding(name, enabled);
  if (err) {
    mutateMcpServers((prev) => (prev ?? []).map((s) => (s.name === name ? { ...s, enabled: !enabled } : s)));
  }
  return err;
}

export { mcpServers, mcpManagerOpen, refreshMcpServers };
