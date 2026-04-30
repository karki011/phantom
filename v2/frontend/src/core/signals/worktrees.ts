// Phantom — Worktree signals
// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import { onWailsEvent } from '../events';
import { projects, bootstrapProjects } from './projects';
import { activeWorktreeId, setActiveWorktreeId } from './app';
import { listWorktrees, createWorktree, removeWorktree, getAllWorktreeStatus } from '../bindings';
import { setPref, loadPref } from './preferences';
import { clearWorktreeCache } from '../panes/signals';
import type { Workspace, WorktreeStatus } from '../types';

// Worktree data per project (keyed by project id)
const [worktreeMap, setWorktreeMap] = createSignal<Record<string, Workspace[]>>({});

// Worktree git status per path
const [statusMap, setStatusMap] = createSignal<Record<string, WorktreeStatus>>({});

// Sidebar UI state
const [expandedProjects, setExpandedProjects] = createSignal<Set<string>>(new Set());
const [leftSidebarWidth, setLeftSidebarWidth] = createSignal(260);
const [leftSidebarCollapsed, setLeftSidebarCollapsed] = createSignal(false);
// True while the user is dragging the resize handle — used to pause the
// collapse/expand width animation so per-pixel drag doesn't ease.
const [isLeftResizing, setIsLeftResizing] = createSignal(false);
const [sidebarSearch, setSidebarSearch] = createSignal('');

// Which project is showing the inline create input
const [creatingInProject, setCreatingInProject] = createSignal<string | null>(null);

// Derived: filtered projects based on search query
export const filteredProjects = createMemo(() => {
  const query = sidebarSearch().toLowerCase().trim();
  if (!query) return projects();
  return projects().filter((p) => {
    if (p.name.toLowerCase().includes(query)) return true;
    const wts = worktreeMap()[p.id] ?? [];
    return wts.some((w) => w.branch.toLowerCase().includes(query));
  });
});

// Derived: the currently active worktree (across all projects)
export const activeWorktree = createMemo(() => {
  const wtId = activeWorktreeId();
  if (!wtId) return null;
  for (const workspaces of Object.values(worktreeMap())) {
    const match = workspaces.find((w) => w.id === wtId);
    if (match) return match;
  }
  return null;
});

// Derived: the project that owns the active worktree
export const activeProject = createMemo(() => {
  const wt = activeWorktree();
  if (!wt) return null;
  return projects().find((p) => p.id === wt.project_id) ?? null;
});

// Load worktrees for a single project
async function loadProjectWorktrees(projectId: string): Promise<void> {
  try {
    const wts = await listWorktrees(projectId);
    console.log('[worktrees] loaded for project', projectId, wts);
    setWorktreeMap((prev) => ({ ...prev, [projectId]: wts ?? [] }));
  } catch (err) {
    console.error('[worktrees] failed to load for project', projectId, err);
    setWorktreeMap((prev) => ({ ...prev, [projectId]: [] }));
  }
}

// Load worktrees for all projects
export async function refreshAllWorktrees(): Promise<void> {
  const allProjects = projects();
  await Promise.all(allProjects.map((p) => loadProjectWorktrees(p.id)));
}

// Refresh per-worktree git status (staged/unstaged/untracked counts, ahead/behind)
// keyed by worktree path. Used by the sidebar dirty-file badge and the
// LeftRail branch tooltip. Coalesced via the existing `git:status` event and
// a low-frequency interval poll.
export async function refreshAllWorktreeStatuses(): Promise<void> {
  try {
    const all = await getAllWorktreeStatus();
    const next: Record<string, WorktreeStatus> = {};
    for (const s of all) {
      if (s?.path) next[s.path] = s;
    }
    setStatusMap(next);
  } catch (err) {
    console.error('[worktrees] refreshAllWorktreeStatuses failed', err);
  }
}

