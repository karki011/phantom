// Phantom — AI Digest drawer component
// Slide-out panel showing end-of-day AI session summary, costs, strategies, and files touched.
// Author: Subash Karki

import { For, Show, createEffect, createMemo } from 'solid-js';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-solid';
import { PhantomDrawer } from '../PhantomDrawer/PhantomDrawer';
import { digestOpen, closeDigest, digestData, digestLoading, loadDigest, costReport, digestDate, goToPrevDay, goToNextDay, goToToday, isToday } from '@/core/signals/digest';
import * as styles from './DigestDrawer.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// CostBreakdown renders the cost-by-model bar chart and strategy win rates.
function CostBreakdown() {
  const report = costReport;

  // Sorted model entries by cost descending
  const modelEntries = createMemo(() => {
    const r = report();
    if (!r) return [];
    return Object.entries(r.costByModel)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
  });

  const maxModelCost = createMemo(() => {
    const entries = modelEntries();
    return entries.length > 0 ? entries[0][1] : 0;
  });

  // Sorted strategy entries with win rates
  const strategyEntries = createMemo(() => {
    const r = report();
    if (!r) return [];
    return Object.entries(r.costByStrategy)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
  });

  return (
    <Show when={report() && (modelEntries().length > 0 || strategyEntries().length > 0)}>
      <div class={styles.section}>
        <p class={styles.sectionTitle}>Cost Breakdown</p>

        {/* Cost by model */}
        <Show when={modelEntries().length > 0}>
          <div class={styles.costBarContainer}>
            <For each={modelEntries()}>
              {([model, cost]) => {
                const pct = maxModelCost() > 0 ? (cost / maxModelCost()) * 100 : 0;
                const shortModel = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
                return (
                  <div class={styles.costBarRow}>
                    <span class={styles.costBarLabel} title={model}>{shortModel}</span>
                    <div class={styles.costBarTrack}>
                      <div class={styles.costBarFill} style={{ width: `${pct}%` }} />
                    </div>
                    <span class={styles.costBarValue}>{formatCost(cost)}</span>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        {/* Strategy win rates */}
        <Show when={strategyEntries().length > 0}>
          <div class={styles.chipRow} style={{ 'margin-top': '6px' }}>
            <For each={strategyEntries()}>
              {([strategy]) => {
                const r = report();
                const winRate = r?.strategyWinRates[strategy];
                if (winRate == null) return null;
                return (
                  <span class={styles.winRateChip}>
                    {strategy} {formatPct(winRate)}
                  </span>
                );
              }}
            </For>
          </div>
        </Show>

        {/* Cost model version note */}
        <Show when={report()?.costModelVersion}>
          <span class={styles.costVersionNote}>
            pricing model {report()!.costModelVersion}
          </span>
        </Show>
      </div>
    </Show>
  );
}

function LoadingSkeleton() {
  return (
    <div class={styles.loadingPulse}>
      <div class={styles.skeleton} style={{ width: '60%' }} />
      <div class={styles.skeleton} style={{ width: '40%' }} />
      <div class={styles.skeleton} style={{ width: '80%' }} />
      <div class={styles.skeleton} style={{ width: '55%' }} />
    </div>
  );
}

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function DigestDrawer() {
  createEffect(() => {
    if (digestOpen()) {
      void loadDigest(digestDate());
    }
  });

  return (
    <PhantomDrawer
      open={digestOpen}
      onOpenChange={(open) => {
        if (!open) closeDigest();
      }}
      title="Daily Digest"
    >
      <div class={styles.scrollBody}>
        {/* Date navigation */}
        <div class={styles.dateNav}>
          <button class={styles.dateNavButton} onClick={goToPrevDay} aria-label="Previous day">
            <ChevronLeft size={14} />
          </button>
          <button
            class={styles.dateLabel}
            onClick={goToToday}
            title="Go to today"
          >
            {formatDate(digestDate())}
          </button>
          <button
            class={styles.dateNavButton}
            onClick={goToNextDay}
            disabled={isToday()}
            aria-label="Next day"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <Show when={digestLoading()}>
          <LoadingSkeleton />
        </Show>

        <Show when={!digestLoading() && !digestData()}>
          <div class={styles.emptyState}>
            No session data for {formatDate(digestDate())}.
          </div>
        </Show>

        <Show when={!digestLoading() && digestData()}>
          {(data) => (
            <>
              {/* Overview section */}
              <div class={styles.section}>
                <p class={styles.sectionTitle}>Overview — {data().date}</p>

                <div class={styles.statRow}>
                  <span class={styles.statValue}>{data().sessionCount}</span>
                  <span class={styles.statLabel}>
                    {data().sessionCount === 1 ? 'session' : 'sessions'}
                  </span>
                </div>

                <div class={styles.statRow}>
                  <span class={styles.statValue}>{formatCost(data().estimatedCost)}</span>
                  <span class={styles.statLabel}>estimated cost</span>
                </div>

                <div class={styles.statRow}>
                  <span class={styles.statValue}>{formatTokens(data().totalTokens)}</span>
                  <span class={styles.statLabel}>tokens</span>
                </div>
              </div>

              {/* Cost Breakdown */}
              <CostBreakdown />

              {/* Top Strategy */}
              <Show when={data().topStrategy}>
                <div class={styles.section}>
                  <p class={styles.sectionTitle}>Top Strategy</p>
                  <span class={styles.topStrategyHighlight}>{data().topStrategy}</span>
                  <Show when={data().strategiesUsed.length > 1}>
                    <div class={styles.chipRow}>
                      <For each={data().strategiesUsed.slice(1)}>
                        {(s) => <span class={styles.strategyChip}>{s}</span>}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Files Touched */}
              <Show when={data().filesTouched.length > 0}>
                <div class={styles.section}>
                  <p class={styles.sectionTitle}>Files Touched ({data().filesTouched.length})</p>
                  <For each={data().filesTouched}>
                    {(f) => <div class={styles.fileItem} title={f}>{f}</div>}
                  </For>
                </div>
              </Show>

              {/* AI Summary */}
              <Show when={data().summary}>
                <div class={styles.section}>
                  <p class={styles.sectionTitle}>Summary</p>
                  <p class={styles.summaryText}>{data().summary}</p>
                </div>
              </Show>

              {/* Refresh */}
              <button
                type="button"
                class={styles.refreshButton}
                onClick={() => void loadDigest(digestDate())}
                aria-label="Refresh digest"
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </>
          )}
        </Show>
      </div>
    </PhantomDrawer>
  );
}
