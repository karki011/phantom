// PhantomOS v2 — Single worktree row with context menu
// Author: Subash Karki

import { Show, createSignal } from 'solid-js';
import { ContextMenu } from '@kobalte/core/context-menu';
import { Terminal, Trash2, GitBranch, GitFork, FolderOpen, ExternalLink, Clipboard, Pencil, RefreshCw, ArrowDownFromLine, ArrowUpFromLine, X } from 'lucide-solid';
import { Tip } from '@/shared/Tip/Tip';
import * as styles from '@/styles/sidebar.css';
import { activeWorktreeId } from '@/core/signals/app';
import { selectWorktree, removeWorktreeById } from '@/core/signals/worktrees';
import { addTabWithData } from '@/core/panes/signals';
import { gitFetch, gitPull, gitPush, getWorkspaceStatus } from '@/core/bindings';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { SwitchBranchDialog } from '@/shared/SwitchBranchDialog/SwitchBranchDialog';
import { RenameWorktreeDialog } from '@/shared/RenameWorktreeDialog/RenameWorktreeDialog';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { buttonRecipe } from '@/styles/recipes.css';
import { vars } from '@/styles/theme.css';
import type { Workspace } from '@/core/types';

interface WorktreeItemProps {
  worktree: Workspace;
  projectId: string;
  hasActiveSession?: boolean;
}

export function WorktreeItem(props: WorktreeItemProps) {
  const isActive = () => activeWorktreeId() === props.worktree.id;

  const [showBranchPicker, setShowBranchPicker] = createSignal(false);
  const [showRename, setShowRename] = createSignal(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [dirtyCount, setDirtyCount] = createSignal(0);

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

  async function doDelete() {
    setShowDeleteConfirm(false);
    console.log('[WorktreeItem] doDelete called', { projectId: props.projectId, worktreeId: props.worktree.id });
    const ok = await removeWorktreeById(props.projectId, props.worktree.id);
    console.log('[WorktreeItem] removeWorktreeById result:', ok);
    if (ok) {
      showToast('Worktree closed', props.worktree.name);
    } else {
      showWarningToast('Close failed', 'Could not remove worktree — it may be in use');
    }
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
      <p style={{ margin: 0, 'font-family': vars.font.body, 'font-size': vars.fontSize.sm, color: vars.color.textPrimary, 'line-height': '1.6' }}>
        <strong>{props.worktree.name}</strong> has <span style={{ color: vars.color.warning, 'font-weight': '600' }}>{dirtyCount()}</span> uncommitted change{dirtyCount() > 1 ? 's' : ''}. Closing will permanently remove the worktree directory from disk.
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
    </Tip>
  );
}
