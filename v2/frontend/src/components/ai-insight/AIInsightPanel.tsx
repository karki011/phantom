// PhantomOS v2 — AI Engine Insight Panel
// Shows real-time AI engine intelligence: strategy, assessment, context
// coverage, knowledge stats, and recent decisions.
//
// Author: Subash Karki

import { createSignal, createEffect, on, onCleanup, Show, For } from 'solid-js';
import { Brain, RefreshCw } from 'lucide-solid';
import { activeWorktreeId } from '@/core/signals/app';
import { getAIInsight } from '@/core/bindings';
import type { AIInsightData, DecisionEntry } from '@/core/bindings';
import { onWailsEvent } from '@/core/events';
import { vars } from '@/styles/theme.css';
import * as styles from './AIInsightPanel.css';

// ── Helpers ─────────────────────────────────────────────────────────────

const complexityColor = (c: string): string => {
  switch (c) {
    case 'simple': return vars.color.success;
    case 'moderate': return vars.color.warning;
    case 'complex': return vars.color.danger;
    case 'critical': return vars.color.danger;
    default: return vars.color.textDisabled;
  }
};

const riskColor = (r: string): string => {
  switch (r) {
    case 'low': return vars.color.success;
    case 'medium': return vars.color.warning;
    case 'high': return vars.color.danger;
    case 'critical': return vars.color.danger;
    default: return vars.color.textDisabled;
  }
};

const outcomeColor = (success: boolean | null): string => {
  if (success === true) return vars.color.success;
  if (success === false) return vars.color.danger;
  return vars.color.textDisabled;
};