// Pick a sibling worktree to restore when the saved active worktree id is
// stale (e.g. removed via `git worktree remove` outside the app). Returns
// null if the project itself is gone or has no worktrees.
//
// Recency proxy: Workspace has no last_active/updated_at column, so we use
// `created_at` desc (newer worktrees more likely to be the user's current
// work) with branch name as a stable tiebreaker.
export function findFallbackWorktreeId(savedProjectId: string): string | null {
  const wts = worktreeMap()[savedProjectId];
  if (!wts || wts.length === 0) return null;
  const sorted = [...wts].sort((a, b) => {
    const byCreated = (b.created_at ?? 0) - (a.created_at ?? 0);
    if (byCreated !== 0) return byCreated;
    return a.branch.localeCompare(b.branch);
  });
  return sorted[0]?.id ?? null;
}

// Bootstrap: load persisted prefs, all worktrees, subscribe to events.
// Idempotent — safe to call from both App.onMount (eager restore) and the
// sidebar mount path; subsequent calls are short-circuited.
let worktreesBootstrapped = false;
export async function bootstrapWorktrees(): Promise<void> {
  if (worktreesBootstrapped) return;
  worktreesBootstrapped = true;

  await bootstrapProjects();
  console.log('[worktrees] bootstrapping, projects:', projects().length);
  await refreshAllWorktrees();
  console.log('[worktrees] bootstrap complete, worktreeMap:', worktreeMap());

  // Initial status load + low-frequency poll (every 15s) so dirty-file badges
  // stay reasonably fresh even if fsnotify misses an event. The `git:status`
  // event below covers the common case in real time.
  refreshAllWorktreeStatuses();
  setInterval(() => {
    refreshAllWorktreeStatuses();
  }, 15_000);

  // Restore sidebar width
  const savedWidth = await loadPref('sidebar_width');
  if (savedWidth) {
    const parsed = parseInt(savedWidth, 10);
    if (!Number.isNaN(parsed)) setLeftSidebarWidth(parsed);
  }

  // Restore last-active worktree if it still exists. If the saved id is
  // stale (worktree removed between sessions, malformed pref), try to fall
  // back to another worktree from the same project before clearing. If the
  // project is also gone, clear both prefs and fall through to the welcome
  // screen.
  const savedWt = await loadPref('active_worktree_id');
  if (savedWt) {
    const map = worktreeMap();
    let ownerProjectId: string | null = null;
    for (const [projectId, wts] of Object.entries(map)) {
      if (wts.some((w: Workspace) => w.id === savedWt)) {
        ownerProjectId = projectId;
        break;
      }
    }
    if (ownerProjectId) {
      setActiveWorktreeId(savedWt);
      setExpandedProjects(new Set([ownerProjectId]));
      // Keep active_project_id in sync (back-fill for sessions saved before
      // this pref was introduced).
      setPref('active_project_id', ownerProjectId);
    } else {
      const savedProjectId = await loadPref('active_project_id');
      const fallbackId = savedProjectId ? findFallbackWorktreeId(savedProjectId) : null;
      if (fallbackId && savedProjectId) {
        console.warn(
          '[worktrees] saved active_worktree_id stale, falling back to sibling worktree:',
          { stale: savedWt, fallback: fallbackId, project: savedProjectId },
        );
        setActiveWorktreeId(fallbackId);
        setExpandedProjects(new Set([savedProjectId]));
        setPref('active_worktree_id', fallbackId);
      } else {
        console.warn(
          '[worktrees] saved active_worktree_id no longer exists and no project fallback, clearing:',
          savedWt,
        );
        setPref('active_worktree_id', '');
        setPref('active_project_id', '');
      }
    }
  }

  // Subscribe to backend events — refresh on changes
  onWailsEvent('worktree:created', () => {
    refreshAllWorktrees();
    refreshAllWorktreeStatuses();
  });
  onWailsEvent('worktree:removed', () => {
    refreshAllWorktrees();
    refreshAllWorktreeStatuses();
  });
  onWailsEvent('worktree:updated', () => {
    refreshAllWorktrees();
    refreshAllWorktreeStatuses();
  });
  // git:status fires per .git/index fsnotify event — coalesce bursts into a
  // single refresh so one user edit doesn't trigger N ListWorktrees calls.
  let gitStatusTimer: ReturnType<typeof setTimeout> | null = null;
  onWailsEvent('git:status', () => {
    if (gitStatusTimer) clearTimeout(gitStatusTimer);
    gitStatusTimer = setTimeout(() => {
      gitStatusTimer = null;
      refreshAllWorktrees();
      refreshAllWorktreeStatuses();
    }, 250);
  });
  onWailsEvent('git:branch-changed', () => {
    refreshAllWorktrees();
    refreshAllWorktreeStatuses();
  });
}

