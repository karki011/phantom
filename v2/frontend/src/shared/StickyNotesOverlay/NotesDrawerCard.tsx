// Author: Subash Karki

import { createSignal, createMemo, Show } from 'solid-js';
import { Collapsible } from '@kobalte/core/collapsible';
import { ContextMenu } from '@kobalte/core/context-menu';
import { ChevronRight, Maximize2, Pin, Trash2, Trash } from 'lucide-solid';
import { TipTapEditor } from '@/shared/TipTapEditor';
import { addTabWithData } from '@/core/panes/signals';
import { saveNote, removeNote, expandedNoteIds, setNoteExpanded } from '@/core/signals/notes';
import { activeProject } from '@/core/signals/worktrees';
import {
  contextMenuContent,
  contextMenuItem,
  contextMenuItemDanger,
  contextMenuSeparator,
} from '@/styles/sidebar.css';
import * as styles from './StickyNotesOverlay.css';
import type { ProjectNote } from '@/core/types';

const NOTE_COLORS: Record<string, string> = {
  todo: '#f59e0b',
  idea: '#3b82f6',
  bug: '#ef4444',
  note: '#00d4ff',
};

interface NotesDrawerCardProps {
  note: ProjectNote;
}

export function NotesDrawerCard(props: NotesDrawerCardProps) {
  const [draft, setDraft] = createSignal('');

  const expanded = () => expandedNoteIds().has(props.note.id);
  const noteColor = createMemo(() => NOTE_COLORS[props.note.type] ?? '#00d4ff');

  function handleOpen(open: boolean) {
    if (open) setDraft(props.note.body);
    setNoteExpanded(props.note.id, open);
  }

  async function handleSave() {
    await saveNote(props.note.id, props.note.title, draft(), props.note.type, props.note.pinned);
    setNoteExpanded(props.note.id, false);
  }

  function handleCancel() {
    setNoteExpanded(props.note.id, false);
  }

  function expandNote(e: MouseEvent) {
    e.stopPropagation();
    addTabWithData('notes', props.note.title || 'Note', {
      noteId: props.note.id,
      projectId: activeProject()?.id,
    });
  }

  function changeType(newType: string) {
    saveNote(props.note.id, props.note.title, props.note.body, newType, props.note.pinned);
  }

  function togglePin() {
    saveNote(props.note.id, props.note.title, props.note.body, props.note.type, !props.note.pinned);
  }

  async function deleteNote() {
    await removeNote(props.note.id);
  }

  return (
    <ContextMenu>
      <ContextMenu.Trigger as="div">
        <Collapsible open={expanded()} onOpenChange={handleOpen}>
          <div class={styles.noteCard} style={{ '--note-color': noteColor() }}>
            <div class={styles.noteColorBar} />
            <Collapsible.Trigger class={styles.noteHeader}>
              <ChevronRight
                size={12}
                class={styles.noteChevron}
                style={{ transform: expanded() ? 'rotate(90deg)' : 'rotate(0deg)' }}
              />
              <Show when={props.note.pinned}>
                <Pin size={10} class={styles.notePinIcon} />
              </Show>
              <span class={styles.noteTitle}>{props.note.title || 'Untitled'}</span>
              <span class={styles.noteTypeBadge}>{props.note.type}</span>
              <div class={styles.noteActions}>
                <button class={styles.noteActionBtn} onClick={expandNote} title="Open in tab">
                  <Maximize2 size={12} />
                </button>
                <button class={styles.noteActionBtnDanger} onClick={(e) => { e.stopPropagation(); deleteNote(); }} title="Delete">
                  <Trash size={12} />
                </button>
              </div>
            </Collapsible.Trigger>
            <Collapsible.Content class={styles.noteContent}>
              <TipTapEditor
                content={draft()}
                onChange={setDraft}
                placeholder="Start writing..."
                toolbar
              />
              <div class={styles.editorActions}>
                <button class={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
                <button class={styles.saveBtn} onClick={handleSave}>Save</button>
              </div>
            </Collapsible.Content>
          </div>
        </Collapsible>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content class={contextMenuContent}>
          <ContextMenu.Item class={contextMenuItem} onSelect={() => handleOpen(true)}>
            Edit
          </ContextMenu.Item>
          <ContextMenu.Sub gutter={4}>
            <ContextMenu.SubTrigger class={styles.contextMenuSubTrigger}>
              Type
              <ChevronRight size={12} />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent class={styles.contextMenuSubContent}>
                <ContextMenu.Item class={contextMenuItem} onSelect={() => changeType('todo')}>Todo</ContextMenu.Item>
                <ContextMenu.Item class={contextMenuItem} onSelect={() => changeType('idea')}>Idea</ContextMenu.Item>
                <ContextMenu.Item class={contextMenuItem} onSelect={() => changeType('bug')}>Bug</ContextMenu.Item>
                <ContextMenu.Item class={contextMenuItem} onSelect={() => changeType('note')}>Note</ContextMenu.Item>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
          <ContextMenu.Item class={contextMenuItem} onSelect={togglePin}>
            {props.note.pinned ? 'Unpin' : 'Pin to Top'}
          </ContextMenu.Item>
          <ContextMenu.Separator class={contextMenuSeparator} />
          <ContextMenu.Item class={`${contextMenuItem} ${contextMenuItemDanger}`} onSelect={deleteNote}>
            <Trash2 size={14} />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}
