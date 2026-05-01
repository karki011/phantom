// Author: Subash Karki

import type { Project, Workspace, WorktreeStatus, Recipe } from '../types';

interface ProjectProfile {
  name: string;
  repo_path: string;
  language: string | null;
  framework: string | null;
}
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export async function getProjects(): Promise<Project[]> {
  try {
    const raw = (await App()?.GetProjects()) ?? [];
    return normalize<Project[]>(raw);
  } catch {
    return [];
  }
}

export async function addProject(repoPath: string): Promise<Project | null> {
  try {
    const raw = (await App()?.AddProject(repoPath)) ?? null;
    return raw ? normalize<Project>(raw) : null;
  } catch {
    return null;
  }
}

export async function detectProject(repoPath: string): Promise<ProjectProfile | null> {
  try {
    return (await App()?.DetectProject(repoPath)) ?? null;
  } catch {
    return null;
  }
}

export async function getProjectRecipes(projectId: string): Promise<Recipe[]> {
  try {
    const raw = (await App()?.GetProjectRecipes(projectId)) ?? [];
    return normalize<Recipe[]>(raw);
  } catch {
    return [];
  }
}

export async function listWorktrees(projectId: string): Promise<Workspace[]> {
  try {
    const raw = (await App()?.ListWorktrees(projectId)) ?? [];
    return normalize<Workspace[]>(raw);
  } catch {
    return [];
  }
}

export async function getAllWorktreeStatus(): Promise<WorktreeStatus[]> {
  try {
    const raw = (await App()?.GetAllWorktreeStatus()) ?? [];
    return normalize<WorktreeStatus[]>(raw);
  } catch {
    return [];
  }
}

export async function removeProject(id: string): Promise<boolean> {
  console.log('[bindings] removeProject called:', id);
  try {
    await App()?.RemoveProject(id);
    console.log('[bindings] removeProject success');
    return true;
  } catch (err) {
    console.error('[bindings] removeProject error:', err);
    return false;
  }
}

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    return (await App()?.IsGitRepo(path)) ?? false;
  } catch {
    return false;
  }
}

export async function initGitRepo(path: string): Promise<boolean> {
  try {
    await App()?.InitGitRepo(path);
    return true;
  } catch {
    return false;
  }
}

export async function browseDirectory(title: string): Promise<string> {
  try {
    return (await App()?.BrowseDirectory(title)) ?? '';
  } catch {
    return '';
  }
}

export async function scanDirectory(parentPath: string): Promise<string[]> {
  try {
    return (await App()?.ScanDirectory(parentPath)) ?? [];
  } catch {
    return [];
  }
}

export async function cloneRepository(url: string, destPath: string): Promise<Project | null> {
  const raw = (await App()?.CloneRepository(url, destPath)) ?? null;
  return raw ? normalize<Project>(raw) : null;
}

export async function toggleStarProject(id: string): Promise<boolean> {
  const result = await App()?.ToggleStarProject(id);
  return result ?? false;
}
