// Phantom — AI Evolution Panel
// Shows the AI engine's learning trajectory: knowledge health, gap alerts,
// pattern stats, and strategy success-rate trends.
//
// Author: Subash Karki

import { createSignal, createEffect, on, onCleanup, Show, For } from 'solid-js';
import { TrendingUp, RefreshCw } from 'lucide-solid';
import { activeWorktreeId } from '@/core/signals/app';
import { getEvolution } from '@/core/bindings';
import type { EvolutionData, GapAlert, StrategyTrend } from '@/core/bindings';
import { onWailsEvent } from '@/core/events';
import { vars } from '@/styles/theme.css';
import * as styles from './EvolutionPanel.css';

// ── Helpers ─────────────────────────────────────────────────────────────

const healthColor = (score: number): string => {
  if (score >= 70) return vars.color.success;
  if (score >= 40) return vars.color.warning;
  return vars.color.danger;
};

const severityColor = (severity: GapAlert['severity']): string => {
  switch (severity) {
    case 'critical': return vars.color.danger;
    case 'warning': return vars.color.warning;
    case 'info': return vars.color.textDisabled;
  }
};

const pct = (rate: number): string => `${Math.round(rate * 100)}%`;

// ── Health Ring SVG ─────────────────────────────────────────────────────

function HealthRing(props: { score: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = () => circumference - (props.score / 100) * circumference;
  const color = () => healthColor(props.score);

  return (
    <svg class={styles.healthRing} viewBox="0 0 52 52">
      <circle
        cx="26" cy="26" r={radius}
        fill="none"
        stroke={vars.color.bgSecondary}
        stroke-width="4"
      />
      <circle
        cx="26" cy="26" r={radius}
        fill="none"
        stroke={color()}
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={offset()}
        transform="rotate(-90 26 26)"
        style={{ transition: `stroke-dashoffset ${vars.animation.normal} ease` }}
      />
      <text
        x="26" y="26"
        text-anchor="middle"
        dominant-baseline="central"
        fill={color()}
        font-size="12"
        font-weight="700"
        font-family={vars.font.mono}
      >
        {Math.round(props.score)}
      </text>
    </svg>
  );
}

// ── Mini Sparkline ──────────────────────────────────────────────────────

function Sparkline(props: { data: number[]; color: string }) {
  const points = () => {
    const d = props.data;
    if (!d.length) return '';
    const maxY = 20;
    const step = d.length > 1 ? 100 / (d.length - 1) : 50;
    return d.map((v, i) => `${i * step},${maxY - v * maxY}`).join(' ');
  };

  return (
    <svg class={styles.sparklineSvg} viewBox="0 0 100 20" preserveAspectRatio="none">
      <polyline
        points={points()}
        fill="none"
        stroke={props.color}
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────

export function EvolutionPanel() {
  const [data, setData] = createSignal<EvolutionData | null>(null);
  const [refreshing, setRefreshing] = createSignal(false);

  const fetchData = async () => {
    const result = await getEvolution();
    if (result) setData(result);
  };

  // Initial fetch + re-fetch when worktree changes.
  createEffect(on(activeWorktreeId, () => {
    fetchData();
  }));

  // Poll every 60 seconds (less frequent than insight panel).
  const interval = setInterval(fetchData, 60_000);
  onCleanup(() => clearInterval(interval));

  // Refresh on compaction or pattern changes.
  onWailsEvent('ai:compaction_complete', () => fetchData());
  onWailsEvent('ai:decision_recorded', () => fetchData());

  const handleRefresh = async () => {
    if (refreshing()) return;
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const scoreAsPercent = () => Math.round((data()?.health_score ?? 0) * 100);

  return (
    <div class={styles.panel}>
      {/* Header */}
      <div class={styles.panelHeader}>
        <span class={styles.panelIcon}>
          <TrendingUp size={14} />
        </span>
        <span class={styles.panelTitle}>AI Evolution</span>
        <button
          type="button"
          class={styles.refreshButton}
          onClick={handleRefresh}
          title="Refresh evolution data"
        >
          <RefreshCw
            size={12}
            style={refreshing() ? { animation: 'spin 1s linear infinite' } : {}}
          />
        </button>
      </div>

      <Show when={data()} fallback={
        <div class={styles.emptyState}>No evolution data yet</div>
      }>
        {(evo) => (
          <>
            {/* Knowledge Health Score */}
            <div class={styles.healthRow}>
              <HealthRing score={scoreAsPercent()} />
              <div class={styles.healthStats}>
                <div class={styles.healthStatRow}>
                  <span class={styles.healthStatLabel}>Health</span>
                  <span
                    class={styles.healthStatValue}
                    style={{ color: healthColor(scoreAsPercent()) }}
                  >
                    {scoreAsPercent()}%
                  </span>
                </div>
                <div class={styles.healthStatRow}>
                  <span class={styles.healthStatLabel}>Avg success</span>
                  <span class={styles.healthStatValue}>
                    {pct(evo().avg_success_rate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Pattern Stats */}
            <div class={styles.patternRow}>
              <div class={styles.patternStat}>
                <span class={styles.patternValue} style={{ color: vars.color.success }}>
                  {evo().active_patterns}
                </span>
                <span class={styles.patternLabel}>Active</span>
              </div>
              <div class={styles.patternStat}>
                <span class={styles.patternValue} style={{ color: vars.color.textDisabled }}>
                  {evo().deprecated_patterns}
                </span>
                <span class={styles.patternLabel}>Deprecated</span>
              </div>
            </div>

            {/* Gap Alerts */}
            <Show when={(evo().gaps?.length ?? 0) > 0}>
              <div class={styles.divider} />
              <span class={styles.sectionLabel}>Strategy Gaps</span>
              <div class={styles.gapList}>
                <For each={evo().gaps}>
                  {(gap: GapAlert) => (
                    <div class={styles.gapItem}>
                      <span
                        class={styles.gapDot}
                        style={{ background: severityColor(gap.severity) }}
                      />
                      <span class={styles.gapLabel} title={gap.label}>
                        {gap.label}
                      </span>
                      <span
                        class={styles.gapRate}
                        style={{ color: severityColor(gap.severity) }}
                      >
                        {pct(gap.success_rate)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Strategy Trends */}
            <Show when={(evo().trends?.length ?? 0) > 0}>
              <div class={styles.divider} />
              <span class={styles.sectionLabel}>Strategy Trends</span>
              <div class={styles.sparklineRow}>
                <For each={evo().trends}>
                  {(trend: StrategyTrend) => (
                    <div class={styles.sparklineItem}>
                      <span class={styles.sparklineLabel} title={trend.label}>
                        {trend.label}
                      </span>
                      <Sparkline
                        data={trend.history}
                        color={trend.success_rate >= 0.5 ? vars.color.success : vars.color.warning}
                      />
                      <span class={styles.sparklineRate}>
                        {pct(trend.success_rate)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

export default EvolutionPanel;
