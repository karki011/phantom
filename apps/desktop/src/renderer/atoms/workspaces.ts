/**
 * Workspaces & Projects Jotai Atoms
 * State management for the workspace sidebar system
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import {
  type ProjectData,
  type WorkspaceData,
  getProjects,
  createProject,
  getWorkspaces,
  createWorkspace as apiCreateWorkspace,
  deleteWorkspace as apiDeleteWorkspace,
  updateWorkspace as apiUpdateWorkspace,
  deleteProject as apiDeleteProject,
  openRepository,
} from '../lib/api';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const projectsDataAtom = atom<ProjectData[]>([]);
const projectsLoadingAtom = atom(false);
const projectsErrorAtom = atom<unknown>(null);

export const projectsAtom = atom((get) => get(projectsDataAtom));
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

export const createProjectAtom = atom(
  null,
  async (_get, set, params: { repoPath: string; name?: string }) => {
    const project = await createProject(params);
    set(projectsDataAtom, (prev) => [...prev, project]);
    return project;
  },
);

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

const workspacesDataAtom = atom<WorkspaceData[]>([]);
const workspacesLoadingAtom = atom(false);
const workspacesErrorAtom = atom<unknown>(null);

export const workspacesAtom = atom((get) => get(workspacesDataAtom));
export const workspacesLoadingStateAtom = atom((get) => get(workspacesLoadingAtom));

export const activeWorkspaceIdAtom = atomWithStorage<string | null>(
  'phantom-active-workspace',
  null,
);

export const activeWorkspaceAtom = atom((get) => {
  const id = get(activeWorkspaceIdAtom);
  if (!id) return null;
  return get(workspacesDataAtom).find((w) => w.id === id) ?? null;
});

/** Workspaces grouped by projectId */
export const workspacesByProjectAtom = atom((get) => {
  const workspaces = get(workspacesDataAtom);
  const grouped = new Map<string, WorkspaceData[]>();
  for (const ws of workspaces) {
    const list = grouped.get(ws.projectId) ?? [];
    list.push(ws);
    grouped.set(ws.projectId, list);
  }
  return grouped;
});

export const refreshWorkspacesAtom = atom(null, async (_get, set) => {
  set(workspacesLoadingAtom, true);
  try {
    const data = await getWorkspaces();
    set(workspacesDataAtom, data);
    set(workspacesErrorAtom, null);
  } catch (err) {
    set(workspacesErrorAtom, err);
  } finally {
    set(workspacesLoadingAtom, false);
  }
});

export const createWorkspaceAtom = atom(
  null,
  async (
    _get,
    set,
    params: { projectId: string; name?: string; branch?: string; baseBranch?: string },
  ) => {
    const workspace = await apiCreateWorkspace(params);
    set(workspacesDataAtom, (prev) => [...prev, workspace]);
    set(activeWorkspaceIdAtom, workspace.id);
    return workspace;
  },
);

export const deleteWorkspaceAtom = atom(
  null,
  async (get, set, id: string) => {
    await apiDeleteWorkspace(id);
    set(workspacesDataAtom, (prev) => prev.filter((w) => w.id !== id));
    // If we deleted the active workspace, clear it
    if (get(activeWorkspaceIdAtom) === id) {
      set(activeWorkspaceIdAtom, null);
    }
  },
);

export const updateWorkspaceAtom = atom(
  null,
  async (
    _get,
    set,
    params: { id: string; data: Partial<{ name: string; branch: string }> },
  ) => {
    const updated = await apiUpdateWorkspace(params.id, params.data);
    set(workspacesDataAtom, (prev) =>
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
    const { project, workspace } = await openRepository(repoPath);
    set(projectsDataAtom, (prev) => {
      if (prev.some((p) => p.id === project.id)) return prev;
      return [...prev, project];
    });
    if (workspace) {
      set(workspacesDataAtom, (prev) => {
        if (prev.some((w) => w.id === workspace.id)) return prev;
        return [...prev, workspace];
      });
      set(activeWorkspaceIdAtom, workspace.id);
    }
    set(expandedProjectsAtom, (prev) =>
      prev.includes(project.id) ? prev : [...prev, project.id],
    );
    return { project, workspace };
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
    // Remove workspaces belonging to the deleted project
    const removed = get(workspacesDataAtom).filter(
      (w) => w.projectId === params.id,
    );
    set(workspacesDataAtom, (prev) =>
      prev.filter((w) => w.projectId !== params.id),
    );
    // Clear active workspace if it belonged to the deleted project
    const activeId = get(activeWorkspaceIdAtom);
    if (activeId && removed.some((w) => w.id === activeId)) {
      set(activeWorkspaceIdAtom, null);
    }
    // Remove from expanded
    set(expandedProjectsAtom, (prev) =>
      prev.filter((id) => id !== params.id),
    );
  },
);
