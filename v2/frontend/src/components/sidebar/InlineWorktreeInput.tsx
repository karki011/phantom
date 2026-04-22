// PhantomOS v2 — Inline worktree creation input
// Author: Subash Karki

import { createSignal, onMount } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import * as styles from '@/styles/sidebar.css';
import { createWorktreeForProject, setCreatingInProject } from '@/core/signals/worktrees';

interface InlineWorktreeInputProps {
  projectId: string;
}

export function InlineWorktreeInput(props: InlineWorktreeInputProps) {
  const [value, setValue] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    inputRef?.focus();
  });

  function cancel() {
    setCreatingInProject(null);
  }

  async function submit() {
    const branch = value().trim();
    if (!branch || loading()) return;
    setLoading(true);
    try {
      await createWorktreeForProject(props.projectId, branch);
    } finally {
      setLoading(false);
      setCreatingInProject(null);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <div class={styles.inlineInput}>
      <TextField
        value={value()}
        onChange={setValue}
        disabled={loading()}
        class={styles.inlineInputField}
      >
        <TextField.Input
          ref={inputRef}
          placeholder="branch-name…"
          onKeyDown={onKeyDown}
          onBlur={cancel}
        />
      </TextField>
    </div>
  );
}