// Toggle a project's expanded state
export function toggleProject(projectId: string): void {
  setExpandedProjects((prev) => {
    const next = new Set(prev);
    if (next.has(projectId)) {
      next.delete(projectId);
    } else {
      next.add(projectId);
    }
    // Persist
    setPref('expanded_projects', JSON.stringify([...next]));
    return next;
  });
}

// Select the active worktree, persist, and auto-expand its parent project
export function selectWorktree(worktreeId: string): void {
  setActiveWorktreeId(worktreeId);
  setPref('active_worktree_id', worktreeId);

  // Auto-expand the parent project when selecting a worktree, and persist
  // its project id so we can fall back to a sibling worktree on next launch
  // if this one is removed externally.
  const map = worktreeMap();
  for (const [projectId, wts] of Object.entries(map)) {
    if (wts.some((w: Workspace) => w.id === worktreeId)) {
      setPref('active_project_id', projectId);
      setExpandedProjects((prev) => {
        if (prev.has(projectId)) return prev;
        const next = new Set(prev);
        next.add(projectId);
        setPref('expanded_projects', JSON.stringify([...next]));
        return next;
      });
      break;
    }
  }
}

// Persist sidebar width to prefs
export function persistSidebarWidth(width: number): void {
  setLeftSidebarWidth(width);
  setPref('sidebar_width', String(width));
}

// Create a worktree inline and refresh
export async function createWorktreeForProject(
  projectId: string,
  branch: string,
): Promise<void> {
  await createWorktree(projectId, branch, '');
  await loadProjectWorktrees(projectId);
}

// Remove a worktree, clean up tabs/cache, and switch to local branch if needed
export async function removeWorktreeById(
  projectId: string,
  worktreeId: string,
  worktreePath: string,
): Promise<boolean> {
  const isActive = activeWorktreeId() === worktreeId;

  // Switch away BEFORE removing so no stale callbacks fire against the deleted worktree
  if (isActive) {
    const projectWorktrees = worktreeMap()[projectId] ?? [];
    const fallback = projectWorktrees.find((w) => w.type === 'branch' && w.id !== worktreeId)
      ?? projectWorktrees.find((w) => w.id !== worktreeId);
    if (fallback) {
      selectWorktree(fallback.id);
    } else {
      setActiveWorktreeId(null);
      setPref('active_worktree_id', '');
      setPref('active_project_id', '');
    }
  }

  const ok = await removeWorktree(worktreeId, worktreePath);
  if (!ok) {
    console.error('[worktrees] removeWorktree failed for', worktreeId);
    return false;
  }
  clearWorktreeCache(worktreeId);
  await loadProjectWorktrees(projectId);
  return true;
}

export {
  worktreeMap,
  setWorktreeMap,
  statusMap,
  setStatusMap,
  expandedProjects,
  setExpandedProjects,
  leftSidebarWidth,
  setLeftSidebarWidth,
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  isLeftResizing,
  setIsLeftResizing,
  sidebarSearch,
  setSidebarSearch,
  creatingInProject,
  setCreatingInProject,
};
