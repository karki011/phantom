// Author: Subash Karki

import { createSignal, createEffect, on } from 'solid-js';
import { onWailsEvent } from '../events';
import { activeProject } from './worktrees';
import { listProjectNotes, createProjectNote, updateProjectNote, deleteProjectNote } from '../bindings';
import type { ProjectNote } from '../types';

const [projectNotes, setProjectNotes] = createSignal<ProjectNote[]>([]);
const [stickyOverlayVisible, setStickyOverlayVisible] = createSignal(false);
const [expandedNoteIds, setExpandedNoteIds] = createSignal<Set<string>>(new Set());

export { projectNotes, stickyOverlayVisible, expandedNoteIds };

export function toggleNoteExpanded(id: string): void {
  setExpandedNoteIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

export function setNoteExpanded(id: string, open: boolean): void {
  setExpandedNoteIds(prev => {
    const next = new Set(prev);
    if (open) next.add(id); else next.delete(id);
    return next;
  });
}

export function toggleStickyOverlay(): void {
  setStickyOverlayVisible(!stickyOverlayVisible());
}

export function bootstrapProjectNotes(): void {
  createEffect(on(() => activeProject()?.id, (projId) => {
    if (!projId) { setProjectNotes([]); return; }
    loadNotes(projId);
  }));

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
