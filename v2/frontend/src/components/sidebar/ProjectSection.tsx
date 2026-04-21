// PhantomOS v2 — Collapsible project section with nested worktrees
// Author: Subash Karki

import { Show, For } from 'solid-js';
import { ContextMenu } from '@kobalte/core/context-menu';
import { ChevronRight, Plus, FolderOpen, Folder, Trash2 } from 'lucide-solid';
import { Tip } from '@/shared/Tip/Tip';
import * as styles from '@/styles/sidebar.css';
import {
  worktreeMap,
  expandedProjects,
  creatingInProject,
  toggleProject,
  setCreatingInProject,
} from '@/core/signals/worktrees';
import { removeProject } from '@/core/bindings';
import { refreshProjects } from '@/core/signals/projects';
import { sessions } from '@/core/signals/sessions';
import { bootstrapWorktrees } from '@/core/signals/worktrees';
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

  const activeSessions = () => sessions().filter(
    (s) => s.status === 'active' || s.status === 'running',
  );

  function hasActiveSession(wt: import('@/core/types').Workspace): boolean {
    const wtPath = wt.worktree_path;
    if (!wtPath) return false;
    return activeSessions().some((s) => s.cwd?.startsWith(wtPath) || s.repo === wtPath);
  }

  function handleHeaderClick() {
    toggleProject(props.project.id);
  }

  function handleAddClick(e?: MouseEvent) {
    e?.stopPropagation();
    console.log('[sidebar] New Worktree clicked, project:', props.project.id, 'expanded:', isExpanded());
    if (!isExpanded()) toggleProject(props.project.id);
    setCreatingInProject(props.project.id);
    console.log('[sidebar] creatingInProject set to:', props.project.id);
  }

  async function handleRemoveProject() {
    console.log('[sidebar] Remove Project clicked:', props.project.id, props.project.name);
    try {
      const result = await removeProject(props.project.id);
      console.log('[sidebar] removeProject result:', result);
      await refreshProjects();
      console.log('[sidebar] projects refreshed');
      await bootstrapWorktrees();
      console.log('[sidebar] worktrees refreshed');
    } catch (err) {
      console.error('[sidebar] removeProject failed:', err);
    }
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
          {isExpanded() ? (
            <Tip label="Project (expanded)"><FolderOpen size={14} class={styles.projectIcon} /></Tip>
          ) : (
            <Tip label="Project"><Folder size={14} class={styles.projectIcon} /></Tip>
          )}
          <span class={styles.projectName} title={props.project.name}>
            {props.project.name}
          </span>
          <span class={styles.worktreeCount}>{worktrees().length}</span>
          {/* Add worktree button */}
          <Tip label="New worktree">
            <button
              class={styles.projectAddButton}
              onClick={handleAddClick}
              type="button"
            >
              <Plus size={12} />
            </button>
          </Tip>
        </ContextMenu.Trigger>

        {/* Worktree list (expanded) */}
        <Show when={isExpanded()}>
          <div class={styles.worktreeList}>
            <For each={worktrees()}>
              {(wt) => (
                <WorktreeItem
                  worktree={wt}
                  projectId={props.project.id}
                  hasActiveSession={hasActiveSession(wt)}
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
            onSelect={() => handleAddClick()}
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
