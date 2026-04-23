// PhantomOS v2 — Worktree home pane (Hunter's Terminal)
// Author: Subash Karki

import { createMemo, createSignal, createEffect, on, onCleanup, Show, For } from 'solid-js';
import { GitBranch, GitPullRequest, ArrowUp, ArrowDown, FileEdit, FileQuestion, ExternalLink, CheckCircle, XCircle, LoaderCircle } from 'lucide-solid';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { projects } from '@/core/signals/projects';
import { addTabWithData } from '@/core/panes/signals';
import { prStatus, setPrStatus, isCreatingPr, setIsCreatingPr, ghAvailable, setGhAvailable } from '@/core/signals/activity';
import { NewWorktreeDialog } from '@/shared/NewWorktreeDialog/NewWorktreeDialog';
import { getWorkspaceStatus, gitPull, gitPush, getPrStatus, getCiRuns, createPrWithAI, listOpenPrs, isGhCliAvailable } from '@/core/bindings';
import { openURL } from '@/core/bindings/shell';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { vars } from '@/styles/theme.css';
import type { RepoStatus, PrStatus as PrStatusType, CiRun } from '@/core/types';
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
  const [openPrs, setOpenPrs] = createSignal<PrStatusType[]>([]);
  const [ciSummary, setCiSummary] = createSignal<CiRun[] | null>(null);
  const [statusLoading, setStatusLoading] = createSignal(true);
  const [activityLoading, setActivityLoading] = createSignal(true);

  const isDefaultBranch = createMemo(() => {
    const wt = activeWorktree();
    const proj = activeProject();
    if (!wt || !proj) return false;
    return wt.branch === (proj.default_branch ?? 'main');
  });

  createEffect(on(activeWorktreeId, (wtId) => {
    if (!wtId) { setRepoStatus(null); return; }

    let cancelled = false;
    setStatusLoading(true);
    setActivityLoading(true);

    getWorkspaceStatus(wtId).then((status) => {
      if (cancelled) return;
      setRepoStatus(status);
      setStatusLoading(false);
    });

    (async () => {
      if (!ghAvailable()) {
        const available = await isGhCliAvailable();
        if (cancelled) return;
        setGhAvailable(available);
        if (!available) { setActivityLoading(false); return; }
      }
      if (isDefaultBranch()) {
        const prs = await listOpenPrs(wtId, 20);
        if (!cancelled) setOpenPrs(prs);
      } else {
        const [pr, ci] = await Promise.all([getPrStatus(wtId), getCiRuns(wtId)]);
        if (!cancelled) { setPrStatus(pr); setCiSummary(ci); }
      }
      if (!cancelled) setActivityLoading(false);
    })();

    onCleanup(() => { cancelled = true; });
  }));

  function prAge(isoDate: string): string {
    if (!isoDate) return '';
    const ms = Date.now() - new Date(isoDate).getTime();
    const days = Math.floor(ms / 86_400_000);
    if (days < 1) return 'today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
  }

  function prStateColor(pr: PrStatusType): string {
    if (pr.is_draft) return vars.color.textDisabled;
    if (pr.state === 'OPEN') return vars.color.success;
    if (pr.state === 'MERGED') return vars.color.mana;
    return vars.color.danger;
  }

  return (
    <div class={styles.homeContainer}>
      {/* Combined Status + Activity Card */}
      <div class={styles.statusCard}>
        <div class={styles.statusHeader}>
          <span class={styles.statusIcon}><GitBranch size={14} /></span>
          <span class={styles.statusTitle}>Workspace Status</span>
        </div>

        <div class={styles.statusBranch}>
          <span class={repoStatus()?.is_clean ? styles.statusDot : styles.statusDotDirty} />
          <span class={styles.statusBranchName}>{activeWorktree()?.branch ?? '—'}</span>
        </div>

        <Show when={statusLoading()}>
          <span class={styles.statusClean}>Scanning...</span>
        </Show>
        <Show when={!statusLoading() && repoStatus()}>
          <div class={styles.statusGitInfo}>
            <Show when={(repoStatus()?.ahead_by ?? 0) > 0}>
              <button type="button" class={styles.statusActionButton} onClick={async () => {
                const wtId = activeWorktreeId();
                if (!wtId) return;
                const ok = await gitPush(wtId);
                if (ok) { showToast('Pushed', 'Changes pushed to remote'); setRepoStatus(await getWorkspaceStatus(wtId)); }
                else { showWarningToast('Push failed', 'Could not push to remote'); }
              }}>
                <ArrowUp size={11} />{repoStatus()!.ahead_by} to push
              </button>
            </Show>
            <Show when={(repoStatus()?.behind_by ?? 0) > 0}>
              <button type="button" class={styles.statusActionButtonWarn} onClick={async () => {
                const wtId = activeWorktreeId();
                if (!wtId) return;
                const ok = await gitPull(wtId);
                if (ok) { showToast('Pulled', 'Up to date with remote'); setRepoStatus(await getWorkspaceStatus(wtId)); }
                else { showWarningToast('Pull failed', 'Could not pull from remote'); }
              }}>
                <ArrowDown size={11} />{repoStatus()!.behind_by} to pull
              </button>
            </Show>
            <Show when={(repoStatus()?.staged?.length ?? 0) + (repoStatus()?.unstaged?.length ?? 0) > 0}>
              <span class={styles.statusBadge} title="Modified files">
                <FileEdit size={11} />{(repoStatus()?.staged?.length ?? 0) + (repoStatus()?.unstaged?.length ?? 0)}
              </span>
            </Show>
            <Show when={(repoStatus()?.untracked?.length ?? 0) > 0}>
              <span class={styles.statusBadge} title="Untracked files">
                <FileQuestion size={11} />{repoStatus()!.untracked!.length}
              </span>
            </Show>
            <Show when={repoStatus()?.is_clean && (repoStatus()?.ahead_by ?? 0) === 0 && (repoStatus()?.behind_by ?? 0) === 0}>
              <span class={styles.statusClean}>Clean · In sync</span>
            </Show>
          </div>
        </Show>

        <div class={styles.statusMeta}>
          {activeWorktree()?.type === 'branch' ? 'Local' : 'Worktree'}
          {' · '}
          <span title={activeWorktree()?.worktree_path ?? ''}>{activeWorktree()?.worktree_path ?? '—'}</span>
        </div>

        <Show when={ghAvailable()}>
          <div class={styles.activityDividerHome} />

          <div class={styles.activityCardHeader}>
            <span class={styles.activityCardIcon}><GitPullRequest size={14} /></span>
            <span class={styles.activityCardTitle}>
              {isDefaultBranch() ? 'Open Pull Requests' : 'Pull Request'}
            </span>
          </div>

          <Show when={activityLoading()}>
            <span class={styles.activityEmpty}>Loading...</span>
          </Show>

          <Show when={!activityLoading() && isDefaultBranch()}>
            <Show
              when={openPrs().length > 0}
              fallback={<span class={styles.activityEmpty}>No open PRs targeting {activeWorktree()?.branch}</span>}
            >
              <div class={styles.prListScroll}>
                <For each={openPrs()}>
                  {(pr) => (
                    <div class={styles.prCardCompact} onClick={() => openURL(pr.url)}>
                      <div class={styles.prCardRow}>
                        <span class={styles.prStateDotSmall} style={{ background: prStateColor(pr) }} />
                        <span class={styles.prCardTitle}>{pr.title}</span>
                        <span class={styles.prCardNumber}>#{pr.number}</span>
                        <ExternalLink size={10} style={{ color: vars.color.textDisabled, 'flex-shrink': '0' }} />
                      </div>
                      <div class={styles.prCardRow}>
                        <span class={styles.prCardBranch}>{pr.head_ref_name}</span>
                        <span class={styles.prCardMeta}>
                          <Show when={pr.checks_total > 0}>
                            <span title={`${pr.checks_passed} passed · ${pr.checks_failed} failed · ${pr.checks_pending} pending`}>
                              {pr.checks_failed > 0
                                ? <XCircle size={9} style={{ color: vars.color.danger }} />
                                : pr.checks_pending > 0
                                ? <LoaderCircle size={9} style={{ color: vars.color.warning, animation: 'spin 1s linear infinite' }} />
                                : <CheckCircle size={9} style={{ color: vars.color.success }} />
                              }
                            </span>
                            {' · '}
                          </Show>
                          {pr.author} · {prAge(pr.created_at)}
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          {/* Feature branch: single PR or create button */}
          <Show when={!activityLoading() && !isDefaultBranch()}>
            <Show when={isCreatingPr()}>
              <div class={styles.prCardRow}>
                <LoaderCircle size={14} style={{ color: vars.color.accent, animation: 'spin 1s linear infinite' }} />
                <span style={{ 'font-size': vars.fontSize.xs, color: vars.color.textSecondary }}>Claude is creating PR...</span>
              </div>
            </Show>

            <Show when={!isCreatingPr() && prStatus()}>
              <div class={styles.prCardCompact} onClick={() => openURL(prStatus()!.url)}>
                <div class={styles.prCardRow}>
                  <span class={styles.prStateDotSmall} style={{ background: prStateColor(prStatus()!) }} />
                  <span class={styles.prStateLabel} style={{ color: prStateColor(prStatus()!) }}>
                    {prStatus()!.is_draft ? 'DRAFT' : prStatus()!.state}
                  </span>
                </div>
                <div class={styles.prCardRow}>
                  <span class={styles.prCardTitle}>{prStatus()!.title}</span>
                  <span class={styles.prCardNumber}>#{prStatus()!.number}</span>
                  <ExternalLink size={10} style={{ color: vars.color.textDisabled, 'flex-shrink': '0' }} />
                </div>
                <div class={styles.prCardRow}>
                  <span class={styles.prCardBranch}>{prStatus()!.head_ref_name} → {prStatus()!.base_ref_name}</span>
                  <span class={styles.prCardMeta}>{prStatus()!.author} · {prAge(prStatus()!.created_at)}</span>
                </div>
              </div>

              <Show when={ciSummary()}>
                {(runs) => {
                  const passed = () => runs().filter((r) => r.conclusion === 'success').length;
                  const failed = () => runs().filter((r) => r.conclusion === 'failure').length;
                  const pending = () => runs().filter((r) => !r.conclusion || r.conclusion === '').length;
                  return (
                    <div class={styles.prCardRow} style={{ 'margin-top': vars.space.xs }}>
                      <Show when={failed() > 0}>
                        <XCircle size={12} style={{ color: vars.color.danger }} />
                        <span style={{ 'font-size': '0.65rem', color: vars.color.danger }}>{failed()} failed</span>
                      </Show>
                      <Show when={failed() === 0 && pending() > 0}>
                        <LoaderCircle size={12} style={{ color: vars.color.warning, animation: 'spin 1s linear infinite' }} />
                        <span style={{ 'font-size': '0.65rem', color: vars.color.warning }}>{pending()} pending</span>
                      </Show>
                      <Show when={failed() === 0 && pending() === 0 && passed() > 0}>
                        <CheckCircle size={12} style={{ color: vars.color.success }} />
                        <span style={{ 'font-size': '0.65rem', color: vars.color.success }}>{passed()} passed</span>
                      </Show>
                    </div>
                  );
                }}
              </Show>
            </Show>

            <Show when={!isCreatingPr() && !prStatus()}>
              <span class={styles.activityEmpty}>No pull request for this branch</span>
              <button
                type="button"
                class={styles.createPrButtonCompact}
                onClick={async () => {
                  const wtId = activeWorktreeId();
                  if (!wtId) return;
                  setIsCreatingPr(true);
                  try { const pr = await createPrWithAI(wtId); setPrStatus(pr); }
                  finally { setIsCreatingPr(false); }
                }}
              >
                <GitPullRequest size={12} />
                Create PR with Claude
              </button>
            </Show>
          </Show>
        </Show>
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
