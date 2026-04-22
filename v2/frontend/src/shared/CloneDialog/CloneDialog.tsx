// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { buttonRecipe } from '@/styles/recipes.css';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import * as styles from './CloneDialog.css';

interface CloneDialogProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
  onClone: (url: string) => void;
}

export function CloneDialog(props: CloneDialogProps) {
  const [url, setUrl] = createSignal('');
  const trimmedUrl = () => url().trim();

  function handleClone() {
    if (!trimmedUrl()) return;
    props.onClone(trimmedUrl());
    setUrl('');
    props.onOpenChange(false);
  }

  function handleOpenChange(open: boolean) {
    if (!open) setUrl('');
    props.onOpenChange(open);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleClone();
  }

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={handleOpenChange}
      title="Clone Repository"
      description="Enter the repository URL to clone."
      size="sm"
    >
      <TextField class={styles.textFieldRoot} value={url()} onChange={setUrl}>
        <TextField.Label class={styles.textFieldLabel}>Repository URL</TextField.Label>
        <TextField.Input
          class={styles.textFieldInput}
          placeholder="https://github.com/user/repo.git"
          autofocus
          onKeyDown={handleKeyDown}
        />
      </TextField>
      <div class={phantomModalStyles.actions}>
        <button type="button" class={buttonRecipe({ variant: 'ghost', size: 'md' })} onClick={() => handleOpenChange(false)}>
          Cancel
        </button>
        <button
          type="button"
          class={buttonRecipe({ variant: 'primary', size: 'md' })}
          onClick={handleClone}
          disabled={!trimmedUrl()}
        >
          Clone
        </button>
      </div>
    </PhantomModal>
  );
}
