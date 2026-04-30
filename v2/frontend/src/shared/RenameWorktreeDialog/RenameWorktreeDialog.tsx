// Phantom — Rename worktree dialog
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { showWarningToast } from '@/shared/Toast/Toast';
import { renameWorktree } from '@/core/bindings';
import { refreshAllWorktrees } from '@/core/signals/worktrees';
import { buttonRecipe } from '@/styles/recipes.css';
import * as styles from './RenameWorktreeDialog.css';

interface RenameWorktreeDialogProps {
  open: () => boolean;
  onClose: () => void;
  worktreeId: string;
  currentName: string;
}

export function RenameWorktreeDialog(props: RenameWorktreeDialogProps) {
  const [name, setName] = createSignal(props.currentName);
  const [loading, setLoading] = createSignal(false);

  async function handleRename() {
    const newName = name().trim();
    if (!newName || newName === props.currentName) return;
    setLoading(true);
    const ok = await renameWorktree(props.worktreeId, newName);
    setLoading(false);
    if (ok) {
      await refreshAllWorktrees();
      props.onClose();
    } else {
      showWarningToast('Rename failed', 'Could not rename worktree');
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleRename();
  }

  function handleOpenChange(open: boolean) {
    if (!open) props.onClose();
  }

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={handleOpenChange}
      title="Rename Worktree"
      size="sm"
    >
      <div class={styles.form}>
        <TextField class={styles.textFieldRoot} value={name()} onChange={setName}>
          <TextField.Label class={styles.textFieldLabel}>New Name</TextField.Label>
          <TextField.Input
            class={styles.textFieldInput}
            placeholder="e.g. my-feature"
            autofocus
            onKeyDown={handleKeyDown}
          />
        </TextField>
      </div>

      <div class={phantomModalStyles.actions}>
        <button
          type="button"
          class={buttonRecipe({ variant: 'ghost', size: 'md' })}
          onClick={props.onClose}
          disabled={loading()}
        >
          Cancel
        </button>
        <button
          type="button"
          class={buttonRecipe({ variant: 'primary', size: 'md' })}
          onClick={handleRename}
          disabled={!name().trim() || name().trim() === props.currentName || loading()}
        >
          Rename
        </button>
      </div>
    </PhantomModal>
  );
}
