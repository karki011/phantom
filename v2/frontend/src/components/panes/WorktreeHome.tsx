// PhantomOS v2 — Worktree home pane (Hunter's Terminal)
// Author: Subash Karki

import { createMemo, createSignal, createEffect, on, onCleanup, Show, For } from 'solid-js';
import { GitBranch, GitPullRequest, ArrowUp, ArrowDown, FileEdit, FileQuestion, ExternalLink, CheckCircle, XCircle, LoaderCircle, ChevronRight, RefreshCw } from 'lucide-solid';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { projects } from '@/core/signals/projects';
import { addTabWithData } from '@/core/panes/signals';
import { prStatus, setPrStatus, isCreatingPr, setIsCreatingPr, ghAvailable, setGhAvailable } from '@/core/signals/activity';
import { NewWorktreeDialog } from '@/shared/NewWorktreeDialog/NewWorktreeDialog';
import { getWorkspaceStatus, gitPull, gitPush, getPrStatus, getCiRuns, getCiRunsForBranch, createPrWithAI, listOpenPrs, isGhCliAvailable, getCheckAnnotations, getFailedSteps } from '@/core/bindings';
import { openURL } from '@/core/bindings/shell';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { Tip } from '@/shared/Tip/Tip';
import { vars } from '@/styles/theme.css';
import type { RepoStatus, PrStatus as PrStatusType, CiRun, CheckAnnotation, FailedStep } from '@/core/types';
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
  const [refreshing, setRefreshing] = createSignal(false);

  const isDefaultBranch = createMemo(() => {
    const wt = activeWorktree();
    const proj = activeProject();
    if (!wt || !proj) return false;
    return wt.branch === (proj.default_branch ?? 'main');
  });

  async function refreshAll() {
    const wtId = activeWorktreeId();
    if (!wtId || refreshing()) return;
    setRefreshing(true);

    const statusPromise = getWorkspaceStatus(wtId).then(setRepoStatus);

    const activityPromise = (async () => {
      if (isDefaultBranch()) {
        const prs = await listOpenPrs(wtId, 20);
        setOpenPrs(prs);
      } else {
        const [pr, ci] = await Promise.all([getPrStatus(wtId), getCiRuns(wtId)]);
        setPrStatus(pr);
        setCiSummary(ci);
      }
    })();

    await Promise.all([statusPromise, activityPromise]);
    setRefreshing(false);
  }

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

  function ciStatusLabel(run: CiRun): string {
    if (run.conclusion === 'success') return 'Passed';
    if (run.conclusion === 'failure') return 'Failed';
    if (run.conclusion === 'cancelled') return 'Cancelled';
    if (run.conclusion === 'skipped') return 'Skipped';
    if (run.status === 'in_progress') return 'Running';
    if (run.status === 'queued') return 'Queued';
    return 'Pending';
  }

  function ciRunColor(run: CiRun): string {
    if (run.conclusion === 'success') return vars.color.success;
    if (run.conclusion === 'failure') return vars.color.danger;
    if (run.conclusion === 'skipped' || run.conclusion === 'cancelled') return vars.color.textDisabled;
    return vars.color.warning;
  }

  function ciRunIcon(run: CiRun) {
    if (run.conclusion === 'success') return CheckCircle;
    if (run.conclusion === 'failure') return XCircle;
    return LoaderCircle;
  }

  function buildCiTooltip(runs: CiRun[]) {
    const grouped = new Map<string, CiRun[]>();
    for (const run of runs) {
      const wf = run.workflow || 'Checks';
      if (!grouped.has(wf)) grouped.set(wf, []);
      grouped.get(wf)!.push(run);
    }
    const singleWorkflow = grouped.size <= 1;

    return (
      <div class={styles.ciTooltipList}>
        <span class={styles.ciTooltipHeader}>CI/CD Checks</span>
        <For each={[...grouped.entries()]}>
          {([workflow, wfRuns]) => (
            <>
              <Show when={!singleWorkflow}>
                <span class={styles.ciTooltipWorkflow}>{workflow}</span>
              </Show>
              <For each={wfRuns}>
                {(run) => {
                  const Icon = ciRunIcon(run);
                  const color = ciRunColor(run);
                  const spinning = !run.conclusion || run.conclusion === '';
                  return (
                    <>
                      <div class={styles.ciTooltipRow}>
                        <Icon size={10} style={{
                          color,
                          'flex-shrink': '0',
                          ...(spinning ? { animation: 'spin 1s linear infinite' } : {}),
                        }} />
                        <span class={styles.ciTooltipName}>{run.name}</span>
                        <span class={styles.ciTooltipStatus} style={{ color }}>{ciStatusLabel(run)}</span>
                      </div>
                      <Show when={run.conclusion === 'failure' && run.description}>
                        <div class={styles.ciDescription}>{run.description}</div>
                      </Show>
                    </>
                  );
                }}
              </For>
            </>
          )}
        </For>
      </div>
    );
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
          <Tip label={refreshing() ? 'Refreshing...' : 'Refresh workspace status, PR, and CI data'} placement="bottom">
            <button
              type="button"
              class={styles.statusRefreshButton}
              onClick={refreshAll}
              disabled={refreshing()}
            >
              <RefreshCw size={12} style={refreshing() ? { animation: 'spin 1s linear infinite' } : {}} />
              <span class={styles.statusRefreshLabel}>{refreshing() ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </Tip>
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

          <Show when={!isDefaultBranch() && ciSummary()}>
            {(runs) => {
              const passed = () => runs().filter((r) => r.conclusion === 'success').length;
              const failed = () => runs().filter((r) => r.conclusion === 'failure').length;
              const pending = () => runs().filter((r) => !r.conclusion || r.conclusion === '').length;

              return (
                <div class={styles.statusGitInfo}>
                  <Show when={failed() > 0}>
                    <Tip content={buildCiTooltip(runs())}>
                      <span class={styles.statusBadge} style={{ color: vars.color.danger, 'background-color': `color-mix(in srgb, ${vars.color.danger} 15%, transparent)` }}>
                        <XCircle size={11} />{failed()} failed
                      </span>
                    </Tip>
                  </Show>
                  <Show when={failed() === 0 && pending() > 0}>
                    <Tip content={buildCiTooltip(runs())}>
                      <span class={styles.statusBadge} style={{ color: vars.color.warning, 'background-color': `color-mix(in srgb, ${vars.color.warning} 15%, transparent)` }}>
                        <LoaderCircle size={11} style={{ animation: 'spin 1s linear infinite' }} />{pending()} pending
                      </span>
                    </Tip>
                  </Show>
                  <Show when={failed() === 0 && pending() === 0 && passed() > 0}>
                    <Tip content={buildCiTooltip(runs())}>
                      <span class={styles.statusBadge} style={{ color: vars.color.success, 'background-color': `color-mix(in srgb, ${vars.color.success} 15%, transparent)` }}>
                        <CheckCircle size={11} />{passed()} passed
                      </span>
                    </Tip>
                  </Show>
                </div>
              );
            }}
          </Show>
        </Show>

        <div class={styles.statusMeta}>
          {activeWorktree()?.type === 'branch' ? 'Local' : 'Worktree'}
          <Show when={activeWorktree()?.base_branch}>
            {' · from '}
            <span style={{ color: vars.color.accent }}>{activeWorktree()!.base_branch}</span>
          </Show>
          {' · '}
          <span>{activeWorktree()?.worktree_path ?? '—'}</span>
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
                  {(pr) => <OpenPrCard pr={pr} prStateColor={prStateColor} prAge={prAge} buildCiTooltip={buildCiTooltip} />}
                </For>
              </div>
            </Show>
          </Show>

          {/* Feature branch: single PR or create button */}
          <Show when={!activityLoading() && !isDefaultBranch()}>
            <Show when={isCreatingPr()}>
              <div class={styles.aiCreatingPr}>
                <span class={styles.aiCreatingPrIcon}>⚡</span>
                <span class={styles.aiCreatingPrText}>Claude is preparing your PR</span>
                <span class={styles.aiCreatingPrDots} />
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
                  const failedRuns = () => runs().filter((r) => r.conclusion === 'failure');
                  const [expanded, setExpanded] = createSignal(false);

                  return (
                    <>
                      <Show when={failedRuns().length > 0}>
                        <div class={styles.ciFailureSection}>
                          <button
                            type="button"
                            class={styles.ciFailureToggle}
                            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded()); }}
                          >
                            <ChevronRight size={12}
                              class={`${styles.ciFailureChevron} ${expanded() ? styles.ciFailureChevronOpen : ''}`}
                            />
                            <XCircle size={11} style={{ color: vars.color.danger }} />
                            {failedRuns().length} failed check{failedRuns().length > 1 ? 's' : ''}
                          </button>

                          <Show when={expanded()}>
                            <For each={failedRuns()}>
                              {(run) => <FailedCheckItem run={run} />}
                            </For>
                          </Show>
                        </div>
                      </Show>
                    </>
                  );
                }}
              </Show>
            </Show>

            <Show when={!isCreatingPr() && (!prStatus() || prStatus()?.state === 'MERGED' || prStatus()?.state === 'CLOSED')}>
              <Show when={!prStatus()}>
                <span class={styles.activityEmpty}>No pull request for this branch</span>
              </Show>
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
                {prStatus()?.state === 'MERGED' || prStatus()?.state === 'CLOSED' ? 'Create New PR with Claude' : 'Create PR with Claude'}
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

