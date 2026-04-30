// PhantomOS v2 — Single worktree row with context menu
// Author: Subash Karki

import { Show, createMemo, createSignal } from 'solid-js';
import { ContextMenu } from '@kobalte/core/context-menu';
import { Terminal, Trash2, GitBranch, GitFork, FolderOpen, ExternalLink, Clipboard, Pencil, RefreshCw, ArrowDownFromLine, ArrowUpFromLine, X, LoaderCircle } from 'lucide-solid';

import * as styles from '@/styles/sidebar.css';
import { spin } from '@/styles/utilities.css';
import { activeWorktreeId } from '@/core/signals/app';
import { sessions } from '@/core/signals/sessions';
import { selectWorktree, removeWorktreeById, statusMap } from '@/core/signals/worktrees';
import { addTabWithData } from '@/core/panes/signals';
import { gitFetch, gitPull, gitPush, getWorkspaceStatus } from '@/core/bindings';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { SwitchBranchDialog } from '@/shared/SwitchBranchDialog/SwitchBranchDialog';
import { RenameWorktreeDialog } from '@/shared/RenameWorktreeDialog/RenameWorktreeDialog';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { buttonRecipe } from '@/styles/recipes.css';
import type { Workspace } from '@/core/types';

interface WorktreeItemProps {
  worktree: Workspace;
  projectId: string;
  defaultBranch?: string;
  hasActiveSession?: boolean;
}

