// PhantomOS v2 — Session Analytics panel with cost chart and provider breakdown
// Author: Subash Karki

import { createSignal, createMemo, onMount, Show, For } from 'solid-js';
import { getDailyStatsRange, getRecentSessions } from '@/core/bindings/journal';
import { formatCost } from '@/core/signals/journal';
import { BarChart } from '@/shared/BarChart/BarChart';
import * as styles from './AnalyticsPanel.css';

import type { JSX } from 'solid-js';
import type { DailyStats, JournalEntry } from '@/core/types';

// Provider color map (provider-specific, not theme tokens)
const PROVIDER_COLORS: Record<string, string> = {
  claude: '#a855f7',
  codex: '#22c55e',
  gemini: '#3b82f6',
};

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
};

const formatAvgDuration = (totalSecs: number, sessionCount: number): string => {
  if (sessionCount === 0 || totalSecs <= 0) return '0m';
  const avgSecs = Math.abs(totalSecs) / sessionCount;
  const mins = Math.max(0, Math.round(avgSecs / 60));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
};

interface ProviderBreakdown {
  provider: string;
  count: number;
  percentage: number;
  color: string;
}

export function AnalyticsPanel(): JSX.Element {
  const [dailyStats, setDailyStats] = createSignal<DailyStats[]>([]);
  const [sessions, setSessions] = createSignal<JournalEntry[]>([]);
  const [loaded, setLoaded] = createSignal(false);

  onMount(async () => {
    const today = new Date().toISOString().split('T')[0]!;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split('T')[0]!;

    const [stats, recent] = await Promise.all([
      getDailyStatsRange(sevenDaysAgo, today),
      getRecentSessions(50),
    ]);

    setDailyStats(stats);
    setSessions(recent);
    setLoaded(true);
  });

  // ── Summary stats ───────────────────────────────────────────────────────

  const totalCost = createMemo(() =>
    dailyStats().reduce((sum, d) => sum + d.total_cost_micros, 0),
  );

  const totalSessions = createMemo(() =>
    dailyStats().reduce((sum, d) => sum + d.session_count, 0),
  );

  const avgDuration = createMemo(() => {
    const totalSecs = dailyStats().reduce(
      (sum, d) => sum + d.total_duration_secs,
      0,
    );
    return formatAvgDuration(totalSecs, totalSessions());
  });

  const totalTokens = createMemo(() => {
    const sum = dailyStats().reduce(
      (acc, d) => acc + d.total_input_tokens + d.total_output_tokens,
      0,
    );
    return formatTokens(sum);
  });

  // ── Daily cost chart data ─────────────────────────────────────────────

  const chartData = createMemo(() => {
    // Build a map of date -> cost for the last 7 days
    const costByDate = new Map<string, number>();
    for (const s of dailyStats()) {
      costByDate.set(s.date, (costByDate.get(s.date) ?? 0) + s.total_cost_micros);
    }

    // Generate 7-day series with day abbreviations
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0]!;
      const dayName = DAY_ABBREVS[d.getDay()]!;
      result.push({
        label: dayName,
        value: costByDate.get(dateStr) ?? 0,
      });
    }
    return result;
  });

  // ── Provider breakdown ────────────────────────────────────────────────

  const providerBreakdown = createMemo((): ProviderBreakdown[] => {
    const counts = new Map<string, number>();
    for (const s of sessions()) {
      const p = (s.provider ?? 'unknown').toLowerCase();
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }

    const total = sessions().length;
    if (total === 0) return [];

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([provider, count]) => ({
        provider,
        count,
        percentage: (count / total) * 100,
        color: PROVIDER_COLORS[provider] ?? '#6b7280',
      }));
  });

  const hasData = createMemo(() => dailyStats().length > 0 || sessions().length > 0);

  return (
    <div class={styles.panelContainer}>
      <Show
        when={loaded() && hasData()}
        fallback={
          <Show when={loaded()}>
            <div class={styles.emptyState}>No sessions recorded</div>
          </Show>
        }
      >
        {/* Summary stats */}
        <div class={styles.statsRow}>
          <div class={styles.statCard}>
            <span class={styles.statValue}>{formatCost(totalCost())}</span>
            <span class={styles.statLabel}>Total Cost</span>
          </div>
          <div class={styles.statCard}>
            <span class={styles.statValue}>{totalSessions()}</span>
            <span class={styles.statLabel}>Sessions</span>
          </div>
          <div class={styles.statCard}>
            <span class={styles.statValue}>{avgDuration()}</span>
            <span class={styles.statLabel}>Avg Duration</span>
          </div>
          <div class={styles.statCard}>
            <span class={styles.statValue}>{totalTokens()}</span>
            <span class={styles.statLabel}>Tokens</span>
          </div>
        </div>

        {/* Daily cost chart */}
        <div class={styles.chartSection}>
          <span class={styles.sectionTitle}>Daily Cost (7d)</span>
          <BarChart
            data={chartData()}
            height={120}
            formatValue={(v) => formatCost(v)}
            emptyMessage="No cost data for this period"
          />
        </div>

        {/* Provider breakdown */}
        <Show when={providerBreakdown().length > 0}>
          <div class={styles.providerSection}>
            <span class={styles.sectionTitle}>Provider Breakdown</span>

            {/* Horizontal distribution bar */}
            <div class={styles.providerBar}>
              <For each={providerBreakdown()}>
                {(entry) => (
                  <div
                    class={styles.providerSegment}
                    style={{
                      width: `${entry.percentage}%`,
                      'background-color': entry.color,
                    }}
                  />
                )}
              </For>
            </div>

            {/* Legend */}
            <div class={styles.providerLegend}>
              <For each={providerBreakdown()}>
                {(entry) => (
                  <div class={styles.legendItem}>
                    <div
                      class={styles.legendDot}
                      style={{ 'background-color': entry.color }}
                    />
                    <span class={styles.legendLabel}>{entry.provider}</span>
                    <span class={styles.legendCount}>
                      {entry.count} ({Math.round(entry.percentage)}%)
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
