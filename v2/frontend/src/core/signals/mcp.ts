// Phantom — MCP Manager signals (server list + dialog open state).
// Author: Subash Karki

import { createSignal, createResource } from 'solid-js';
import { listMCPServers, toggleMCPServer as toggleBinding, type MCPServer } from '@/core/bindings/mcp';
import { showWarningToast } from '@/shared/Toast/Toast';

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

/**
 * Backend payload for `mcp:registration-failed`. Emitted by the Go layer
 * when self-heal or manual Repair fails to write ~/.mcp.json or enable
 * phantom-ai for a linked project.
 */
interface MCPRegistrationFailedPayload {
  phase: 'register' | 'enable-projects';
  error: string;
  hint?: string;
}

/**
 * Bootstrap the toast listener for MCP registration failures.
 *
 * Issue #10: registration errors used to be silently swallowed in a
 * background goroutine, leaving users staring at "not registered" with
 * no explanation. We surface them as a warning toast that points the
 * user at the Repair button in the AI Engine settings.
 *
 * Idempotent — call once at app boot. Uses the global runtime listener
 * (no Solid `onCleanup` because this never unmounts).
 */
export function bootstrapMCPRegistrationListener(): void {
  if (!window.runtime?.EventsOn) return;
  window.runtime.EventsOn('mcp:registration-failed', (...args: unknown[]) => {
    const payload = args[0] as MCPRegistrationFailedPayload | undefined;
    if (!payload) return;
    const title =
      payload.phase === 'enable-projects'
        ? 'Phantom MCP: project enablement failed'
        : 'Phantom MCP registration failed';
    const detail = payload.hint ? `${payload.hint}\n\n${payload.error}` : payload.error;
    showWarningToast(title, detail);
  });
}

export { mcpServers, mcpManagerOpen, refreshMcpServers };
