// PhantomOS v2 — Collapsible project section with nested worktrees
// Author: Subash Karki

import { For, createSignal } from 'solid-js';
import { Collapsible } from '@kobalte/core/collapsible';
import { ContextMenu } from '@kobalte/core/context-menu';
import { ChevronRight, Plus, FolderOpen, Folder, Trash2, Star } from 'lucide-solid';
import { Tip } from '@/shared/Tip/Tip';
import * as styles from '@/styles/sidebar.css';
import {
  worktreeMap,
  expandedProjects,
  toggleProject,
} from '@/core/signals/worktrees';
import { removeProject, toggleStarProject } from '@/core/bindings';
import { refreshProjects } from '@/core/signals/projects';
import { sessions } from '@/core/signals/sessions';
import { bootstrapWorktrees } from '@/core/signals/worktrees';
import { WorktreeItem } from './WorktreeItem';
import { NewWorktreeDialog } from '@/shared/NewWorktreeDialog/NewWorktreeDialog';
import { showWarningToast } from '@/shared/Toast/Toast';
import type { Project } from '@/core/types';

interface ProjectSectionProps {
  project: Project;
}

export function ProjectSection(props: ProjectSectionProps) {
  const worktrees = () => worktreeMap()[props.project.id] ?? [];
  const isExpanded = () => expandedProjects().has(props.project.id);
  const [worktreeOpen, setWorktreeOpen] = createSignal(false);

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

  const isStarred = () => props.project.starred === 1;

  async function handleStarClick(e?: MouseEvent) {
    e?.stopPropagation();
    try {
      await toggleStarProject(props.project.id);
      await refreshProjects();
      await bootstrapWorktrees();
    } catch (err) {
      showWarningToast('Limit reached', 'Maximum of 10 starred projects');
    }
  }

  function handleAddClick(e?: MouseEvent) {
    e?.stopPropagation();
    setWorktreeOpen(true);
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
      <Collapsible
        open={isExpanded()}
        onOpenChange={() => toggleProject(props.project.id)}
        class={styles.projectSection}
      >
        {/* Project header — ContextMenu.Trigger captures right-click;
            Collapsible.Trigger captures left-click for expand/collapse */}
        <ContextMenu.Trigger as="div">
          <Collapsible.Trigger class={styles.projectHeader}>
            <ChevronRight size={12} class={styles.chevron} />
            {isExpanded() ? (
              <Tip label="Project (expanded)"><FolderOpen size={14} class={styles.projectIcon} /></Tip>
            ) : (
              <Tip label="Project"><Folder size={14} class={styles.projectIcon} /></Tip>
            )}
            <span class={styles.projectName} title={props.project.name}>
              {props.project.name}
            </span>
            <span class={styles.worktreeCount}>{worktrees().length}</span>
            <Tip label={isStarred() ? "Unstar project" : "Star project (max 10)"}>
              <button
                class={isStarred() ? styles.starButtonActive : styles.starButton}
                onClick={handleStarClick}
                type="button"
              >
                <Star size={12} />
              </button>
            </Tip>
          </Collapsible.Trigger>
        </ContextMenu.Trigger>

        {/* Worktree list — animated by Kobalte Collapsible */}
        <Collapsible.Content>
          <div class={styles.worktreeList}>
            {/* Branch entries first */}
            <For each={worktrees().filter(wt => wt.type === 'branch')}>
              {(wt) => (
                <WorktreeItem
                  worktree={wt}
                  projectId={props.project.id}
                  hasActiveSession={hasActiveSession(wt)}
                />
              )}
            </For>
            {/* Worktrees second */}
            <For each={worktrees().filter(wt => wt.type !== 'branch')}>
              {(wt) => (
                <WorktreeItem
                  worktree={wt}
                  projectId={props.project.id}
                  hasActiveSession={hasActiveSession(wt)}
                />
              )}
            </For>
          </div>
        </Collapsible.Content>
      </Collapsible>

      <NewWorktreeDialog
        open={worktreeOpen}
        onOpenChange={setWorktreeOpen}
        projectId={props.project.id}
        projectName={props.project.name}
        defaultBranch={props.project.default_branch ?? 'main'}
      />

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