export function WorktreeItem(props: WorktreeItemProps) {
  const isActive = () => activeWorktreeId() === props.worktree.id;
  // Resolve the live session for this worktree by matching cwd to worktree_path.
  // Used purely to read `live_state` for the sidebar dot.
  const session = () => {
    const path = props.worktree.worktree_path;
    if (!path) return undefined;
    return sessions().find(
      (s) => s.cwd === path && (s.status === 'active' || s.status === 'paused'),
    );
  };

  const [showBranchPicker, setShowBranchPicker] = createSignal(false);
  const [showRename, setShowRename] = createSignal(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [dirtyCount, setDirtyCount] = createSignal(0);

  // Live dirty-file counts from the global status map. Hidden when clean.
  const dirtyStatus = createMemo(() => {
    const path = props.worktree.worktree_path;
    if (!path) return null;
    const s = statusMap()[path];
    if (!s) return null;
    const staged = s.staged?.length ?? 0;
    const unstaged = s.unstaged?.length ?? 0;
    const untracked = s.untracked?.length ?? 0;
    const total = staged + unstaged + untracked;
    if (total === 0) return null;
    return { staged, unstaged, untracked, total };
  });

  const dirtyTooltip = () => {
    const d = dirtyStatus();
    if (!d) return '';
    const parts: string[] = [];
    if (d.staged > 0) parts.push(`${d.staged} staged`);
    if (d.unstaged > 0) parts.push(`${d.unstaged} unstaged`);
    if (d.untracked > 0) parts.push(`${d.untracked} untracked`);
    return parts.join(' · ');
  };

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

  async function handleDeleteRequest() {
    try {
      console.log('[WorktreeItem] handleDeleteRequest', { id: props.worktree.id, name: props.worktree.name, type: props.worktree.type, projectId: props.projectId });
      const status = await getWorkspaceStatus(props.worktree.id);
      console.log('[WorktreeItem] getWorkspaceStatus result:', status);
      const changes = (status?.staged?.length ?? 0) + (status?.unstaged?.length ?? 0) + (status?.untracked?.length ?? 0);
      if (changes > 0) {
        console.log('[WorktreeItem] dirty worktree, showing confirm dialog', { changes });
        setDirtyCount(changes);
        setShowDeleteConfirm(true);
      } else {
        console.log('[WorktreeItem] clean worktree, proceeding to delete');
        await doDelete();
      }
    } catch (err) {
      console.error('[WorktreeItem] handleDeleteRequest error:', err);
      showWarningToast('Delete error', String(err));
    }
  }

  const [deleting, setDeleting] = createSignal(false);

  async function doDelete() {
    setShowDeleteConfirm(false);
    setDeleting(true);
    showToast('Closing worktree', `Removing ${props.worktree.name}...`);
    const ok = await removeWorktreeById(
      props.projectId,
      props.worktree.id,
      props.worktree.worktree_path ?? '',
    );
    setDeleting(false);
    if (!ok) {
      showWarningToast('Close failed', 'Could not remove worktree — it may be in use');
    }
  }

  return (
    <>
    <ContextMenu>
      <ContextMenu.Trigger
        as="div"
        class={`${styles.worktreeItem}${isActive() ? ` ${styles.worktreeItemActive}` : ''}`}
        onClick={handleClick}
        draggable={true}
        onDragStart={(e: DragEvent) => {
          const path = props.worktree.worktree_path ?? '';
          e.dataTransfer?.setData('text/phantom-path', path);
          e.dataTransfer?.setData('text/plain', path);
        }}
      >
        {deleting() ? (
          <LoaderCircle size={13} class={`${styles.worktreeIcon} ${spin}`} />
        ) : props.worktree.type === 'branch' ? (
          <GitBranch size={13} class={styles.worktreeIcon} />
        ) : (
          <GitFork size={13} class={styles.worktreeIcon} />
        )}
        <span class={styles.branchName}>
          {props.worktree.branch}
        </span>
        <Show when={dirtyStatus()}>
          {(d) => (
            <span
              class={styles.dirtyBadge}
              title={dirtyTooltip()}
              aria-label={`${d().total} uncommitted file${d().total === 1 ? '' : 's'}`}
            >
              ±{d().total}
            </span>
          )}
        </Show>
        {props.hasActiveSession && (
          <span class={styles.sessionDot} data-live-state={session()?.live_state} />
        )}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenuContent}>
          <Show when={props.worktree.type === 'branch'}>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => setShowBranchPicker(true)}>
              <GitBranch size={13} />
              Switch Branch...
            </ContextMenu.Item>
            <ContextMenu.Item
              class={styles.contextMenuItem}
              onSelect={async () => {
                const ok = await gitFetch(props.projectId);
                if (ok) showToast('Fetch complete', 'Fetched latest from origin');
                else showWarningToast('Fetch failed', 'Could not fetch from origin');
              }}
            >
              <RefreshCw size={13} />
              Fetch Latest
            </ContextMenu.Item>
            <ContextMenu.Item
              class={styles.contextMenuItem}
              onSelect={async () => {
                const ok = await gitPull(props.worktree.id);
                if (ok) showToast('Pull complete', `Pulled latest for ${props.worktree.branch}`);
                else showWarningToast('Pull failed', 'Could not pull changes');
              }}
            >
              <ArrowDownFromLine size={13} />
              Pull
            </ContextMenu.Item>
            <ContextMenu.Item
              class={styles.contextMenuItem}
              onSelect={async () => {
                const ok = await gitPush(props.worktree.id);
                if (ok) showToast('Push complete', `Pushed ${props.worktree.branch} to origin`);
                else showWarningToast('Push failed', 'Could not push to origin');
              }}
            >
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
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => setShowRename(true)}>
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
              onSelect={handleDeleteRequest}
            >
              <X size={13} />
              Close Worktree
            </ContextMenu.Item>
          </Show>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>

    <SwitchBranchDialog
      open={showBranchPicker}
      onClose={() => setShowBranchPicker(false)}
      projectId={props.projectId}
      defaultBranch={props.defaultBranch}
    />
    <Show when={props.worktree.type !== 'branch'}>
      <RenameWorktreeDialog
        open={showRename}
        onClose={() => setShowRename(false)}
        worktreeId={props.worktree.id}
        currentName={props.worktree.name}
      />
    </Show>
    <PhantomModal
      open={showDeleteConfirm}
      onOpenChange={(open) => { if (!open) setShowDeleteConfirm(false); }}
      title="Close Worktree"
      description="This action cannot be undone"
      size="sm"
    >
      <p class={styles.deleteWarningText}>
        <strong>{props.worktree.name}</strong> has <span class={styles.deleteWarningCount}>{dirtyCount()}</span> uncommitted change{dirtyCount() > 1 ? 's' : ''}. Closing will permanently remove the worktree directory from disk.
      </p>
      <div class={phantomModalStyles.actions}>
        <button type="button" class={buttonRecipe({ variant: 'ghost', size: 'md' })} onClick={() => setShowDeleteConfirm(false)}>
          Cancel
        </button>
        <button type="button" class={buttonRecipe({ variant: 'danger', size: 'md' })} onClick={doDelete}>
          Close Anyway
        </button>
      </div>
    </PhantomModal>
    </>
  );
}