function OpenPrCard(props: {
  pr: PrStatusType;
  prStateColor: (pr: PrStatusType) => string;
  prAge: (iso: string) => string;
  buildCiTooltip: (runs: CiRun[]) => any;
}) {
  const { pr } = props;
  const [expanded, setExpanded] = createSignal(false);
  const [failedRuns, setFailedRuns] = createSignal<CiRun[]>([]);
  const [loadingRuns, setLoadingRuns] = createSignal(false);

  async function toggleExpand(e: MouseEvent) {
    e.stopPropagation();
    if (expanded()) {
      setExpanded(false);
      return;
    }
    if (failedRuns().length === 0 && !loadingRuns()) {
      setLoadingRuns(true);
      const wtId = activeWorktreeId();
      if (wtId) {
        const runs = await getCiRunsForBranch(wtId, pr.head_ref_name);
        setFailedRuns(runs.filter((r) => r.conclusion === 'failure'));
      }
      setLoadingRuns(false);
    }
    setExpanded(true);
  }

  return (
    <div class={styles.prCardCompact}>
      <div class={styles.prCardRow} onClick={() => openURL(pr.url)}>
        <span class={styles.prStateDotSmall} style={{ background: props.prStateColor(pr) }} />
        <Show when={pr.checks_total > 0}>
          <Tip content={
            <div class={styles.ciTooltipList}>
              <span class={styles.ciTooltipHeader}>CI/CD Checks</span>
              <Show when={pr.checks_passed > 0}>
                <div class={styles.ciTooltipRow}>
                  <CheckCircle size={10} style={{ color: vars.color.success, 'flex-shrink': '0' }} />
                  <span class={styles.ciTooltipName}>{pr.checks_passed} passed</span>
                </div>
              </Show>
              <Show when={pr.checks_failed > 0}>
                <div class={styles.ciTooltipRow}>
                  <XCircle size={10} style={{ color: vars.color.danger, 'flex-shrink': '0' }} />
                  <span class={styles.ciTooltipName}>{pr.checks_failed} failed</span>
                </div>
              </Show>
              <Show when={pr.checks_pending > 0}>
                <div class={styles.ciTooltipRow}>
                  <LoaderCircle size={10} style={{ color: vars.color.warning, 'flex-shrink': '0', animation: 'spin 1s linear infinite' }} />
                  <span class={styles.ciTooltipName}>{pr.checks_pending} pending</span>
                </div>
              </Show>
              <div class={styles.ciTooltipRow} style={{ 'margin-top': '2px', color: vars.color.textDisabled }}>
                <span style={{ 'font-size': '0.55rem' }}>{pr.checks_total} total checks</span>
              </div>
            </div>
          }>
            <span class={styles.prCiIcon}>
              {pr.checks_failed > 0
                ? <XCircle size={10} style={{ color: vars.color.danger }} />
                : pr.checks_pending > 0
                ? <LoaderCircle size={10} style={{ color: vars.color.warning, animation: 'spin 1s linear infinite' }} />
                : <CheckCircle size={10} style={{ color: vars.color.success }} />
              }
            </span>
          </Tip>
        </Show>
        <span class={styles.prCardTitle}>{pr.title}</span>
        <span class={styles.prCardNumber}>#{pr.number}</span>
        <ExternalLink size={10} style={{ color: vars.color.textDisabled, 'flex-shrink': '0' }} />
      </div>
      <div class={styles.prCardRow} onClick={() => openURL(pr.url)}>
        <span class={styles.prCardBranch}>{pr.head_ref_name}</span>
        <span class={styles.prCardMeta}>{pr.author} · {props.prAge(pr.created_at)}</span>
      </div>

      <Show when={pr.checks_failed > 0}>
        <div class={styles.ciFailureSection}>
          <button
            type="button"
            class={styles.ciFailureToggle}
            onClick={toggleExpand}
          >
            <ChevronRight size={12}
              class={`${styles.ciFailureChevron} ${expanded() ? styles.ciFailureChevronOpen : ''}`}
            />
            <XCircle size={11} style={{ color: vars.color.danger }} />
            {pr.checks_failed} failed check{pr.checks_failed > 1 ? 's' : ''}
            <Show when={loadingRuns()}>
              <LoaderCircle size={10} style={{ color: vars.color.textDisabled, animation: 'spin 1s linear infinite', 'margin-left': 'auto' }} />
            </Show>
          </button>

          <Show when={expanded() && failedRuns().length > 0}>
            <For each={failedRuns()}>
              {(run) => <FailedCheckItem run={run} />}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function FailedCheckItem(props: { run: CiRun }) {
  const [failedSteps, setFailedSteps] = createSignal<FailedStep[]>([]);
  const [loaded, setLoaded] = createSignal(false);

  const loadDetails = async () => {
    if (loaded()) return;
    const wtId = activeWorktreeId();
    if (!wtId || !props.run.url) return;
    const steps = await getFailedSteps(wtId, props.run.url);
    setFailedSteps(steps);
    setLoaded(true);
  };

  loadDetails();

  return (
    <div class={styles.ciFailureItem}>
      <div
        class={styles.ciFailureItemHeader}
        style={{ cursor: props.run.url ? 'pointer' : 'default' }}
        onClick={(e) => { e.stopPropagation(); if (props.run.url) openURL(props.run.url); }}
      >
        <XCircle size={10} style={{ color: vars.color.danger, 'flex-shrink': '0' }} />
        <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
          {props.run.name}
        </span>
        <Show when={props.run.workflow}>
          <span style={{ color: vars.color.textDisabled, 'font-size': '0.55rem' }}>{props.run.workflow}</span>
        </Show>
        <Show when={props.run.url}>
          <ExternalLink size={9} style={{ color: vars.color.textDisabled, 'flex-shrink': '0' }} />
        </Show>
      </div>

      <Show when={props.run.description}>
        <div class={styles.ciDescription}>{props.run.description}</div>
      </Show>

      <Show when={failedSteps().length > 0}>
        <div class={styles.ciAnnotation}>
          <For each={failedSteps()}>
            {(step) => (
              <>
                <div class={styles.ciTooltipRow}>
                  <XCircle size={8} style={{ color: vars.color.danger, 'flex-shrink': '0' }} />
                  <span style={{ 'font-size': '0.6rem', color: vars.color.textPrimary }}>Step {step.number}: {step.name}</span>
                </div>
                <Show when={step.errors?.length > 0}>
                  <For each={step.errors}>
                    {(err) => (
                      <div class={styles.ciAnnotationMessage}>{err}</div>
                    )}
                  </For>
                </Show>
              </>
            )}
          </For>
        </div>
      </Show>

      <Show when={loaded() && failedSteps().length === 0 && !props.run.description}>
        <div class={styles.ciDescription}>Failed — open in GitHub for details</div>
      </Show>
    </div>
  );
}