const timeAgo = (iso: string): string => {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

const truncateGoal = (goal: string, max = 40): string => {
  if (!goal) return '';
  return goal.length > max ? `${goal.slice(0, max - 3)}...` : goal;
};

// ── Coverage Ring SVG ───────────────────────────────────────────────────

function CoverageRing(props: { percent: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = () => circumference - (props.percent / 100) * circumference;

  return (
    <svg class={styles.coverageRing} viewBox="0 0 44 44">
      <circle
        cx="22" cy="22" r={radius}
        fill="none"
        stroke={vars.color.bgSecondary}
        stroke-width="4"
      />
      <circle
        cx="22" cy="22" r={radius}
        fill="none"
        stroke={vars.color.accent}
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={offset()}
        transform="rotate(-90 22 22)"
        style={{ transition: `stroke-dashoffset ${vars.animation.normal} ease` }}
      />
      <text
        x="22" y="22"
        text-anchor="middle"
        dominant-baseline="central"
        fill={vars.color.textPrimary}
        font-size="10"
        font-weight="700"
        font-family={vars.font.mono}
      >
        {Math.round(props.percent)}%
      </text>
    </svg>
  );
}

// ── Score Bar ───────────────────────────────────────────────────────────

function ScoreBar(props: { label: string; value: number; max: number; color: string }) {
  const pct = () => Math.min((props.value / props.max) * 100, 100);
  return (
    <div class={styles.scoreBarContainer}>
      <div class={styles.scoreBarLabel}>
        <span class={styles.assessmentLabel}>{props.label}</span>
        <span style={{ color: props.color, 'font-size': vars.fontSize.xs, 'font-family': vars.font.mono, 'font-weight': '600' }}>
          {props.value.toFixed(1)}
        </span>
      </div>
      <div class={styles.scoreBarTrack}>
        <div
          class={styles.scoreBarFill}
          style={{ width: `${pct()}%`, background: props.color }}
        />
      </div>
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────

export function AIInsightPanel() {
  const [data, setData] = createSignal<AIInsightData | null>(null);
  const [refreshing, setRefreshing] = createSignal(false);

  const fetchInsight = async () => {
    const result = await getAIInsight();
    if (result) setData(result);
  };

  // Initial fetch + re-fetch when worktree changes.
  createEffect(on(activeWorktreeId, () => {
    fetchInsight();
  }));

  // Poll every 30 seconds for fresh data.
  const interval = setInterval(fetchInsight, 30_000);
  onCleanup(() => clearInterval(interval));

  // Listen for AI-related events from the backend.
  onWailsEvent('ai:context_updated', () => fetchInsight());
  onWailsEvent('ai:decision_recorded', () => fetchInsight());

  const handleRefresh = async () => {
    if (refreshing()) return;
    setRefreshing(true);
    await fetchInsight();
    setRefreshing(false);
  };

  return (
    <div class={styles.panel}>
      {/* Header */}
      <div class={styles.panelHeader}>
        <span class={styles.panelIcon}>
          <Brain size={14} />
        </span>
        <span class={styles.panelTitle}>AI Engine</span>
        <button
          type="button"
          class={styles.refreshButton}
          onClick={handleRefresh}
          title="Refresh AI insight data"
        >
          <RefreshCw
            size={12}
            style={refreshing() ? { animation: 'spin 1s linear infinite' } : {}}
          />
        </button>
      </div>

      <Show when={data()} fallback={
        <div class={styles.emptyState}>Connecting to AI engine...</div>
      }>
        {(insight) => (
          <>
            {/* Strategy Badge */}
            <div class={styles.strategyRow}>
              <span class={styles.strategyLabel}>Strategy</span>
              <span class={styles.strategyBadge}>
                <span class={styles.strategyDot} />
                {insight().strategy.name}
              </span>
            </div>

            {/* Task Assessment */}
            <div class={styles.assessmentGrid}>
              <div class={styles.assessmentItem}>
                <span class={styles.assessmentLabel}>Complexity</span>
                <span
                  class={styles.assessmentValue}
                  style={{ color: complexityColor(insight().assessment.complexity) }}
                >
                  {insight().assessment.complexity}
                </span>
              </div>
              <div class={styles.assessmentItem}>
                <span class={styles.assessmentLabel}>Risk</span>
                <span
                  class={styles.assessmentValue}
                  style={{ color: riskColor(insight().assessment.risk) }}
                >
                  {insight().assessment.risk}
                </span>
              </div>
              <div class={styles.assessmentItem}>
                <span class={styles.assessmentLabel}>Files</span>
                <span class={styles.assessmentValue} style={{ color: vars.color.textPrimary }}>
                  {insight().assessment.file_count}
                </span>
              </div>
            </div>

            {/* Ambiguity Score Bar */}
            <Show when={insight().assessment.ambiguity_score > 0}>
              <ScoreBar
                label="Ambiguity"
                value={insight().assessment.ambiguity_score}
                max={1.5}
                color={insight().assessment.is_ambiguous ? vars.color.warning : vars.color.success}
              />
            </Show>

            <div class={styles.divider} />

            {/* Context Coverage */}
            <div class={styles.contextRow}>
              <div class={styles.contextStat}>
                <span class={styles.contextStatValue}>
                  {insight().context.files_indexed.toLocaleString()}
                </span>
                <span class={styles.contextStatLabel}>Files indexed</span>
              </div>
              <div class={styles.contextStat}>
                <span class={styles.contextStatValue}>
                  {insight().context.symbols_indexed.toLocaleString()}
                </span>
                <span class={styles.contextStatLabel}>Symbols</span>
              </div>
              <CoverageRing percent={insight().context.coverage_percent} />
            </div>

            <div class={styles.divider} />

            {/* Knowledge Stats */}
            <div class={styles.knowledgeRow}>
              <div class={styles.knowledgeStat}>
                <span class={styles.knowledgeValue}>
                  {insight().knowledge.decisions_recorded}
                </span>
                <span class={styles.knowledgeLabel}>Decisions</span>
              </div>
              <div class={styles.knowledgeStat}>
                <span class={styles.knowledgeValue}>
                  {insight().knowledge.patterns_discovered}
                </span>
                <span class={styles.knowledgeLabel}>Patterns</span>
              </div>
              <div class={styles.knowledgeStat}>
                <span class={styles.knowledgeValue}>
                  {insight().knowledge.success_rate > 0
                    ? `${Math.round(insight().knowledge.success_rate)}%`
                    : '--'}
                </span>
                <span class={styles.knowledgeLabel}>Success</span>
              </div>
            </div>

            {/* Recent Decisions */}
            <Show when={(insight().recent_decisions?.length ?? 0) > 0}>
              <div class={styles.divider} />
              <span class={styles.sectionLabel}>Recent Decisions</span>
              <div class={styles.decisionList}>
                <For each={insight().recent_decisions}>
                  {(decision: DecisionEntry) => (
                    <div class={styles.decisionRow}>
                      <span
                        class={styles.decisionOutcome}
                        style={{ background: outcomeColor(decision.success) }}
                        title={
                          decision.success === true ? 'Succeeded'
                          : decision.success === false ? 'Failed'
                          : 'Pending'
                        }
                      />
                      <span class={styles.decisionGoal} title={decision.goal}>
                        {truncateGoal(decision.goal)}
                      </span>
                      <span class={styles.decisionStrategy}>{decision.strategy_id}</span>
                      <span class={styles.decisionTime}>{timeAgo(decision.created_at)}</span>
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

export default AIInsightPanel;
