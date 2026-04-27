// PhantomOS v2 — Branch picker dialog for switching branches
// Author: Subash Karki

import { createSignal, createEffect, For, Show } from 'solid-js';
import { GitBranch, Star } from 'lucide-solid';
import { TextField } from '@kobalte/core/text-field';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { showWarningToast } from '@/shared/Toast/Toast';
import { getProjectBranches, gitCheckoutBranch } from '@/core/bindings';
import { refreshAllWorktrees } from '@/core/signals/worktrees';
import { buttonRecipe } from '@/styles/recipes.css';
import * as styles from './SwitchBranchDialog.css';

interface SwitchBranchDialogProps {
  open: () => boolean;
  onClose: () => void;
  projectId: string;
  defaultBranch?: string;
}

export function SwitchBranchDialog(props: SwitchBranchDialogProps) {
  const [branches, setBranches] = createSignal<string[]>([]);
  const [filter, setFilter] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [switching, setSwitching] = createSignal(false);

  const defaultBranch = () => props.defaultBranch ?? 'main';

  createEffect(() => {
    if (props.open()) {
      setFilter('');
      setLoading(true);
      getProjectBranches(props.projectId)
        .then(setBranches)
        .finally(() => setLoading(false));
    }
  });

  const sorted = () => {
    const all = branches();
    const def = defaultBranch();
    const pinned = all.filter((b) => b === def);
    const rest = all.filter((b) => b !== def);
    return [...pinned, ...rest];
  };

  const filtered = () => {
    const q = filter().toLowerCase();
    return q ? sorted().filter((b) => b.toLowerCase().includes(q)) : sorted();
  };

  async function handleSelect(branch: string) {
    setSwitching(true);
    const ok = await gitCheckoutBranch(props.projectId, branch);
    setSwitching(false);
    if (ok) {
      await refreshAllWorktrees();
      props.onClose();
    } else {
      showWarningToast('Switch failed', `Could not switch to ${branch}`);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) props.onClose();
  }

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={handleOpenChange}
      title="Switch Branch"
      size="sm"
    >
      <div class={styles.form}>
        <TextField class={styles.textFieldRoot} value={filter()} onChange={setFilter}>
          <TextField.Label class={styles.textFieldLabel}>Filter branches</TextField.Label>
          <TextField.Input
            class={styles.textFieldInput}
            placeholder="Search..."
            autofocus
          />
        </TextField>

        <Show
          when={!loading()}
          fallback={<div class={styles.loaderWrap}>Loading branches…</div>}
        >
          <div class={styles.branchList}>
            <Show
              when={filtered().length > 0}
              fallback={<div class={styles.emptyState}>No branches found</div>}
            >
              <For each={filtered()}>
                {(branch) => (
                  <button
                    type="button"
                    class={branch === defaultBranch() ? styles.branchItemDefault : styles.branchItem}
                    onClick={() => handleSelect(branch)}
                    disabled={switching()}
                  >
                    <GitBranch size={12} class={styles.branchIcon} />
                    <span class={styles.branchName}>{branch}</span>
                    <Show when={branch === defaultBranch()}>
                      <Star size={10} class={styles.defaultBadge} />
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>

      <div class={phantomModalStyles.actions}>
        <button
          type="button"
          class={buttonRecipe({ variant: 'ghost', size: 'md' })}
          onClick={props.onClose}
          disabled={switching()}
        >
          Cancel
        </button>
      </div>
    </PhantomModal>
  );
}
