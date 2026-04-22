// PhantomOS v2 — Single worktree row with context menu
// Author: Subash Karki

import { Show } from 'solid-js';
import { ContextMenu } from '@kobalte/core/context-menu';
import { Terminal, Trash2, GitBranch, GitFork, FolderOpen, ExternalLink, Clipboard, Pencil, RefreshCw, ArrowDownFromLine, ArrowUpFromLine, X } from 'lucide-solid';
import { Tip } from '@/shared/Tip/Tip';
import * as styles from '@/styles/sidebar.css';
import { activeWorktreeId } from '@/core/signals/app';
import { selectWorktree, removeWorktreeById } from '@/core/signals/worktrees';
import { addTabWithData } from '@/core/panes/signals';
import type { Workspace } from '@/core/types';

interface WorktreeItemProps {
  worktree: Workspace;
  projectId: string;
  hasActiveSession?: boolean;
}

export function WorktreeItem(props: WorktreeItemProps) {
  const isActive = () => activeWorktreeId() === props.worktree.id;

  const tooltipLabel = () => {
    const wt = props.worktree;
    if (wt.type === 'branch') return `Branch: ${wt.branch}`;
    return [
      `Branch: ${wt.branch}`,
      wt.base_branch && wt.base_branch !== wt.branch ? `From: ${wt.base_branch}` : null,
    ].filter(Boolean).join('\n');
  };

  function handleClick() {
    selectWorktree(props.worktree.id);
  }

  async function handleDelete() {
    await removeWorktreeById(props.projectId, props.worktree.id);
  }

  return (
    <Tip openDelay={400} label={tooltipLabel()}>
    <ContextMenu>
      <ContextMenu.Trigger
        as="div"
        class={`${styles.worktreeItem}${isActive() ? ` ${styles.worktreeItemActive}` : ''}`}
        onClick={handleClick}
      >
        {props.worktree.type === 'branch' ? (
          <Tip label="Local branch"><GitBranch size={13} class={styles.worktreeIcon} /></Tip>
        ) : (
          <Tip label="Git worktree"><GitFork size={13} class={styles.worktreeIcon} /></Tip>
        )}
        <span class={styles.branchName}>
          {props.worktree.branch}
        </span>
        {props.hasActiveSession && (
          <Tip label="Active session"><span class={styles.sessionDot} /></Tip>
        )}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenuContent}>
          <Show when={props.worktree.type === 'branch'}>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => {}}>
              <GitBranch size={13} />
              Switch Branch...
            </ContextMenu.Item>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => {}}>
              <RefreshCw size={13} />
              Fetch Latest
            </ContextMenu.Item>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => {}}>
              <ArrowDownFromLine size={13} />
              Pull
            </ContextMenu.Item>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => {}}>
              <ArrowUpFromLine size={13} />
              Push
            </ContextMenu.Item>
            <ContextMenu.Separator class={styles.contextMenuSeparator} />
          </Show>

          <ContextMenu.Item
            class={styles.contextMenuItem}
            onSelect={() => {
              const p = props.worktree.worktree_path;
              if (p) window.open(`file://${p}`);
            }}
          >
            <FolderOpen size={13} />
            Open in Finder
          </ContextMenu.Item>
          <ContextMenu.Item
            class={styles.contextMenuItem}
            onSelect={() => {
              const p = props.worktree.worktree_path;
              if (p) addTabWithData('terminal', 'Editor', { cwd: p, command: 'code .' });
            }}
          >
            <ExternalLink size={13} />
            Open in Editor
          </ContextMenu.Item>
          <ContextMenu.Item
            class={styles.contextMenuItem}
            onSelect={() => {
              const p = props.worktree.worktree_path ?? '';
              navigator.clipboard.writeText(p);
            }}
          >
            <Clipboard size={13} />
            Copy Path
          </ContextMenu.Item>

          <Show when={props.worktree.type !== 'branch'}>
            <ContextMenu.Separator class={styles.contextMenuSeparator} />
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => {}}>
              <Pencil size={13} />
              Rename
            </ContextMenu.Item>
            <ContextMenu.Item
              class={styles.contextMenuItem}
              onSelect={() => addTabWithData('terminal', 'Terminal', { cwd: props.worktree.worktree_path ?? '' })}
            >
              <Terminal size={13} />
              Open in Terminal
            </ContextMenu.Item>
            <ContextMenu.Separator class={styles.contextMenuSeparator} />
            <ContextMenu.Item
              class={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
              onSelect={handleDelete}
            >
              <X size={13} />
              Close Worktree
            </ContextMenu.Item>
          </Show>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
    </Tip>
  );
}
