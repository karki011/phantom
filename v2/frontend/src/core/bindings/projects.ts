// Author: Subash Karki

import type { Project, ProjectProfile } from '../types';
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
