// Author: Subash Karki

import { createSignal, Show, For } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Checkbox } from '@kobalte/core/checkbox';
import { PhantomLoader } from '@/shared/PhantomLoader/PhantomLoader';
import { buttonRecipe } from '@/styles/recipes.css';
import { removeProject } from '@/core/bindings';
import { refreshProjects } from '@/core/signals/projects';
import { filteredProjects, worktreeMap, bootstrapWorktrees } from '@/core/signals/worktrees';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import * as styles from './ManageProjectsDialog.css';

interface ManageProjectsDialogProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
}

export function ManageProjectsDialog(props: ManageProjectsDialogProps) {
  const [removing, setRemoving] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  function toggleProject(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filteredProjects().map((p) => p.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  function handleOpenChange(open: boolean) {
    if (!open) setSelected(new Set());
    props.onOpenChange(open);
  }

  async function handleRemove() {
    const ids = [...selected()];
    const count = ids.length;
    setRemoving(true);
    const removeAll = async () => {
      for (const id of ids) {
        await removeProject(id);
      }
    };
    await Promise.all([removeAll(), new Promise<void>((r) => setTimeout(r, 800))]);
    await refreshProjects();
    await bootstrapWorktrees();
    setRemoving(false);
    props.onOpenChange(false);
  }

  const selectedCount = () => selected().size;

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={handleOpenChange}
      title="Manage Projects"
      description="Select projects to remove"
      size="lg"
    >
      <Show
        when={!removing()}
        fallback={
          <div class={styles.loaderWrapper}>
            <PhantomLoader message={`Removing ${selected().size} ${selected().size === 1 ? 'project' : 'projects'}...`} />
          </div>
        }
      >
        <div class={styles.selectionBar}>
          <button
            type="button"
            class={buttonRecipe({ variant: 'outline', size: 'sm' })}
            onClick={selectAll}
          >
            Select All
          </button>
          <button
            type="button"
            class={buttonRecipe({ variant: 'outline', size: 'sm' })}
            onClick={deselectAll}
          >
            Deselect All
          </button>
        </div>

        <div class={styles.projectList}>
          <For each={filteredProjects()}>
            {(project) => {
              const wtCount = () => (worktreeMap()[project.id] ?? []).length;
              return (
                <div class={styles.projectItem}>
                  <Checkbox
                    class={styles.checkboxRoot}
                    checked={selected().has(project.id)}
                    onChange={() => toggleProject(project.id)}
                  >
                    <Checkbox.Input />
                    <Checkbox.Control class={styles.checkboxControl}>
                      <Checkbox.Indicator class={styles.checkboxIndicator}>
                        ✓
                      </Checkbox.Indicator>
                    </Checkbox.Control>
                    <Checkbox.Label class={styles.projectLabel}>
                      <span class={styles.projectName}>{project.name}</span>
                      <span class={styles.projectPath}>{project.repo_path}</span>
                    </Checkbox.Label>
                    <span class={styles.worktreeBadge}>
                      {wtCount()} {wtCount() === 1 ? 'worktree' : 'worktrees'}
                    </span>
                  </Checkbox>
                </div>
              );
            }}
          </For>
        </div>

        <div class={phantomModalStyles.actions}>
          <button
            type="button"
            class={buttonRecipe({ variant: 'ghost', size: 'md' })}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            class={`${buttonRecipe({ variant: 'danger', size: 'md' })} ${styles.dangerButton}`}
            onClick={handleRemove}
            disabled={selectedCount() === 0}
          >
            Remove {selectedCount()} {selectedCount() === 1 ? 'Project' : 'Projects'}
          </button>
        </div>
      </Show>
    </PhantomModal>
  );
}
