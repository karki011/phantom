// Author: Subash Karki

import type { ProjectNote } from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export async function listProjectNotes(projectId: string): Promise<ProjectNote[]> {
  try {
    const raw = (await App()?.ListProjectNotes(projectId)) ?? [];
    return normalize<ProjectNote[]>(raw);
  } catch {
    return [];
  }
}

export async function createProjectNote(projectId: string, type: string, title: string): Promise<ProjectNote | null> {
  try {
    const raw = await App()?.CreateProjectNote(projectId, type, title);
    return raw ? normalize<ProjectNote>(raw) : null;
  } catch {
    return null;
  }
}

export async function updateProjectNote(id: string, title: string, body: string, type: string, pinned: boolean): Promise<boolean> {
  try {
    await App()?.UpdateProjectNote(id, title, body, type, pinned);
    return true;
  } catch {
    return false;
  }
}

export async function deleteProjectNote(id: string): Promise<boolean> {
  try {
    await App()?.DeleteProjectNote(id);
    return true;
  } catch {
    return false;
  }
}
