// Phantom — Project Dashboard panel with cross-project health overview
// Author: Subash Karki

import { createSignal, createMemo, onMount, Show, For } from 'solid-js';
import { Star } from 'lucide-solid';
import { projects } from '@/core/signals/projects';
import { worktreeMap } from '@/core/signals/worktrees';
import { getDailyStatsRangeByProject } from '@/core/bindings/journal';
import { formatCost } from '@/core/signals/journal';
import * as styles from './ProjectDashboardPanel.css';

import type { JSX } from 'solid-js';
import type { DailyStats } from '@/core/types';

interface ProjectStats {
  totalCostMicros: number;
  sessions: number;
  commits: number;
  prs: number;
}

const FALLBACK_COLOR = '#6b7280';

const aggregateStats = (stats: DailyStats[]): ProjectStats => ({
  totalCostMicros: stats.reduce((sum, d) => sum + d.total_cost_micros, 0),
  sessions: stats.reduce((sum, d) => sum + d.session_count, 0),
  commits: stats.reduce((sum, d) => sum + Math.max(0, d.total_commits), 0),
  prs: stats.reduce((sum, d) => sum + Math.max(0, d.pr_count), 0),
});

const EMPTY_STATS: ProjectStats = {
  totalCostMicros: 0,
  sessions: 0,
  commits: 0,
  prs: 0,
};

const truncateBranch = (branch: string, max = 24): string =>
  branch.length > max ? `${branch.slice(0, max - 1)}...` : branch;

export function ProjectDashboardPanel(): JSX.Element {
  const [statsMap, setStatsMap] = createSignal<Record<string, ProjectStats>>({});
  const [loaded, setLoaded] = createSignal(false);

  onMount(async () => {
    const allProjects = projects();
    if (allProjects.length === 0) {
      setLoaded(true);
      return;
    }

    const today = new Date().toISOString().split('T')[0]!;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split('T')[0]!;

    const results = await Promise.all(
      allProjects.map(async (p) => {
        const stats = await getDailyStatsRangeByProject(sevenDaysAgo, today, p.id);
        return [p.id, aggregateStats(stats)] as const;
      }),
    );

    const map: Record<string, ProjectStats> = {};
    for (const [id, stats] of results) {
      map[id] = stats;
    }
    setStatsMap(map);
    setLoaded(true);
  });

  const sortedProjects = createMemo(() => {
    const all = projects();
    // Starred projects first, then alphabetical
    return [...all].sort((a, b) => {
      const aStarred = a.starred ? 1 : 0;
      const bStarred = b.starred ? 1 : 0;
      if (bStarred !== aStarred) return bStarred - aStarred;
      return a.name.localeCompare(b.name);
    });
  });

  return (
    <div class={styles.panelContainer}>
      <Show
        when={loaded() && sortedProjects().length > 0}
        fallback={
          <Show when={loaded()}>
            <div class={styles.emptyState}>No projects registered</div>
          </Show>
        }
      >
        <For each={sortedProjects()}>
          {(project) => {
            const stats = () => statsMap()[project.id] ?? EMPTY_STATS;
            const worktrees = () => worktreeMap()[project.id] ?? [];

            return (
              <div class={styles.projectCard}>
                {/* Header */}
                <div class={styles.headerRow}>
                  <div
                    class={styles.colorDot}
                    style={{ 'background-color': project.color ?? FALLBACK_COLOR }}
                  />
                  <span class={styles.projectName}>{project.name}</span>
                  <Show when={project.starred}>
                    <Star size={12} class={styles.starIcon} />
                  </Show>
                  <Show when={worktrees().length > 0}>
                    <span class={styles.worktreeBadge}>
                      {worktrees().length} worktree{worktrees().length !== 1 ? 's' : ''}
                    </span>
                  </Show>
                </div>

                {/* Stats */}
                <div class={styles.statsRow}>
                  <div class={styles.statItem}>
                    <span class={styles.statValue}>{formatCost(stats().totalCostMicros)}</span>
                    <span class={styles.statLabel}>7d Cost</span>
                  </div>
                  <div class={styles.statItem}>
                    <span class={styles.statValue}>{stats().sessions}</span>
                    <span class={styles.statLabel}>Sessions</span>
                  </div>
                  <div class={styles.statItem}>
                    <span class={styles.statValue}>{stats().commits}</span>
                    <span class={styles.statLabel}>Commits</span>
                  </div>
                  <div class={styles.statItem}>
                    <span class={styles.statValue}>{stats().prs}</span>
                    <span class={styles.statLabel}>PRs</span>
                  </div>
                </div>

                {/* Worktree pills */}
                <Show when={worktrees().length > 0}>
                  <div class={styles.worktreePills}>
                    <For each={worktrees()}>
                      {(wt) => (
                        <span
                          class={`${styles.worktreePill}${
                            wt.branch === project.default_branch
                              ? ` ${styles.defaultBranchPill}`
                              : ''
                          }`}
                        >
                          {truncateBranch(wt.branch)}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
}
