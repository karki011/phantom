// PhantomOS v2 — Collapsible project section with nested worktrees
// Author: Subash Karki

import { Show, For } from 'solid-js';
import { ContextMenu } from '@kobalte/core/context-menu';
import { ChevronRight, Plus, FolderOpen, Trash2 } from 'lucide-solid';
import * as styles from '@/styles/sidebar.css';
import {
  worktreeMap,
  expandedProjects,
  creatingInProject,
  toggleProject,
  setCreatingInProject,
} from '@/core/signals/worktrees';
import { removeProject } from '@/core/bindings';
import { WorktreeItem } from './WorktreeItem';
import { InlineWorktreeInput } from './InlineWorktreeInput';
import type { Project } from '@/core/types';

interface ProjectSectionProps {
  project: Project;
}

export function ProjectSection(props: ProjectSectionProps) {
  const worktrees = () => worktreeMap()[props.project.id] ?? [];
  const isExpanded = () => expandedProjects().has(props.project.id);
  const isCreating = () => creatingInProject() === props.project.id;

  function handleHeaderClick() {
    toggleProject(props.project.id);
  }

  function handleAddClick(e: MouseEvent) {
    e.stopPropagation();
    if (!isExpanded()) toggleProject(props.project.id);
    setCreatingInProject(props.project.id);
  }

  async function handleRemoveProject() {
    await removeProject(props.project.id);
  }

  return (
    <ContextMenu>
      <div class={styles.projectSection}>
        {/* Project header */}
        <ContextMenu.Trigger as="div" class={styles.projectHeader} onClick={handleHeaderClick}>
          <ChevronRight
            size={12}
            class={`${styles.chevron}${isExpanded() ? ` ${styles.chevronExpanded}` : ''}`}
          />
          <span class={styles.projectName} title={props.project.name}>
            {props.project.name}
          </span>
          <span class={styles.worktreeCount}>{worktrees().length}</span>
          {/* Add worktree button */}
          <button
            class={styles.projectAddButton}
            onClick={handleAddClick}
            title="New worktree"
            type="button"
          >
            <Plus size={12} />
          </button>
        </ContextMenu.Trigger>

        {/* Worktree list (expanded) */}
        <Show when={isExpanded()}>
          <div class={styles.worktreeList}>
            <For each={worktrees()}>
              {(wt) => (
                <WorktreeItem
                  worktree={wt}
                  projectId={props.project.id}
                  hasActiveSession={!!wt.is_active}
                />
              )}
            </For>
            <Show when={isCreating()}>
              <InlineWorktreeInput projectId={props.project.id} />
            </Show>
          </div>
        </Show>
      </div>

      {/* Context menu for the project */}
      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenuContent}>
          <ContextMenu.Item
            class={styles.contextMenuItem}
            onSelect={handleAddClick as any}
          >
            <Plus size={13} />
            New Worktree
          </ContextMenu.Item>
          <ContextMenu.Item
            class={styles.contextMenuItem}
            onSelect={handleHeaderClick}
          >
            <FolderOpen size={13} />
            {isExpanded() ? 'Collapse' : 'Expand'}
          </ContextMenu.Item>
          <ContextMenu.Separator class={styles.contextMenuSeparator} />
          <ContextMenu.Item
            class={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
            onSelect={handleRemoveProject}
          >
            <Trash2 size={13} />
            Remove Project
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}
