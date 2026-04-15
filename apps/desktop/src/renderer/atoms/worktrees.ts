/**
 * Worktrees & Projects Jotai Atoms
 * State management for the worktree sidebar system
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import {
  type ProjectData,
  type WorktreeData,
  getProjects,
  getWorktrees,
  createWorktree as apiCreateWorktree,
  deleteWorktree as apiDeleteWorktree,
  updateWorktree as apiUpdateWorktree,
  deleteProject as apiDeleteProject,
  openRepository,
  cloneRepository,
  checkoutBranch,
  createBranch,
} from '../lib/api';
import { disposeSession } from '@phantom-os/terminal';
import { paneStateAtom, stripTerminalPanes, makePane, makeTab } from '@phantom-os/panes';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const projectsDataAtom = atom<ProjectData[]>([]);
const projectsLoadingAtom = atom(false);
const projectsErrorAtom = atom<unknown>(null);

export const projectsAtom = atom((get) =>
  [...get(projectsDataAtom)].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
);
export const projectsLoadingStateAtom = atom((get) => get(projectsLoadingAtom));

export const refreshProjectsAtom = atom(null, async (_get, set) => {
  set(projectsLoadingAtom, true);
  try {
    const data = await getProjects();
    set(projectsDataAtom, data);
    set(projectsErrorAtom, null);
  } catch (err) {
    set(projectsErrorAtom, err);
  } finally {
    set(projectsLoadingAtom, false);
  }
});

// ---------------------------------------------------------------------------
// Worktrees
// ---------------------------------------------------------------------------

const worktreesDataAtom = atom<WorktreeData[]>([]);
const worktreesLoadingAtom = atom(false);
const worktreesErrorAtom = atom<unknown>(null);

export const worktreesAtom = atom((get) => get(worktreesDataAtom));
export const worktreesLoadingStateAtom = atom((get) => get(worktreesLoadingAtom));

export const activeWorktreeIdAtom = atomWithStorage<string | null>(
  'phantom-active-workspace',
  null,
);

export const activeWorktreeAtom = atom((get) => {
  const id = get(activeWorktreeIdAtom);
  if (!id) return null;
  return get(worktreesDataAtom).find((w) => w.id === id) ?? null;
});

/** Worktrees grouped by projectId */
export const worktreesByProjectAtom = atom((get) => {
  const worktrees = get(worktreesDataAtom);
  const grouped = new Map<string, WorktreeData[]>();
  for (const ws of worktrees) {
    const list = grouped.get(ws.projectId) ?? [];
    list.push(ws);
    grouped.set(ws.projectId, list);
  }
  return grouped;
});

export const refreshWorktreesAtom = atom(null, async (get, set, silent?: boolean) => {
  // silent=true skips loading flag (used by background polls to avoid flicker)
  if (!silent) set(worktreesLoadingAtom, true);
  try {
    const data = await getWorktrees();
    // Only update if something actually changed — avoids unnecessary re-renders
    const prev = get(worktreesDataAtom);
    if (JSON.stringify(prev) !== JSON.stringify(data)) {
      set(worktreesDataAtom, data);
    }
    set(worktreesErrorAtom, null);
  } catch (err) {
    set(worktreesErrorAtom, err);
  } finally {
    if (!silent) set(worktreesLoadingAtom, false);
  }
});

export const createWorktreeAtom = atom(
  null,
  async (
    _get,
    set,
    params: { projectId: string; name?: string; branch?: string; baseBranch?: string; ticketUrl?: string },
  ) => {
    const worktree = await apiCreateWorktree(params);
    set(worktreesDataAtom, (prev) => [...prev, worktree]);
    set(activeWorktreeIdAtom, worktree.id);
    return worktree;
  },
);

export const deleteWorktreeAtom = atom(
  null,
  async (get, set, id: string) => {
    const wasActive = get(activeWorktreeIdAtom) === id;

    const result = await apiDeleteWorktree(id);

    // Dispose client-side terminal sessions the server killed
    for (const paneId of result.killedPaneIds ?? []) {
      disposeSession(paneId);
    }

    // If this was the active worktree, dispose ALL its terminal sessions
    // and reset pane state to a clean home tab (bypasses closePaneAtom guards)
    if (wasActive) {
      const paneState = get(paneStateAtom);
      for (const tab of paneState.tabs) {
        for (const pane of Object.values(tab.panes)) {
          if (pane.kind === 'terminal') {
            disposeSession(pane.id);
          }
        }
      }
      // Replace entire pane state with a fresh home tab
      const home = makePane('workspace-home', {}, 'Home');
      const tab = makeTab('Home');
      set(paneStateAtom, { tabs: [tab], activeTabId: tab.id });
    }

    set(worktreesDataAtom, (prev) => prev.filter((w) => w.id !== id));

    // Switch to another worktree or clear
    if (wasActive) {
      const remaining = get(worktreesDataAtom);
      set(activeWorktreeIdAtom, remaining.length > 0 ? remaining[0].id : null);
    }
  },
);

