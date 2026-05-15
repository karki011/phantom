// Author: Subash Karki

import { createSignal, createMemo, onCleanup } from 'solid-js';
import { sessions } from './sessions';
import { worktreeMap } from './worktrees';
import { projects } from './projects';
import { listTerminals, type TerminalInfo } from '../bindings/terminal';
import type { Session } from '../types/index';

export interface LiveWorktree {
  worktreeId: string;
  projectId: string;
  projectName: string;
  branch: string;
  worktreePath: string;
  terminalCount: number;
  session?: Session;
}

const [activeTerminals, setActiveTerminals] = createSignal<TerminalInfo[]>([]);

let polling: ReturnType<typeof setInterval> | undefined;

export function bootstrapLiveSessions(): void {
  listTerminals().then(setActiveTerminals);
  polling = setInterval(() => {
    listTerminals().then(setActiveTerminals);
  }, 3_000);
}

export function cleanupLiveSessions(): void {
  if (polling) { clearInterval(polling); polling = undefined; }
}

export const liveWorktrees = createMemo<LiveWorktree[]>(() => {
  const terminals = activeTerminals();
  if (terminals.length === 0) return [];

  const projectMap = new Map(projects().map((p) => [p.id, p]));
  const activeSessions = sessions().filter(
    (s) => s.status === 'active' || s.status === 'paused',
  );
  const wtMap = worktreeMap();
  const result: LiveWorktree[] = [];
  const seen = new Set<string>();

  for (const [projectId, worktrees] of Object.entries(wtMap)) {
    for (const wt of worktrees) {
      const wtPath = wt.worktree_path;
      if (!wtPath || seen.has(wt.id)) continue;

      const matching = terminals.filter((t) => t.cwd?.startsWith(wtPath));
      if (matching.length === 0) continue;
      seen.add(wt.id);

      const session = activeSessions.find(
        (s) => s.cwd?.startsWith(wtPath) || s.repo === wtPath,
      );

      const project = projectMap.get(projectId);
      result.push({
        worktreeId: wt.id,
        projectId,
        projectName: project?.name ?? 'Unknown',
        branch: wt.branch,
        worktreePath: wtPath,
        terminalCount: matching.length,
        session,
      });
    }
  }

  result.sort((a, b) => b.terminalCount - a.terminalCount);
  return result;
});
