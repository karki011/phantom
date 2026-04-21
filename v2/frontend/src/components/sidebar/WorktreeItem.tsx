// PhantomOS v2 — Single worktree row with context menu
// Author: Subash Karki

import { ContextMenu } from '@kobalte/core/context-menu';
import { Terminal, Trash2 } from 'lucide-solid';
import * as styles from '@/styles/sidebar.css';
import { activeWorktreeId } from '@/core/signals/app';
import { selectWorktree, removeWorktreeById } from '@/core/signals/worktrees';
import type { Workspace } from '@/core/types';

interface WorktreeItemProps {
  worktree: Workspace;
  projectId: string;
  hasActiveSession?: boolean;
}

export function WorktreeItem(props: WorktreeItemProps) {
  const isActive = () => activeWorktreeId() === props.worktree.id;

  function handleClick() {
    selectWorktree(props.worktree.id);
  }

  async function handleDelete() {
    await removeWorktreeById(props.projectId, props.worktree.id);
  }

  return (
    <ContextMenu>
      <ContextMenu.Trigger
        as="div"
        class={`${styles.worktreeItem}${isActive() ? ` ${styles.worktreeItemActive}` : ''}`}
        onClick={handleClick}
      >
        <span class={styles.branchName} title={props.worktree.branch}>
          {props.worktree.branch}
        </span>
        {props.hasActiveSession && (
          <span class={styles.sessionDot} title="Active session" />
        )}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenuContent}>
          <ContextMenu.Item
            class={styles.contextMenuItem}
            onSelect={handleClick}
          >
            <Terminal size={13} />
            Open Terminal
          </ContextMenu.Item>

          <ContextMenu.Separator class={styles.contextMenuSeparator} />

          <ContextMenu.Item
            class={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
            onSelect={handleDelete}
          >
            <Trash2 size={13} />
            Delete Worktree
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}