export const updateWorktreeAtom = atom(
  null,
  async (
    _get,
    set,
    params: { id: string; data: Partial<{ name: string; branch: string }> },
  ) => {
    const updated = await apiUpdateWorktree(params.id, params.data);
    set(worktreesDataAtom, (prev) =>
      prev.map((w) => (w.id === params.id ? updated : w)),
    );
    return updated;
  },
);

// ---------------------------------------------------------------------------
// Sidebar UI state
// ---------------------------------------------------------------------------

export const leftSidebarCollapsedAtom = atomWithStorage(
  'phantom-left-sidebar-collapsed',
  false,
);

export const rightSidebarCollapsedAtom = atomWithStorage(
  'phantom-right-sidebar-collapsed',
  false,
);

export const leftSidebarWidthAtom = atomWithStorage(
  'phantom-left-sidebar-width',
  240,
);

export const rightSidebarWidthAtom = atomWithStorage(
  'phantom-right-sidebar-width',
  280,
);

/** Track which projects are expanded in the sidebar */
export const expandedProjectsAtom = atomWithStorage<string[]>(
  'phantom-expanded-projects',
  [],
);

// ---------------------------------------------------------------------------
// Open repository (2-click flow)
// ---------------------------------------------------------------------------

export const openRepositoryAtom = atom(
  null,
  async (_get, set, repoPath: string) => {
    const { project, worktree } = await openRepository(repoPath);
    set(projectsDataAtom, (prev) => {
      if (prev.some((p) => p.id === project.id)) return prev;
      return [...prev, project];
    });
    if (worktree) {
      set(worktreesDataAtom, (prev) => {
        if (prev.some((w) => w.id === worktree.id)) return prev;
        return [...prev, worktree];
      });
      set(activeWorktreeIdAtom, worktree.id);
    }
    set(expandedProjectsAtom, (prev) =>
      prev.includes(project.id) ? prev : [...prev, project.id],
    );
    return { project, worktree };
  },
);

// ---------------------------------------------------------------------------
// Clone repository
// ---------------------------------------------------------------------------

export const cloneRepositoryAtom = atom(
  null,
  async (_get, set, { url, targetDir }: { url: string; targetDir?: string }) => {
    const { project, worktree, clonePath, alreadyExists } = await cloneRepository(url, targetDir);
    set(projectsDataAtom, (prev) => {
      if (prev.some((p) => p.id === project.id)) return prev;
      return [...prev, project];
    });
    if (worktree) {
      set(worktreesDataAtom, (prev) => {
        if (prev.some((w) => w.id === worktree.id)) return prev;
        return [...prev, worktree];
      });
      set(activeWorktreeIdAtom, worktree.id);
    }
    set(expandedProjectsAtom, (prev) =>
      prev.includes(project.id) ? prev : [...prev, project.id],
    );
    return { project, worktree, clonePath, alreadyExists };
  },
);

// ---------------------------------------------------------------------------
// Checkout branch (switch branch for a branch-type worktree)
// ---------------------------------------------------------------------------

export const checkoutBranchAtom = atom(
  null,
  async (_get, set, { worktreeId, branch }: { worktreeId: string; branch: string }) => {
    const updated = await checkoutBranch(worktreeId, branch);
    set(worktreesDataAtom, (prev) =>
      prev.map((w) => (w.id === worktreeId ? { ...w, ...updated } : w)),
    );
    return updated;
  },
);

// ---------------------------------------------------------------------------
// Create branch (create + checkout new branch for a worktree)
// ---------------------------------------------------------------------------

export const createBranchAtom = atom(
  null,
  async (
    _get,
    set,
    { worktreeId, branch, baseBranch }: { worktreeId: string; branch: string; baseBranch?: string },
  ) => {
    const updated = await createBranch(worktreeId, branch, baseBranch);
    set(worktreesDataAtom, (prev) =>
      prev.map((w) => (w.id === worktreeId ? { ...w, ...updated } : w)),
    );
    return updated;
  },
);

// ---------------------------------------------------------------------------
// Delete project
// ---------------------------------------------------------------------------

export const deleteProjectAtom = atom(
  null,
  async (get, set, params: { id: string; deleteWorktrees?: boolean }) => {
    await apiDeleteProject(params.id, params.deleteWorktrees);
    set(projectsDataAtom, (prev) => prev.filter((p) => p.id !== params.id));
    // Remove worktrees belonging to the deleted project
    const removed = get(worktreesDataAtom).filter(
      (w) => w.projectId === params.id,
    );
    set(worktreesDataAtom, (prev) =>
      prev.filter((w) => w.projectId !== params.id),
    );
    // Clear active worktree if it belonged to the deleted project
    const activeId = get(activeWorktreeIdAtom);
    if (activeId && removed.some((w) => w.id === activeId)) {
      set(activeWorktreeIdAtom, null);
    }
    // Remove from expanded
    set(expandedProjectsAtom, (prev) =>
      prev.filter((id) => id !== params.id),
    );
  },
);
