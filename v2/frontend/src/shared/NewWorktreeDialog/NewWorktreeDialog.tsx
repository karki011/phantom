// Author: Subash Karki

import { createSignal, createEffect, Show, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { Select } from '@kobalte/core/select';
import { buttonRecipe } from '@/styles/recipes.css';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { PhantomLoader } from '@/shared/PhantomLoader/PhantomLoader';
import { getProjectBranches, createWorktree } from '@/core/bindings';
import { activeProviderCommand, activeProviderLabel } from '@/core/signals/active-provider';
import { refreshProjects } from '@/core/signals/projects';
import { bootstrapWorktrees, selectWorktree } from '@/core/signals/worktrees';
import { addTabWithData } from '@/core/panes/signals';
import { showWarningToast } from '@/shared/Toast/Toast';
import * as styles from './NewWorktreeDialog.css';

interface NewWorktreeDialogProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  defaultBranch: string;
  onCreated?: () => void;
}

function toBranchName(display: string): string {
  return display
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export function NewWorktreeDialog(props: NewWorktreeDialogProps) {
  const [name, setName] = createSignal('');
  const branchName = () => toBranchName(name());
  const [baseBranch, setBaseBranch] = createSignal(props.defaultBranch);
  const [ticketLink, setTicketLink] = createSignal('');
  const [branches, setBranches] = createSignal<string[]>([]);
  const [creating, setCreating] = createSignal(false);
  const [loadingBranches, setLoadingBranches] = createSignal(false);

  function reset() {
    setName('');
    setBaseBranch(props.defaultBranch);
    setTicketLink('');
    setBranches([]);
  }

  async function loadBranches() {
    setLoadingBranches(true);
    try {
      console.log('[NewWorktreeDialog] loading branches for project:', props.projectId);
      const result = await getProjectBranches(props.projectId);
      console.log('[NewWorktreeDialog] got branches:', result?.length, result?.slice(0, 5));
      if (!result || result.length === 0) {
        setBranches([props.defaultBranch]);
      } else {
        if (props.defaultBranch && !result.includes(props.defaultBranch)) {
          setBranches([props.defaultBranch, ...result]);
        } else {
          setBranches(result);
        }
      }
    } catch (err) {
      console.error('[NewWorktreeDialog] loadBranches error:', err);
      setBranches([props.defaultBranch]);
    } finally {
      setLoadingBranches(false);
    }
  }

  createEffect(() => {
    if (props.open()) {
      reset();
      loadBranches();
    }
  });

  function handleOpenChange(open: boolean) {
    if (!open) reset();
    props.onOpenChange(open);
  }

  async function handleCreate() {
    const branch = branchName();
    if (!branch) return;

    setCreating(true);
    try {
      const [result] = await Promise.all([
        createWorktree(props.projectId, branch, baseBranch()),
        new Promise<void>((res) => setTimeout(res, 800)),
      ]);

      if (result) {
        await refreshProjects();
        await bootstrapWorktrees();
        selectWorktree(result.id);
        if (result.worktree_path) {
          addTabWithData('terminal', activeProviderLabel(), {
            cwd: result.worktree_path,
            command: activeProviderCommand(),
          });
        }
        props.onOpenChange(false);
        props.onCreated?.();
      } else {
        showWarningToast('Failed to create worktree', 'Check that the branch name is valid');
      }
    } finally {
      setCreating(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleCreate();
  }

  const branchOptions = () => {
    const list = branches();
    const def = props.defaultBranch;
    if (!list.length) return def ? [def] : [];
    return list;
  };

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={handleOpenChange}
      title={`New Worktree — ${props.projectName}`}
      size="md"
    >
      <Show when={creating()}>
        <PhantomLoader message="Creating worktree..." />
      </Show>

      <Show when={!creating()}>
        <div class={styles.form}>
          {/* Worktree Name */}
          <TextField class={styles.textFieldRoot} value={name()} onChange={setName}>
            <TextField.Label class={styles.textFieldLabel}>Worktree Name</TextField.Label>
            <TextField.Input
              class={styles.textFieldInput}
              placeholder="e.g. auth-fix"
              maxLength={50}
              autofocus
              onKeyDown={handleKeyDown}
            />
          </TextField>
          <Show when={branchName()}>
            <span class={styles.branchPreview}>Branch: {branchName()}</span>
          </Show>

          {/* From Branch */}
          <div class={styles.textFieldRoot}>
            <span class={styles.textFieldLabel}>From Branch</span>
            <Show
              when={!loadingBranches()}
              fallback={
                <div class={styles.loaderWrap}>
                  <span class={styles.branchesLoaderText}>Loading branches…</span>
                </div>
              }
            >
              <Select<string>
                value={baseBranch()}
                onChange={(val) => { if (val !== null) setBaseBranch(val); }}
                options={branchOptions()}
                placeholder="Select branch..."
                itemComponent={(itemProps) => (
                  <Select.Item item={itemProps.item} class={styles.selectItem}>
                    <Select.ItemLabel class={styles.selectItemLabel}>
                      {itemProps.item.rawValue === props.defaultBranch
                        ? `★ ${itemProps.item.rawValue}`
                        : itemProps.item.rawValue}
                    </Select.ItemLabel>
                  </Select.Item>
                )}
              >
                <Select.Trigger class={styles.selectTrigger}>
                  <Select.Value<string> class={styles.selectValue}>
                    {(state) =>
                      state.selectedOption() === props.defaultBranch
                        ? `★ ${state.selectedOption()}`
                        : state.selectedOption()
                    }
                  </Select.Value>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content class={styles.selectContent}>
                    <Select.Listbox />
                  </Select.Content>
                </Select.Portal>
              </Select>
            </Show>
          </div>

          {/* Ticket Link */}
          <TextField class={styles.textFieldRoot} value={ticketLink()} onChange={setTicketLink}>
            <TextField.Label class={styles.textFieldLabel}>
              Ticket Link <span class={styles.optionalLabel}>(optional)</span>
            </TextField.Label>
            <TextField.Input
              class={styles.textFieldInput}
              placeholder="https://jira.example.com/browse/PROJ-123"
            />
          </TextField>
        </div>
      </Show>

      <div class={phantomModalStyles.actions}>
        <button
          type="button"
          class={buttonRecipe({ variant: 'ghost', size: 'md' })}
          onClick={() => handleOpenChange(false)}
          disabled={creating()}
        >
          Cancel
        </button>
        <button
          type="button"
          class={buttonRecipe({ variant: 'primary', size: 'md' })}
          onClick={handleCreate}
          disabled={!name().trim() || creating()}
        >
          Create Worktree
        </button>
      </div>
    </PhantomModal>
  );
}
