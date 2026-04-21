// PhantomOS v2 — Terminal SolidJS signals
// Author: Subash Karki

import { createSignal } from 'solid-js';

// Map of worktreeId -> sessionId[] (multiple terminals per worktree)
const [terminalSessions, setTerminalSessions] = createSignal<Record<string, string[]>>({});

export function addTerminalSession(worktreeId: string, sessionId: string): void {
  setTerminalSessions((prev) => ({
    ...prev,
    [worktreeId]: [...(prev[worktreeId] ?? []), sessionId],
  }));
}

export function removeTerminalSession(worktreeId: string, sessionId: string): void {
  setTerminalSessions((prev) => ({
    ...prev,
    [worktreeId]: (prev[worktreeId] ?? []).filter((id) => id !== sessionId),
  }));
}

export function getTerminalSessionsForWorktree(worktreeId: string): string[] {
  return terminalSessions()[worktreeId] ?? [];
}

export { terminalSessions };
