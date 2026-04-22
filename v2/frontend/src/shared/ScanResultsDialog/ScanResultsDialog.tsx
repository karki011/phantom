// Author: Subash Karki

import { createSignal, createEffect, Show, For } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Checkbox } from '@kobalte/core/checkbox';
import { PhantomLoader } from '@/shared/PhantomLoader/PhantomLoader';
import { buttonRecipe } from '@/styles/recipes.css';
import { addProject, scanDirectory } from '@/core/bindings';
import { showToast } from '@/shared/Toast/Toast';
import { refreshProjects } from '@/core/signals/projects';
import { filteredProjects, bootstrapWorktrees } from '@/core/signals/worktrees';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import * as styles from './ScanResultsDialog.css';

interface ScanResultsDialogProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
  parentPath: Accessor<string>;
}

export function ScanResultsDialog(props: ScanResultsDialogProps) {
  const [scanning, setScanning] = createSignal(false);
  const [adding, setAdding] = createSignal(false);
  const [paths, setPaths] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  createEffect(() => {
    if (!props.open()) return;
    const parent = props.parentPath();
    if (!parent) return;

    setScanning(true);
    setPaths([]);
    setSelected(new Set());

    Promise.all([
      scanDirectory(parent),
      new Promise<void>((r) => setTimeout(r, 600)),
    ]).then(([found]) => {
      const existingPaths = new Set(filteredProjects().map((p) => p.repo_path));
      const newPaths = found.filter((p) => !existingPaths.has(p));
      setPaths(found);
      setSelected(new Set(newPaths));
      setScanning(false);
    });
  });

  function toggleRepo(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(paths()));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleAdd() {
    const toAdd = [...selected()];
    const count = toAdd.length;
    setAdding(true);
    const addAll = async () => {
      for (const p of toAdd) {
        await addProject(p);
      }
    };
    await Promise.all([addAll(), new Promise<void>((r) => setTimeout(r, 800))]);
    await refreshProjects();
    await bootstrapWorktrees();
    setAdding(false);
    props.onOpenChange(false);
    showToast('Projects added', `Successfully added ${count} ${count === 1 ? 'project' : 'projects'}`);
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setPaths([]);
      setSelected(new Set());
    }
    props.onOpenChange(open);
  }

  const repoName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path;
  const selectedCount = () => selected().size;
  const modalTitle = () => scanning() ? 'Scanning...' : `Found ${paths().length} ${paths().length === 1 ? 'repository' : 'repositories'}`;

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={handleOpenChange}
      title={modalTitle()}
      size="lg"
    >
      <Show
        when={!scanning() && !adding()}
        fallback={
          <div class={styles.loaderWrapper}>
            <PhantomLoader
              message={adding() ? `Adding ${selected().size} ${selected().size === 1 ? 'project' : 'projects'}...` : 'Scanning for repositories...'}
            />
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

        <div class={styles.repoList}>
          <For each={paths()}>
            {(path) => (
              <div class={styles.repoItem}>
                <Checkbox
                  class={styles.checkboxRoot}
                  checked={selected().has(path)}
                  onChange={() => toggleRepo(path)}
                >
                  <Checkbox.Input />
                  <Checkbox.Control class={styles.checkboxControl}>
                    <Checkbox.Indicator class={styles.checkboxIndicator}>
                      ✓
                    </Checkbox.Indicator>
                  </Checkbox.Control>
                  <Checkbox.Label class={styles.repoLabel}>
                    <span class={styles.repoName}>{repoName(path)}</span>
                    <span class={styles.repoPath}>{path}</span>
                  </Checkbox.Label>
                </Checkbox>
              </div>
            )}
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
            class={buttonRecipe({ variant: 'primary', size: 'md' })}
            onClick={handleAdd}
            disabled={selectedCount() === 0}
          >
            Add {selectedCount()} {selectedCount() === 1 ? 'Project' : 'Projects'}
          </button>
        </div>
      </Show>
    </PhantomModal>
  );
}
