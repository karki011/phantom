// PhantomOS v2 — Worktree home pane (Hunter's Terminal)
// Author: Subash Karki

import { createMemo, createSignal, createEffect, on, Show } from 'solid-js';
import { GitBranch, ArrowUp, ArrowDown, FileEdit, FileQuestion } from 'lucide-solid';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { projects } from '@/core/signals/projects';
import { addTabWithData } from '@/core/panes/signals';
import { NewWorktreeDialog } from '@/shared/NewWorktreeDialog/NewWorktreeDialog';
import { getWorkspaceStatus, gitPull, gitPush, refreshWorkspaceStatus } from '@/core/bindings';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import type { RepoStatus } from '@/core/types';
import * as styles from '@/styles/home.css';

export default function WorktreeHome() {
  const activeWorktree = createMemo(() => {
    const wtId = activeWorktreeId();
    if (!wtId) return null;
    for (const workspaces of Object.values(worktreeMap())) {
      const match = workspaces.find((w) => w.id === wtId);
      if (match) return match;
    }
    return null;
  });

  const activeProject = createMemo(() => {
    const wt = activeWorktree();
    if (!wt) return null;
    return projects().find((p) => p.id === wt.project_id) ?? null;
  });

  const [worktreeOpen, setWorktreeOpen] = createSignal(false);
  const [repoStatus, setRepoStatus] = createSignal<RepoStatus | null>(null);

  createEffect(on(activeWorktreeId, async (wtId) => {
    if (!wtId) { setRepoStatus(null); return; }
    const status = await getWorkspaceStatus(wtId);
    setRepoStatus(status);
  }));

  return (
    <div class={styles.homeContainer}>
      {/* Workspace Status Card */}
      <div class={styles.statusCard}>
        {/* Row 1: Icon + Label */}
        <div class={styles.statusHeader}>
          <span class={styles.statusIcon}>
            <GitBranch size={14} />
          </span>
          <span class={styles.statusTitle}>Workspace Status</span>
        </div>

        {/* Row 2: Status dot + Branch name */}
        <div class={styles.statusBranch}>
          <span class={repoStatus()?.is_clean ? styles.statusDot : styles.statusDotDirty} />
          <span class={styles.statusBranchName}>{activeWorktree()?.branch ?? '—'}</span>
        </div>

        {/* Row 3: Git sync info */}
        <Show when={repoStatus()}>
          <div class={styles.statusGitInfo}>
            <Show when={(repoStatus()?.ahead_by ?? 0) > 0}>
              <button
                type="button"
                class={styles.statusActionButton}
                title={`Push ${repoStatus()!.ahead_by} commit(s) to remote`}
                onClick={async () => {
                  const wtId = activeWorktreeId();
                  if (!wtId) return;
                  const ok = await gitPush(wtId);
                  if (ok) {
                    showToast('Pushed', 'Changes pushed to remote');
                    setRepoStatus(await getWorkspaceStatus(wtId));
                  } else {
                    showWarningToast('Push failed', 'Could not push to remote');
                  }
                }}
              >
                <ArrowUp size={11} />
                {repoStatus()!.ahead_by} to push
              </button>
            </Show>
            <Show when={(repoStatus()?.behind_by ?? 0) > 0}>
              <button
                type="button"
                class={styles.statusActionButtonWarn}
                title={`Pull ${repoStatus()!.behind_by} commit(s) from remote`}
                onClick={async () => {
                  const wtId = activeWorktreeId();
                  if (!wtId) return;
                  const ok = await gitPull(wtId);
                  if (ok) {
                    showToast('Pulled', 'Up to date with remote');
                    setRepoStatus(await getWorkspaceStatus(wtId));
                  } else {
                    showWarningToast('Pull failed', 'Could not pull from remote');
                  }
                }}
              >
                <ArrowDown size={11} />
                {repoStatus()!.behind_by} to pull
              </button>
            </Show>
            <Show when={(repoStatus()?.staged?.length ?? 0) + (repoStatus()?.unstaged?.length ?? 0) > 0}>
              <span class={styles.statusBadge} title="Modified files">
                <FileEdit size={11} />
                {(repoStatus()?.staged?.length ?? 0) + (repoStatus()?.unstaged?.length ?? 0)}
              </span>
            </Show>
            <Show when={(repoStatus()?.untracked?.length ?? 0) > 0}>
              <span class={styles.statusBadge} title="Untracked files">
                <FileQuestion size={11} />
                {repoStatus()!.untracked!.length}
              </span>
            </Show>
            <Show when={repoStatus()?.is_clean && (repoStatus()?.ahead_by ?? 0) === 0 && (repoStatus()?.behind_by ?? 0) === 0}>
              <span class={styles.statusClean}>Clean · In sync</span>
            </Show>
          </div>
        </Show>

        {/* Row 4: Meta */}
        <div class={styles.statusMeta}>
          {activeWorktree()?.type === 'branch' ? 'Local' : 'Worktree'}
          {' · '}
          <span title={activeWorktree()?.worktree_path ?? ''}>{activeWorktree()?.worktree_path ?? '—'}</span>
        </div>
      </div>

      {/* Separator */}
      <div class={styles.sectionSeparator} />

      {/* Quick Actions */}
      <div>
        <div class={styles.sectionTitle}>Quick Actions</div>
        <div class={styles.quickActions}>
          {/* Terminal */}
          <button class={styles.quickActionButton} type="button" title="Open a terminal in this worktree" onClick={() => addTabWithData('terminal', 'Terminal', { cwd: activeWorktree()?.worktree_path ?? '' })}>
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.4" />
              <path d="M4 6l2.5 2L4 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M8 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class={styles.quickActionLabel}>Terminal</span>
          </button>

          {/* New Session — worktree flow from local branch, direct Claude from worktree */}
          <button
            class={styles.quickActionButton}
            type="button"
            title={activeWorktree()?.type === 'branch' ? 'Create a worktree and start Claude session' : 'Start Claude in this worktree'}
            onClick={() => {
              if (activeWorktree()?.type === 'branch') {
                setWorktreeOpen(true);
              } else {
                addTabWithData('terminal', 'Claude', {
                  cwd: activeWorktree()?.worktree_path ?? '',
                  command: 'claude --dangerously-skip-permissions',
                });
              }
            }}
          >
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.4" />
              <path d="M9 5.5L7 8.5h2.5L7 11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class={styles.quickActionLabel}>New Session</span>
          </button>

          {/* Editor */}
          <button class={styles.quickActionButton} type="button" title="Open code editor (coming soon)">
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" stroke-width="1.4" />
              <path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class={styles.quickActionLabel}>Editor</span>
            <span class={styles.quickActionHint}>coming soon</span>
          </button>

          {/* Chat */}
          <button class={styles.quickActionButton} type="button" title="Chat with Claude (coming soon)">
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7A1.5 1.5 0 0112.5 12H9l-3 2v-2H3.5A1.5 1.5 0 012 10.5v-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
              <path d="M5 6h6M5 8.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class={styles.quickActionLabel}>Chat</span>
            <span class={styles.quickActionHint}>coming soon</span>
          </button>

          {/* Recipe / Run */}
          <button class={styles.quickActionButton} type="button" title="Run a project recipe (coming soon)">
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4" />
              <path d="M6.5 5.5l4 2.5-4 2.5V5.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="currentColor" />
            </svg>
            <span class={styles.quickActionLabel}>Recipe</span>
            <span class={styles.quickActionHint}>coming soon</span>
          </button>
        </div>
      </div>

      {activeProject() && (
        <NewWorktreeDialog
          open={worktreeOpen}
          onOpenChange={setWorktreeOpen}
          projectId={activeProject()!.id}
          projectName={activeProject()!.name}
          defaultBranch={activeProject()!.default_branch ?? 'main'}
        />
      )}
    </div>
  );
}
