// Author: Subash Karki

import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import { saveNote } from '@/core/signals/notes';
import { listProjectNotes } from '@/core/bindings';
import { TipTapEditor } from '@/shared/TipTapEditor';
import { vars } from '@/styles/theme.css';
import type { ProjectNote } from '@/core/types';

const TYPE_COLORS: Record<string, string> = {
  todo: '#f59e0b',
  idea: '#3b82f6',
  bug: '#ef4444',
  note: '#56CCFF',
};

export default function NotesPane(props: { noteId?: string; projectId?: string }) {
  const [note, setNote] = createSignal<ProjectNote | null>(null);
  const [title, setTitle] = createSignal('');
  const [body, setBody] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  createEffect(() => {
    const noteId = props.noteId;
    const projectId = props.projectId;
    if (!noteId || !projectId) { setLoaded(true); return; }
    listProjectNotes(projectId).then((notes) => {
      const found = notes.find((n) => n.id === noteId) ?? null;
      if (found) {
        setNote(found);
        setTitle(found.title);
        setBody(found.body);
      }
      setLoaded(true);
    });
  });

  onCleanup(() => { if (saveTimer) clearTimeout(saveTimer); });

  function scheduleSave(newTitle: string, newBody: string) {
    const n = note();
    if (!n) return;
    if (saveTimer) clearTimeout(saveTimer);
    setSaved(false);
    saveTimer = setTimeout(async () => {
      setSaving(true);
      await saveNote(n.id, newTitle, newBody, n.type, n.pinned);
      setSaving(false);
      setSaved(true);
    }, 800);
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
    }}>
      <Show when={loaded()} fallback={
        <span style={{ padding: vars.space.xl, color: vars.color.textDisabled, 'font-family': vars.font.mono, 'font-size': vars.fontSize.sm }}>Loading...</span>
      }>
        <Show when={note()} fallback={
          <span style={{ padding: vars.space.xl, color: vars.color.textDisabled, 'font-family': vars.font.mono, 'font-size': vars.fontSize.sm }}>Note not found</span>
        }>
          {(n) => (
            <>
              {/* Header bar */}
              <div style={{
                display: 'flex',
                'align-items': 'center',
                gap: vars.space.md,
                padding: `${vars.space.sm} ${vars.space.md}`,
                'border-bottom': `1px solid ${vars.color.border}`,
                'flex-shrink': '0',
              }}>
                <span style={{
                  width: '8px', height: '8px', 'border-radius': '50%',
                  background: TYPE_COLORS[n().type] ?? vars.color.accent, 'flex-shrink': '0',
                }} />
                <input
                  type="text"
                  value={title()}
                  onInput={(e) => { const v = e.currentTarget.value; setTitle(v); scheduleSave(v, body()); }}
                  placeholder="Untitled"
                  style={{
                    'font-family': vars.font.display,
                    'font-size': '1.1rem',
                    'font-weight': '700',
                    color: vars.color.textPrimary,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    flex: '1',
                    padding: '0',
                  }}
                />
                <span style={{
                  'font-family': vars.font.mono, 'font-size': '0.6rem',
                  color: TYPE_COLORS[n().type] ?? vars.color.accent,
                  'text-transform': 'uppercase', 'letter-spacing': '0.1em',
                }}>
                  {n().type}
                </span>
                <Show when={saving()}>
                  <span style={{ 'font-size': vars.fontSize.xs, color: vars.color.textDisabled, 'font-family': vars.font.mono }}>Saving...</span>
                </Show>
                <Show when={!saving() && saved()}>
                  <span style={{ 'font-size': vars.fontSize.xs, color: vars.color.success, 'font-family': vars.font.mono }}>Saved</span>
                </Show>
              </div>

              {/* TipTap WYSIWYG editor — full pane */}
              <TipTapEditor
                content={body()}
                onChange={(html) => { setBody(html); scheduleSave(title(), html); }}
                placeholder="Start writing..."
                autoFocus
                toolbar
              />
            </>
          )}
        </Show>
      </Show>
    </div>
  );
}
