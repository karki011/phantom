// Phantom — Rename worktree dialog
// Author: Subash Karki

import { createSignal, Show } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { showWarningToast } from '@/shared/Toast/Toast';
import { vars } from '@/styles/theme.css';
import { renameWorkspaceDisplay } from '@/core/bindings';
import { refreshAllWorktrees } from '@/core/signals/worktrees';
import { buttonRecipe } from '@/styles/recipes.css';
import * as styles from './RenameWorktreeDialog.css';

interface RenameWorktreeDialogProps {
  open: () => boolean;
  onClose: () => void;
  worktreeId: string;
  currentName: string;
  branch?: string;
}

export function RenameWorktreeDialog(props: RenameWorktreeDialogProps) {
  const [name, setName] = createSignal(props.currentName);
  const [loading, setLoading] = createSignal(false);

  async function handleRename() {
    const newName = name().trim();
    if (!newName || newName === props.currentName) return;
    setLoading(true);
    const ok = await renameWorkspaceDisplay(props.worktreeId, newName);
    setLoading(false);
    if (ok) {
      await refreshAllWorktrees();
      props.onClose();
    } else {
      showWarningToast('Rename failed', 'Could not update display name');
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
      title="Rename"
      size="sm"
    >
      <div class={styles.form}>
        <TextField class={styles.textFieldRoot} value={name()} onChange={setName}>
          <TextField.Label class={styles.textFieldLabel}>Display Name</TextField.Label>
          <TextField.Input
            class={styles.textFieldInput}
            placeholder="e.g. Auth refactor"
            autofocus
            onKeyDown={handleKeyDown}
          />
        </TextField>
        <Show when={props.branch}>
          <span style={{ 'font-size': '11px', color: vars.color.textDisabled, 'font-family': vars.font.mono }}>
            branch: {props.branch}
          </span>
        </Show>
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
