// Author: Subash Karki

import { createSignal, createEffect, on } from 'solid-js';
import { onWailsEvent } from '../events';
import { activeProject } from './worktrees';
import { listProjectNotes, createProjectNote, updateProjectNote, deleteProjectNote } from '../bindings';
import type { ProjectNote } from '../types';

const [projectNotes, setProjectNotes] = createSignal<ProjectNote[]>([]);

export { projectNotes };

export function bootstrapProjectNotes(): void {
  // Reload notes when active project changes
  createEffect(on(() => activeProject()?.id, (projId) => {
    if (!projId) { setProjectNotes([]); return; }
    loadNotes(projId);
  }));

  // Listen for note events from the Go backend
  onWailsEvent('note:created', () => {
    const projId = activeProject()?.id;
    if (projId) loadNotes(projId);
  });
  onWailsEvent('note:updated', () => {
    const projId = activeProject()?.id;
    if (projId) loadNotes(projId);
  });
  onWailsEvent('note:deleted', () => {
    const projId = activeProject()?.id;
    if (projId) loadNotes(projId);
  });
}

async function loadNotes(projectId: string): Promise<void> {
  const notes = await listProjectNotes(projectId);
  setProjectNotes(notes);
}

export async function addNote(type: string, title: string, body?: string): Promise<ProjectNote | null> {
  const projId = activeProject()?.id;
  if (!projId) return null;
  const note = await createProjectNote(projId, type, title);
  if (note && body?.trim()) {
    await updateProjectNote(note.id, title, body, type, false);
  }
  return note;
}

export async function saveNote(id: string, title: string, body: string, type: string, pinned: boolean): Promise<boolean> {
  return updateProjectNote(id, title, body, type, pinned);
}

export async function removeNote(id: string): Promise<boolean> {
  return deleteProjectNote(id);
}
