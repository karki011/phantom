// Author: Subash Karki

import { createSignal, For, createEffect, on } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { addNote } from '@/core/signals/notes';
import { buttonRecipe } from '@/styles/recipes.css';
import { vars } from '@/styles/theme.css';

interface CreateNoteDialogProps {
  open: () => boolean;
  onClose: () => void;
}

const NOTE_TYPES = [
  { value: 'todo', label: 'Todo', color: '#f59e0b' },
  { value: 'idea', label: 'Idea', color: '#3b82f6' },
  { value: 'bug', label: 'Bug', color: '#ef4444' },
  { value: 'note', label: 'Note', color: '#56CCFF' },
] as const;

type NoteType = (typeof NOTE_TYPES)[number]['value'];

export function CreateNoteDialog(props: CreateNoteDialogProps) {
  const [type, setType] = createSignal<NoteType>('note');
  const [title, setTitle] = createSignal('');
  const [body, setBody] = createSignal('');

  // Reset state when dialog opens
  createEffect(on(() => props.open(), (open) => {
    if (open) {
      setType('note');
      setTitle('');
      setBody('');
    }
  }));

  async function handleCreate() {
    const t = title().trim();
    if (!t) return;
    await addNote(type(), t, body().trim() || undefined);
    props.onClose();
  }

  function handleTitleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) handleCreate();
  }

  function handleOpenChange(open: boolean) {
    if (!open) props.onClose();
  }

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={handleOpenChange}
      title="New Note"
      size="sm"
    >
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: vars.space.lg }}>
        {/* Type picker */}
        <div style={{ display: 'flex', gap: vars.space.sm }}>
          <For each={NOTE_TYPES}>
            {(nt) => {
              const selected = () => type() === nt.value;
              return (
                <button
                  type="button"
                  onClick={() => setType(nt.value)}
                  style={{
                    padding: '4px 12px',
                    'border-radius': vars.radius.sm,
                    border: `1px solid ${selected() ? nt.color : vars.color.border}`,
                    background: selected()
                      ? `color-mix(in srgb, ${nt.color} 15%, transparent)`
                      : 'transparent',
                    color: selected() ? nt.color : vars.color.textSecondary,
                    'font-family': vars.font.mono,
                    'font-size': vars.fontSize.xs,
                    cursor: 'pointer',
                    transition: `all ${vars.animation.fast} ease`,
                  }}
                >
                  {nt.label}
                </button>
              );
            }}
          </For>
        </div>

        {/* Title input */}
        <TextField
          value={title()}
          onChange={setTitle}
          style={{ display: 'flex', 'flex-direction': 'column', gap: vars.space.xs }}
        >
          <TextField.Label
            style={{
              'font-family': vars.font.mono,
              'font-size': vars.fontSize.xs,
              color: vars.color.textSecondary,
              'text-transform': 'uppercase',
              'letter-spacing': '0.08em',
            }}
          >
            Title
          </TextField.Label>
          <TextField.Input
            placeholder="What's on your mind?"
            autofocus
            onKeyDown={handleTitleKeyDown}
            style={{
              'background-color': vars.color.bgTertiary,
              border: `1px solid ${vars.color.border}`,
              'border-radius': vars.radius.md,
              padding: `${vars.space.sm} ${vars.space.md}`,
              'font-size': vars.fontSize.sm,
              'font-family': vars.font.mono,
              color: vars.color.textPrimary,
              outline: 'none',
              width: '100%',
              'box-sizing': 'border-box',
            }}
          />
        </TextField>

        {/* Body / description */}
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: vars.space.xs }}>
          <label
            style={{
              'font-family': vars.font.mono,
              'font-size': vars.fontSize.xs,
              color: vars.color.textSecondary,
              'text-transform': 'uppercase',
              'letter-spacing': '0.08em',
            }}
          >
            Description
          </label>
          <textarea
            value={body()}
            onInput={(e) => setBody(e.currentTarget.value)}
            placeholder="Add details, checklist, links... (optional)"
            rows={3}
            style={{
              'background-color': vars.color.bgTertiary,
              border: `1px solid ${vars.color.border}`,
              'border-radius': vars.radius.md,
              padding: `${vars.space.sm} ${vars.space.md}`,
              'font-size': vars.fontSize.sm,
              'font-family': vars.font.mono,
              color: vars.color.textPrimary,
              outline: 'none',
              width: '100%',
              'box-sizing': 'border-box',
              resize: 'vertical',
              'line-height': '1.5',
            }}
          />
        </div>
      </div>

      <div class={phantomModalStyles.actions}>
        <button
          type="button"
          class={buttonRecipe({ variant: 'ghost', size: 'md' })}
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          class={buttonRecipe({ variant: 'primary', size: 'md' })}
          onClick={handleCreate}
          disabled={!title().trim()}
        >
          Create
        </button>
      </div>
    </PhantomModal>
  );
}
