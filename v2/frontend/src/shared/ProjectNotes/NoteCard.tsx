// Author: Subash Karki

import { createSignal, Show, onMount, onCleanup, createMemo } from 'solid-js';
import { ContextMenu } from '@kobalte/core/context-menu';
import { Maximize2, Pin, Trash2, ChevronRight } from 'lucide-solid';
import { gsap } from '@/core/animation/gsap-setup';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { addTabWithData } from '@/core/panes/signals';
import { saveNote, removeNote } from '@/core/signals/notes';
import { activeProject } from '@/core/signals/worktrees';
import {
  contextMenuContent,
  contextMenuItem,
  contextMenuItemDanger,
  contextMenuSeparator,
} from '@/styles/sidebar.css';
import * as styles from './NoteCard.css';
import type { ProjectNote } from '@/core/types';

// ── Color map ───────────────────────────────────────────────────────────────

const NOTE_COLORS: Record<string, string> = {
  todo: '#f59e0b',
  idea: '#3b82f6',
  bug: '#ef4444',
  note: '', // filled at render time with accent CSS var
};

// ── Markdown renderer ───────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { breaks: true, gfm: true });
  // marked.parse can return string | Promise<string> — we always pass sync input
  const html = typeof raw === 'string' ? raw : '';
  return DOMPurify.sanitize(html);
}

// ── Props ───────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: ProjectNote;
  onDeleted?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function NoteCard(props: NoteCardProps) {
  let cardRef!: HTMLDivElement;
  let textareaRef!: HTMLTextAreaElement;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const [editing, setEditing] = createSignal(false);
  const [editBody, setEditBody] = createSignal(props.note.body);

  // Resolve the color — fall back to a reasonable accent for "note" type
  const noteColor = createMemo(() => {
    const c = NOTE_COLORS[props.note.type];
    if (c) return c;
    // For 'note' type, use a teal/cyan accent as a fallback
    // (can't read CSS vars in JS, so use a sensible default)
    return '#00d4ff';
  });

  const renderedBody = createMemo(() => {
    const body = editing() ? '' : props.note.body;
    if (!body) return '';
    return renderMarkdown(body);
  });

  // ── GSAP entrance animation ─────────────────────────────────────────────

  onMount(() => {
    gsap.fromTo(cardRef,
      { scale: 0.9, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)', clearProps: 'opacity,transform' },
    );
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    gsap.killTweensOf(cardRef);
  });

  // ── Inline editing handlers ─────────────────────────────────────────────

  function startEditing() {
    setEditBody(props.note.body);
    setEditing(true);
    // Focus textarea after DOM update
    queueMicrotask(() => textareaRef?.focus());
  }

  function stopEditing() {
    setEditing(false);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    // Final save
    saveNote(
      props.note.id,
      props.note.title,
      editBody(),
      props.note.type,
      props.note.pinned,
    );
  }

  function handleInput(value: string) {
    setEditBody(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      saveNote(
        props.note.id,
        props.note.title,
        value,
        props.note.type,
        props.note.pinned,
      );
    }, 500);
  }

  function handleTextareaKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      stopEditing();
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  function expandNote(e: MouseEvent) {
    e.stopPropagation();
    const projId = activeProject()?.id;
    addTabWithData('notes', props.note.title || 'Note', {
      noteId: props.note.id,
      projectId: projId,
    });
  }

  function changeType(newType: string) {
    saveNote(
      props.note.id,
      props.note.title,
      props.note.body,
      newType,
      props.note.pinned,
    );
  }

  function togglePin() {
    saveNote(
      props.note.id,
      props.note.title,
      props.note.body,
      props.note.type,
      !props.note.pinned,
    );
  }

  async function deleteNote() {
    await removeNote(props.note.id);
    props.onDeleted?.();
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <ContextMenu>
      <ContextMenu.Trigger
        as="div"
        ref={cardRef!}
        class={`${styles.noteCard} ${editing() ? styles.noteCardEditing : ''}`}
        style={{ '--note-color': noteColor() }}
        onClick={() => { if (!editing()) startEditing(); }}
      >
        {/* Color bar */}
        <div class={styles.noteColorBar} />

        {/* Pin indicator */}
        <Show when={props.note.pinned}>
          <span class={styles.notePinned}>
            <Pin size={10} />
          </span>
        </Show>

        {/* Type badge */}
        <span class={styles.noteTypeLabel}>{props.note.type}</span>

        {/* Content */}
        <div class={styles.noteContent}>
          <Show when={props.note.title}>
            <div class={styles.noteTitle}>{props.note.title}</div>
          </Show>

          <Show when={editing()} fallback={
            <>
              <div
                class={styles.noteBody}
                innerHTML={renderedBody()}
              />
              <div class={styles.noteFadeOverlay} />
            </>
          }>
            <textarea
              ref={textareaRef!}
              class={styles.noteEditTextarea}
              value={editBody()}
              placeholder="Write something..."
              onInput={(e) => handleInput(e.currentTarget.value)}
              onBlur={() => stopEditing()}
              onKeyDown={handleTextareaKeyDown}
            />
          </Show>
        </div>

        {/* Expand button */}
        <Show when={!editing()}>
          <button
            class={styles.noteExpandBtn}
            onClick={expandNote}
            title="Open in tab"
          >
            <Maximize2 size={14} />
          </button>
        </Show>
      </ContextMenu.Trigger>

      {/* ── Context menu ─────────────────────────────────────────────── */}
      <ContextMenu.Portal>
        <ContextMenu.Content class={contextMenuContent}>
          <ContextMenu.Item class={contextMenuItem} onSelect={startEditing}>
            Edit
          </ContextMenu.Item>

          {/* Type submenu */}
          <ContextMenu.Sub gutter={4}>
            <ContextMenu.SubTrigger class={styles.contextMenuSubTrigger}>
              Type
              <ChevronRight size={12} />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent class={styles.contextMenuSubContent}>
                <ContextMenu.Item
                  class={contextMenuItem}
                  onSelect={() => changeType('todo')}
                >
                  Todo
                </ContextMenu.Item>
                <ContextMenu.Item
                  class={contextMenuItem}
                  onSelect={() => changeType('idea')}
                >
                  Idea
                </ContextMenu.Item>
                <ContextMenu.Item
                  class={contextMenuItem}
                  onSelect={() => changeType('bug')}
                >
                  Bug
                </ContextMenu.Item>
                <ContextMenu.Item
                  class={contextMenuItem}
                  onSelect={() => changeType('note')}
                >
                  Note
                </ContextMenu.Item>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>

          <ContextMenu.Item class={contextMenuItem} onSelect={togglePin}>
            {props.note.pinned ? 'Unpin' : 'Pin to Top'}
          </ContextMenu.Item>

          <ContextMenu.Separator class={contextMenuSeparator} />

          <ContextMenu.Item
            class={`${contextMenuItem} ${contextMenuItemDanger}`}
            onSelect={deleteNote}
          >
            <Trash2 size={14} />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}
