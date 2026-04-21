// PhantomOS v2 — Worktree signals
// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import { onWailsEvent } from '../events';
import { projects, bootstrapProjects } from './projects';
import { setActiveWorktreeId } from './app';
import { listWorktrees, createWorktree, removeWorktree } from '../bindings';
import { setPref, loadPref } from './preferences';
import type { Workspace, WorktreeStatus } from '../types';

// Worktree data per project (keyed by project id)
const [worktreeMap, setWorktreeMap] = createSignal<Record<string, Workspace[]>>({});

// Worktree git status per path
const [statusMap, setStatusMap] = createSignal<Record<string, WorktreeStatus>>({});

// Sidebar UI state
const [expandedProjects, setExpandedProjects] = createSignal<Set<string>>(new Set());
const [leftSidebarWidth, setLeftSidebarWidth] = createSignal(260);
const [leftSidebarCollapsed, setLeftSidebarCollapsed] = createSignal(false);
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
async function refreshAllWorktrees(): Promise<void> {
  const allProjects = projects();
  await Promise.all(allProjects.map((p) => loadProjectWorktrees(p.id)));
}

// Bootstrap: load persisted prefs, all worktrees, subscribe to events
export async function bootstrapWorktrees(): Promise<void> {
  await bootstrapProjects();
  console.log('[worktrees] bootstrapping, projects:', projects().length);
  await refreshAllWorktrees();
  console.log('[worktrees] bootstrap complete, worktreeMap:', worktreeMap());

  // Restore sidebar width
  const savedWidth = await loadPref('sidebar_width');
  if (savedWidth) {
    const parsed = parseInt(savedWidth, 10);
    if (!Number.isNaN(parsed)) setLeftSidebarWidth(parsed);
  }

  // Restore active worktree
  const savedWt = await loadPref('active_worktree_id');
  if (savedWt) setActiveWorktreeId(savedWt);

  // Restore expanded projects
  const savedExpanded = await loadPref('expanded_projects');
  if (savedExpanded) {
    try {
      const ids: string[] = JSON.parse(savedExpanded);
      setExpandedProjects(new Set(ids));
    } catch {
      // ignore malformed pref
    }
  }

  // Subscribe to backend events — refresh on changes
  onWailsEvent('worktree:created', () => refreshAllWorktrees());
  onWailsEvent('worktree:removed', () => refreshAllWorktrees());
  onWailsEvent('git:status', () => refreshAllWorktrees());
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

// Select the active worktree and persist
export function selectWorktree(worktreeId: string): void {
  setActiveWorktreeId(worktreeId);
  setPref('active_worktree_id', worktreeId);
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

// Remove a worktree and refresh
export async function removeWorktreeById(
  projectId: string,
  worktreeId: string,
): Promise<void> {
  await removeWorktree(worktreeId);
  await loadProjectWorktrees(projectId);
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
  sidebarSearch,
  setSidebarSearch,
  creatingInProject,
  setCreatingInProject,
};
