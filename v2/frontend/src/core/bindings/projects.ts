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
