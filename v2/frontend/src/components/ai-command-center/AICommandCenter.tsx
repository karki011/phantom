// PhantomOS v2 — AI Command Center modal
// Consolidates AI Insight, Evolution, and Settings into a single tabbed modal.
//
// Author: Subash Karki

import { createSignal, createEffect, on, onCleanup, Show, For, Switch, Match, lazy } from 'solid-js';
import { Brain, TrendingUp, Settings, Activity, RefreshCw } from 'lucide-solid';
import { PhantomModal } from '@/shared/PhantomModal/PhantomModal';
import {
  aiCommandCenterOpen,
  aiCommandCenterTab,
  setAiCommandCenterTab,
  closeAICommandCenter,
  type AICommandCenterTab,
} from '@/core/signals/ai-command-center';
import { activeWorktreeId } from '@/core/signals/app';
import { getAIInsight, getEvolution } from '@/core/bindings';
import type { AIInsightData, EvolutionData, GapAlert } from '@/core/bindings';
import { onWailsEvent } from '@/core/events';
import { vars } from '@/styles/theme.css';
import * as styles from './ai-command-center.css';

const AIInsightPanel = lazy(() => import('@/components/ai-insight/AIInsightPanel'));
const EvolutionPanel = lazy(() => import('@/components/ai-insight/EvolutionPanel'));
const AIEngineSection = lazy(() => import('@/shared/SettingsDialog/sections/AIEngineSection'));

// ── Tab Configuration ──────────────────────────────────────────────────

const tabs: { id: AICommandCenterTab; label: string; icon: typeof Brain }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'insight', label: 'AI Insight', icon: Brain },
  { id: 'evolution', label: 'Evolution', icon: TrendingUp },
  { id: 'settings', label: 'Settings', icon: Settings },
];

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

// ── Health Gauge SVG ───────────────────────────────────────────────────

