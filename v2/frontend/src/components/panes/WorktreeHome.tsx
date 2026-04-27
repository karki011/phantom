// PhantomOS v2 — Worktree home pane (Hunter's Terminal)
// Author: Subash Karki

import { createMemo, createSignal, createEffect, on, onCleanup, Show, For, Index } from 'solid-js';
import { GitBranch, GitPullRequest, ArrowUp, ArrowDown, FileEdit, FileQuestion, ExternalLink, CheckCircle, XCircle, LoaderCircle, ChevronRight, RefreshCw, Shield, Activity } from 'lucide-solid';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { projects } from '@/core/signals/projects';
import { addTabWithData } from '@/core/panes/signals';
import { sessions } from '@/core/signals/sessions';
import { cwdMatchesBidirectional } from '@/core/utils/path-match';
import { activeProviderCommand, activeProviderLabel } from '@/core/signals/active-provider';
import { getPref } from '@/core/signals/preferences';
import { prStatus, setPrStatus, isCreatingPr, setIsCreatingPr, ghAvailable, setGhAvailable } from '@/core/signals/activity';
import { SessionControls } from '@/shared/SessionControls/SessionControls';
import { NewWorktreeDialog } from '@/shared/NewWorktreeDialog/NewWorktreeDialog';
import { WardManager } from '@/shared/WardManager/WardManager';
import { getWorkspaceStatus, gitPull, gitPush, getPrStatus, getCiRuns, getCiRunsForBranch, createPrWithAI, listOpenPrs, isGhCliAvailable, getCheckAnnotations, getFailedSteps, getSessionsByProject, getAllRecipes, getFavoriteRecipes, toggleRecipeFavorite } from '@/core/bindings';
import { openURL } from '@/core/bindings/shell';
import { getWards } from '@/core/bindings/wards';
import type { WardRule } from '@/core/bindings/wards';
import { onWailsEvent } from '@/core/events';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { Tip } from '@/shared/Tip/Tip';
import { vars } from '@/styles/theme.css';
import { formatCost, formatDuration } from '@/core/signals/journal';
import { openRecipePicker, recipePickerOpen } from '@/core/signals/recipes';
import type { RepoStatus, PrStatus as PrStatusType, CiRun, CheckAnnotation, FailedStep, JournalEntry, EnrichedRecipe } from '@/core/types';
import * as styles from '@/styles/home.css';


function WardSummaryCard() {
  const [rules, setRules] = createSignal<WardRule[]>([]);
  const [showManager, setShowManager] = createSignal(false);

  async function refresh() {
    setRules(await getWards());
  }

  createEffect(() => { refresh(); });
  onWailsEvent('ward:rules_reloaded', () => { refresh(); });

  const enabledRules = () => rules().filter((r) => r.enabled);
  const blockCount = () => enabledRules().filter((r) => r.level === 'block').length;
  const warnCount = () => enabledRules().filter((r) => r.level === 'warn').length;
  const confirmCount = () => enabledRules().filter((r) => r.level === 'confirm').length;

  return (
    <>
      <div class={styles.wardCard}>
        {/* Header */}
        <div class={styles.wardHeader}>
          <div class={styles.wardHeaderLeft}>
            <span class={styles.wardHeaderIcon}>
              <Shield size={14} />
            </span>
            <span class={styles.wardSectionLabel}>
              Session Guard
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowManager(true)}
            class={styles.wardManageButton}
          >
            Manage Wards
          </button>
        </div>

        {/* Summary */}
        <Show
          when={enabledRules().length > 0}
          fallback={
            <span class={styles.wardFallbackText}>
              No ward rules defined — create rules to protect your sessions
            </span>
          }
        >
          <div class={styles.wardSummaryRow}>
            <span class={styles.wardRuleCount}>
              {enabledRules().length} rule{enabledRules().length !== 1 ? 's' : ''} active
            </span>
            <Show when={blockCount() > 0}>
              <span class={styles.wardBadgeBlock}>
                {blockCount()} block
              </span>
            </Show>
            <Show when={warnCount() > 0}>
              <span class={styles.wardBadgeWarn}>
                {warnCount()} warn
              </span>
            </Show>
            <Show when={confirmCount() > 0}>
              <span class={styles.wardBadgeConfirm}>
                {confirmCount()} confirm
              </span>
            </Show>
          </div>
        </Show>
      </div>

      {/* WardManager drawer overlay */}
      <Show when={showManager()}>
        <div
          class={styles.wardDrawerOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) setShowManager(false); }}
        >
          <div class={styles.wardDrawerBackdrop} />
          <div class={styles.wardDrawerPanel}>
            <div class={styles.wardDrawerHeader}>
              <span class={styles.wardDrawerTitle}>Ward Manager</span>
              <button
                type="button"
                onClick={() => setShowManager(false)}
                class={styles.wardDrawerCloseButton}
              >
                ✕
              </button>
            </div>
            <WardManager />
          </div>
        </div>
      </Show>
    </>
  );
}

function RecentSessions(props: { repoPath: string | null }) {
  const [recentSessions, setRecentSessions] = createSignal<JournalEntry[]>([]);

  createEffect(on(() => props.repoPath, (repo) => {
    if (!repo) { setRecentSessions([]); return; }
    let cancelled = false;
    getSessionsByProject(repo, 5).then((sessions) => {
      if (!cancelled) setRecentSessions(sessions);
    });
    onCleanup(() => { cancelled = true; });
  }));

  const timeAgo = (epochSecs: number | null): string => {
    if (!epochSecs) return '';
    const diffMins = Math.round((Date.now() / 1000 - epochSecs) / 60);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const hrs = Math.floor(diffMins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const statusColor = (status: string | null): string => {
    const st = (status ?? '').toLowerCase();
    if (st === 'active' || st === 'running') return vars.color.warning;
    if (st === 'interrupted' || st === 'error') return vars.color.danger;
    return vars.color.success;
  };

  const statusLabel = (status: string | null): string => {
    const st = (status ?? '').toLowerCase();
    if (st === 'completed' || st === 'done') return 'Done';
    if (st === 'active' || st === 'running') return 'Active';
    if (st === 'interrupted') return 'Interrupted';
    if (st === 'error') return 'Error';
    return st || 'Done';
  };

  const providerColor = (prov: string): string => {
    switch (prov) {
      case 'claude': return '#a855f7';
      case 'codex': return '#22c55e';
      case 'gemini': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const providerLabel = (prov: string): string => {
    switch (prov) {
      case 'claude': return 'Claude';
      case 'codex': return 'Codex';
      case 'gemini': return 'Gemini';
      default: return prov;
    }
  };

  return (
    <Show when={recentSessions().length > 0}>
      <div>
        <div class={styles.recentSectionLabel}>
          Recent Sessions
        </div>
        <div class={styles.recentSessionList}>
          <For each={recentSessions()}>
            {(session) => {
              const prompt = () => {
                const fp = session.first_prompt;
                if (!fp) return '';
                return fp.length > 50 ? fp.slice(0, 47) + '...' : fp;
              };
              return (
                <div class={styles.sessionRow}>
                  <Show when={session.provider && session.provider !== 'claude'}>
                    <span
                      title={providerLabel(session.provider)}
                      class={styles.providerBadge}
                      style={{ '--provider-color': providerColor(session.provider) }}
                    >
                      <span class={styles.providerDot} style={{ '--provider-color': providerColor(session.provider) }} />
                      {providerLabel(session.provider)}
                    </span>
                  </Show>
                  <span class={styles.sessionTimeAgo}>
                    {timeAgo(session.started_at)}
                  </span>
                  <span class={styles.sessionSeparatorDot}>&middot;</span>
                  <span class={styles.sessionDuration}>
                    {formatDuration(session.started_at, session.ended_at)}
                  </span>
                  <span class={styles.sessionSeparatorDot}>&middot;</span>
                  <Show when={prompt()}>
                    <span class={styles.sessionPrompt}>
                      "{prompt()}"
                    </span>
                  </Show>
                  <span class={styles.sessionCost}>
                    {formatCost(session.estimated_cost_micros)}
                  </span>
                  <span
                    class={styles.sessionStatusBadge}
                    style={{ '--status-color': statusColor(session.status) }}
                  >
                    <span class={styles.sessionStatusDot} style={{ '--status-color': statusColor(session.status) }} />
                    {statusLabel(session.status)}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
}

function RecipesCard(props: { projectId: string | null; repoPath: string | null }) {
  const [allRecipes, setAllRecipes] = createSignal<EnrichedRecipe[]>([]);
  const [activeTab, setActiveTab] = createSignal<'all' | 'favorites'>('favorites');

  const loadRecipes = () => {
    const projId = props.projectId;
    if (!projId) { setAllRecipes([]); return; }
    getAllRecipes(projId).then(setAllRecipes);
  };

  createEffect(on(() => props.projectId, loadRecipes));
  createEffect(on(recipePickerOpen, (open) => {
    if (!open) loadRecipes();
  }));

  const favoriteRecipes = () => allRecipes().filter((r) => r.favorite);
  const displayedRecipes = () => activeTab() === 'favorites' ? favoriteRecipes() : allRecipes();

  const handleRun = (recipe: EnrichedRecipe) => {
    addTabWithData('terminal', recipe.label, {
      cwd: props.repoPath ?? '',
      command: recipe.command,
    });
  };

  const handleToggleFavorite = async (e: MouseEvent, recipe: EnrichedRecipe) => {
    e.stopPropagation();
    const projId = props.projectId;
    if (!projId) return;
    if (!recipe.favorite && favoriteRecipes().length >= 3) return;
    const newState = await toggleRecipeFavorite(projId, recipe.id);
    setAllRecipes((prev) => prev.map((r) => r.id === recipe.id ? { ...r, favorite: newState } : r));
  };

  return (
    <div class={styles.recipesCard}>
      <div class={styles.recipesCardHeader}>
        <span class={styles.recipesCardTitle}>Recipes</span>
        <Show when={allRecipes().length > 0}>
          <span class={styles.recipesCardCount}>{allRecipes().length}</span>
        </Show>
        <button type="button" class={styles.wardManageButton} onClick={() => openRecipePicker()}>
          + Custom
        </button>
      </div>

      <Show when={allRecipes().length > 0} fallback={
        <div class={styles.pinnedRecipesEmpty}>
          No recipes detected — add a package.json or Makefile
        </div>
      }>
        <div class={styles.recipesTabBar}>
          <button
            type="button"
            class={`${styles.recipesTab} ${activeTab() === 'all' ? styles.recipesTabActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All ({allRecipes().length})
          </button>
          <button
            type="button"
            class={`${styles.recipesTab} ${activeTab() === 'favorites' ? styles.recipesTabActive : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            ★ Favorites ({favoriteRecipes().length})
          </button>
        </div>

        <div class={styles.recipesListScroll}>
          <Show when={displayedRecipes().length > 0} fallback={
            <div class={styles.pinnedRecipesEmpty}>
              {activeTab() === 'favorites'
                ? 'No favorites yet — star recipes to pin them here'
                : 'No recipes found'}
            </div>
          }>
            <For each={displayedRecipes()}>
              {(recipe) => (
                <div class={styles.recipeRow} onClick={() => handleRun(recipe)}>
                  <button
                    type="button"
                    class={styles.recipeStarButton}
                    onClick={(e) => handleToggleFavorite(e, recipe)}
                  >
                    <span style={{ color: recipe.favorite ? vars.color.accent : vars.color.textDisabled }}>
                      {recipe.favorite ? '★' : '☆'}
                    </span>
                  </button>
                  <span class={styles.recipeIcon}>{recipe.icon || '▶'}</span>
                  <span class={styles.recipeLabel}>{recipe.label}</span>
                  <span class={styles.recipeCommand}>{recipe.command}</span>
                  <span class={styles.recipeCategoryBadge}>{recipe.category}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}

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

  const worktreeSessions = createMemo(() => {
    const wt = activeWorktree();
    if (!wt?.worktree_path) return [];
    const wtPath = wt.worktree_path;
    const proj = activeProject();
    const repoPath = proj?.repo_path ?? '';
    return sessions().filter((s) => {
      if (s.status !== 'active' && s.status !== 'paused') return false;
      if (!s.cwd) return false;
      // Match sessions in this worktree path (bidirectional)
      if (cwdMatchesBidirectional(s.cwd, wtPath)) return true;
      // Match sessions started in the repo root (shared across worktrees)
      if (repoPath && cwdMatchesBidirectional(s.cwd, repoPath)) return true;
      return false;
    });
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
      {/* Two-column layout: Quick Actions + Recipes */}
      <div class={styles.homeDashboardGrid}>
        {/* Left: Quick Actions */}
        <div class={styles.quickLaunchGrid}>
          <button
            class={styles.quickLaunchCard}
            type="button"
            onClick={() => addTabWithData('terminal', 'Terminal', { cwd: activeWorktree()?.worktree_path ?? '' })}
          >
            <div class={styles.quickLaunchShimmer} />
            <svg class={styles.quickLaunchIcon} viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="3" y="6" width="26" height="20" rx="3" stroke="currentColor" stroke-width="1.8" />
              <path d="M9 13l4 3-4 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M17 19h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <span class={styles.quickLaunchLabel}>Terminal</span>
            <span class={styles.quickLaunchDesc}>Shell in this worktree</span>
          </button>

          <button
            class={styles.quickLaunchCard}
            type="button"
            onClick={() => {
              if (activeWorktree()?.type === 'branch') {
                setWorktreeOpen(true);
              } else {
                addTabWithData('terminal', activeProviderLabel(), {
                  cwd: activeWorktree()?.worktree_path ?? '',
                  command: activeProviderCommand(),
                });
              }
            }}
          >
            <div class={styles.quickLaunchShimmer} />
            <svg class={styles.quickLaunchIcon} viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M16 4l2.2 5.2L24 10.4l-4 4.2.6 5.4L16 17.6 11.4 20l.6-5.4-4-4.2 5.8-1.2L16 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none" />
              <circle cx="25" cy="24" r="4" stroke="currentColor" stroke-width="1.6" fill="none" />
              <path d="M25 22v4M23 24h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class={styles.quickLaunchLabel}>New Session</span>
            <span class={styles.quickLaunchDesc}>AI-powered workspace</span>
          </button>

          <button class={`${styles.quickLaunchCard} ${styles.quickLaunchCardDisabled}`} type="button">
            <span class={styles.quickLaunchBadge}>Soon</span>
            <svg class={styles.quickLaunchIcon} viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M5 8A3 3 0 018 5h16a3 3 0 013 3v12a3 3 0 01-3 3h-6l-5 4v-4H8a3 3 0 01-3-3V8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
              <path d="M11 11h10M11 16h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
            <span class={styles.quickLaunchLabel}>Chat</span>
            <span class={styles.quickLaunchDesc}>Talk with AI</span>
          </button>
        </div>

        {/* Right: Recipes */}
        <RecipesCard projectId={activeProject()?.id ?? null} repoPath={activeProject()?.repo_path ?? null} />
      </div>

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
                      <span class={`${styles.statusBadge} ${styles.wardBadgeBlock}`}>
                        <XCircle size={11} />{failed()} failed
                      </span>
                    </Tip>
                  </Show>
                  <Show when={failed() === 0 && pending() > 0}>
                    <Tip content={buildCiTooltip(runs())}>
                      <span class={`${styles.statusBadge} ${styles.wardBadgeWarn}`}>
                        <LoaderCircle size={11} style={{ animation: 'spin 1s linear infinite' }} />{pending()} pending
                      </span>
                    </Tip>
                  </Show>
                  <Show when={failed() === 0 && pending() === 0 && passed() > 0}>
                    <Tip content={buildCiTooltip(runs())}>
                      <span class={`${styles.statusBadge} ${styles.wardBadgeConfirm}`}>
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
            <span class={styles.wardHeaderIcon}>{activeWorktree()!.base_branch}</span>
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
                  <ExternalLink size={10} class={styles.iconExternalLink} />
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
                            <XCircle size={11} class={styles.iconDanger} />
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

      {/* Active Sessions — one card, sessions as rows inside */}
      <Show when={worktreeSessions().length > 0}>
        <div class={styles.activeSessionsCard}>
          <div class={styles.activeSessionsHeader}>
            <span class={styles.activityCardIcon}><Activity size={14} /></span>
            <span class={styles.activityCardTitle}>Active Sessions</span>
            <span class={styles.activeSessionsCount}>{worktreeSessions().length}</span>
          </div>
          <div class={styles.activeSessionsScroll}>
            <Index each={worktreeSessions()}>
              {(session) => <SessionControls session={session()} />}
            </Index>
          </div>
        </div>
      </Show>

      {/* Ward Summary — only when wards feature is enabled */}
      <Show when={getPref('wards_enabled') === 'true'}>
        <WardSummaryCard />
      </Show>

      {/* Recent Sessions */}
      <RecentSessions repoPath={activeProject()?.repo_path ?? null} />

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
                  <CheckCircle size={10} class={styles.iconSuccess} />
                  <span class={styles.ciTooltipName}>{pr.checks_passed} passed</span>
                </div>
              </Show>
              <Show when={pr.checks_failed > 0}>
                <div class={styles.ciTooltipRow}>
                  <XCircle size={10} class={styles.iconDanger} />
                  <span class={styles.ciTooltipName}>{pr.checks_failed} failed</span>
                </div>
              </Show>
              <Show when={pr.checks_pending > 0}>
                <div class={styles.ciTooltipRow}>
                  <LoaderCircle size={10} class={styles.iconWarning} style={{ animation: 'spin 1s linear infinite' }} />
                  <span class={styles.ciTooltipName}>{pr.checks_pending} pending</span>
                </div>
              </Show>
              <div class={styles.ciTooltipRowTotal}>
                <span class={styles.ciTotalText}>{pr.checks_total} total checks</span>
              </div>
            </div>
          }>
            <span class={styles.prCiIcon}>
              {pr.checks_failed > 0
                ? <XCircle size={10} class={styles.iconDanger} />
                : pr.checks_pending > 0
                ? <LoaderCircle size={10} class={styles.iconWarning} style={{ animation: 'spin 1s linear infinite' }} />
                : <CheckCircle size={10} class={styles.iconSuccess} />
              }
            </span>
          </Tip>
        </Show>
        <span class={styles.prCardTitle}>{pr.title}</span>
        <span class={styles.prCardNumber}>#{pr.number}</span>
        <ExternalLink size={10} class={styles.iconExternalLink} />
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
            <XCircle size={11} class={styles.iconDanger} />
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
        <XCircle size={10} class={styles.iconDanger} />
        <span class={styles.failureRunName}>
          {props.run.name}
        </span>
        <Show when={props.run.workflow}>
          <span class={styles.failureWorkflow}>{props.run.workflow}</span>
        </Show>
        <Show when={props.run.url}>
          <ExternalLink size={9} class={styles.failureExternalLink} />
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
                  <XCircle size={8} class={styles.iconDanger} />
                  <span class={styles.ciStepText}>Step {step.number}: {step.name}</span>
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