function HealthGauge(props: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = () => circumference - (props.score / 100) * circumference;
  const color = () => healthColor(props.score);

  return (
    <svg width="68" height="68" viewBox="0 0 68 68">
      <circle
        cx="34" cy="34" r={radius}
        fill="none"
        stroke={vars.color.bgSecondary}
        stroke-width="5"
      />
      <circle
        cx="34" cy="34" r={radius}
        fill="none"
        stroke={color()}
        stroke-width="5"
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={offset()}
        transform="rotate(-90 34 34)"
        style={{ transition: `stroke-dashoffset ${vars.animation.normal} ease` }}
      />
      <text
        x="34" y="34"
        text-anchor="middle"
        dominant-baseline="central"
        fill={color()}
        font-size="14"
        font-weight="700"
        font-family={vars.font.mono}
      >
        {Math.round(props.score)}
      </text>
    </svg>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────

function OverviewTab() {
  const [insight, setInsight] = createSignal<AIInsightData | null>(null);
  const [evolution, setEvolution] = createSignal<EvolutionData | null>(null);
  const [refreshing, setRefreshing] = createSignal(false);

  const fetchAll = async () => {
    const [insightData, evoData] = await Promise.all([getAIInsight(), getEvolution()]);
    if (insightData) setInsight(insightData);
    if (evoData) setEvolution(evoData);
  };

  createEffect(on(activeWorktreeId, () => { fetchAll(); }));

  onWailsEvent('ai:context_updated', () => fetchAll());
  onWailsEvent('ai:decision_recorded', () => fetchAll());
  onWailsEvent('ai:compaction_complete', () => fetchAll());

  const interval = setInterval(fetchAll, 30_000);
  onCleanup(() => clearInterval(interval));

  const handleRefresh = async () => {
    if (refreshing()) return;
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const healthScore = () => Math.round((evolution()?.health_score ?? 0) * 100);

  return (
    <Show when={insight() || evolution()} fallback={
      <div class={styles.emptyState}>Connecting to AI engine...</div>
    }>
      <div class={styles.overviewGrid}>
        {/* Health & Strategy Card */}
        <div class={styles.overviewCard}>
          <div class={styles.overviewCardHeader}>
            <span class={styles.overviewCardIcon}><Brain size={14} /></span>
            <span class={styles.overviewCardTitle}>Engine Health</span>
            <button
              type="button"
              style={{
                'margin-left': 'auto',
                background: 'none',
                border: 'none',
                color: vars.color.textDisabled,
                cursor: 'pointer',
                padding: vars.space.xs,
                display: 'flex',
                'align-items': 'center',
              }}
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw
                size={12}
                style={refreshing() ? { animation: 'spin 1s linear infinite' } : {}}
              />
            </button>
          </div>

          <div class={styles.overviewStatRow}>
            <HealthGauge score={healthScore()} />
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: vars.space.sm, flex: '1' }}>
              <Show when={insight()?.strategy}>
                <div style={{
                  display: 'inline-flex',
                  'align-items': 'center',
                  gap: vars.space.xs,
                  padding: `2px ${vars.space.sm}`,
                  'border-radius': vars.radius.full,
                  'font-size': vars.fontSize.xs,
                  'font-weight': '600',
                  'font-family': vars.font.mono,
                  background: vars.color.accentMuted,
                  color: vars.color.accent,
                  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
                  'align-self': 'flex-start',
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    'border-radius': vars.radius.full,
                    background: vars.color.accent,
                    'box-shadow': `0 0 6px ${vars.color.accent}`,
                  }} />
                  {insight()!.strategy.name}
                </div>
              </Show>
              <div style={{ display: 'flex', gap: vars.space.md }}>
                <div class={styles.overviewStat}>
                  <span class={styles.overviewStatValue}>
                    {evolution()?.active_patterns ?? '--'}
                  </span>
                  <span class={styles.overviewStatLabel}>Active Patterns</span>
                </div>
                <div class={styles.overviewStat}>
                  <span class={styles.overviewStatValue}>
                    {evolution() ? pct(evolution()!.avg_success_rate) : '--'}
                  </span>
                  <span class={styles.overviewStatLabel}>Avg Success</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coverage Card */}
        <div class={styles.overviewCard}>
          <div class={styles.overviewCardHeader}>
            <span class={styles.overviewCardIcon}><Activity size={14} /></span>
            <span class={styles.overviewCardTitle}>Context Coverage</span>
          </div>
          <Show when={insight()} fallback={
            <div class={styles.emptyState}>No data</div>
          }>
            {(data) => (
              <div class={styles.overviewStatRow}>
                <div class={styles.overviewStat}>
                  <span class={styles.overviewStatValue}>
                    {data().context.files_indexed.toLocaleString()}
                  </span>
                  <span class={styles.overviewStatLabel}>Files Indexed</span>
                </div>
                <div class={styles.overviewStat}>
                  <span class={styles.overviewStatValue}>
                    {data().context.symbols_indexed.toLocaleString()}
                  </span>
                  <span class={styles.overviewStatLabel}>Symbols</span>
                </div>
                <div class={styles.overviewStat}>
                  <span class={styles.overviewStatValue} style={{ color: vars.color.accent }}>
                    {Math.round(data().context.coverage_percent)}%
                  </span>
                  <span class={styles.overviewStatLabel}>Coverage</span>
                </div>
              </div>
            )}
          </Show>

          <Show when={insight()}>
            {(data) => (
              <div style={{ display: 'flex', gap: vars.space.sm }}>
                <div style={{
                  flex: '1',
                  display: 'flex',
                  'flex-direction': 'column',
                  'align-items': 'center',
                  gap: '2px',
                  padding: `${vars.space.sm} ${vars.space.xs}`,
                  background: vars.color.bgSecondary,
                  'border-radius': vars.radius.md,
                  border: `1px solid ${vars.color.border}`,
                }}>
                  <span style={{
                    'font-size': vars.fontSize.md,
                    'font-weight': '700',
                    'font-family': vars.font.mono,
                    color: vars.color.textPrimary,
                  }}>{data().knowledge.decisions_recorded}</span>
                  <span style={{ 'font-size': vars.fontSize.xs, color: vars.color.textDisabled }}>Decisions</span>
                </div>
                <div style={{
                  flex: '1',
                  display: 'flex',
                  'flex-direction': 'column',
                  'align-items': 'center',
                  gap: '2px',
                  padding: `${vars.space.sm} ${vars.space.xs}`,
                  background: vars.color.bgSecondary,
                  'border-radius': vars.radius.md,
                  border: `1px solid ${vars.color.border}`,
                }}>
                  <span style={{
                    'font-size': vars.fontSize.md,
                    'font-weight': '700',
                    'font-family': vars.font.mono,
                    color: vars.color.textPrimary,
                  }}>{data().knowledge.patterns_discovered}</span>
                  <span style={{ 'font-size': vars.fontSize.xs, color: vars.color.textDisabled }}>Patterns</span>
                </div>
                <div style={{
                  flex: '1',
                  display: 'flex',
                  'flex-direction': 'column',
                  'align-items': 'center',
                  gap: '2px',
                  padding: `${vars.space.sm} ${vars.space.xs}`,
                  background: vars.color.bgSecondary,
                  'border-radius': vars.radius.md,
                  border: `1px solid ${vars.color.border}`,
                }}>
                  <span style={{
                    'font-size': vars.fontSize.md,
                    'font-weight': '700',
                    'font-family': vars.font.mono,
                    color: vars.color.textPrimary,
                  }}>
                    {data().knowledge.success_rate > 0
                      ? `${Math.round(data().knowledge.success_rate)}%`
                      : '--'}
                  </span>
                  <span style={{ 'font-size': vars.fontSize.xs, color: vars.color.textDisabled }}>Success Rate</span>
                </div>
              </div>
            )}
          </Show>
        </div>

        {/* Gap Alerts Card (spans full width) */}
        <Show when={(evolution()?.gaps?.length ?? 0) > 0}>
          <div class={styles.overviewCard} style={{ 'grid-column': '1 / -1' }}>
            <div class={styles.overviewCardHeader}>
              <span class={styles.overviewCardIcon}><TrendingUp size={14} /></span>
              <span class={styles.overviewCardTitle}>Strategy Gaps</span>
            </div>
            <div class={styles.gapAlertList}>
              <For each={evolution()!.gaps}>
                {(gap: GapAlert) => (
                  <div class={styles.gapAlertItem}>
                    <span
                      class={styles.gapAlertDot}
                      style={{ background: severityColor(gap.severity) }}
                    />
                    <span class={styles.gapAlertLabel} title={gap.label}>
                      {gap.label}
                    </span>
                    <span
                      class={styles.gapAlertRate}
                      style={{ color: severityColor(gap.severity) }}
                    >
                      {pct(gap.success_rate)}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function AICommandCenter() {
  const handleOpenChange = (open: boolean) => {
    if (!open) closeAICommandCenter();
  };

  return (
    <PhantomModal
      open={aiCommandCenterOpen}
      onOpenChange={handleOpenChange}
      title="AI Command Center"
      description="Engine intelligence, learning trajectory, and configuration"
      size="2xl"
    >
      <div class={styles.layout}>
        {/* Tab Bar */}
        <div class={styles.tabBar}>
          <For each={tabs}>
            {(t) => (
              <button
                type="button"
                class={`${styles.tab} ${aiCommandCenterTab() === t.id ? styles.tabActive : ''}`}
                onClick={() => setAiCommandCenterTab(t.id)}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            )}
          </For>
        </div>

        {/* Tab Content */}
        <div class={styles.tabContent}>
          <Switch>
            <Match when={aiCommandCenterTab() === 'overview'}>
              <OverviewTab />
            </Match>
            <Match when={aiCommandCenterTab() === 'insight'}>
              <AIInsightPanel />
            </Match>
            <Match when={aiCommandCenterTab() === 'evolution'}>
              <EvolutionPanel />
            </Match>
            <Match when={aiCommandCenterTab() === 'settings'}>
              <AIEngineSection />
            </Match>
          </Switch>
        </div>
      </div>
    </PhantomModal>
  );
}
