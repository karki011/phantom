// Phantom — AI Engine Playground pane
//
// Interactive dry-run of the AI engine: type a goal, see strategy selection,
// blast radius, symbol inference, enriched prompt, and session memory — all
// without spawning Claude.
//
// Author: Subash Karki

import { createSignal, createEffect, Show, For, on, onCleanup } from 'solid-js';
import { ChevronRight, Zap, Brain, FileCode, Layers, BarChart3, Sparkles } from 'lucide-solid';
import { playgroundProcess, type PlaygroundResult } from '@/core/bindings/playground';
import { activeWorktree, activeProject } from '@/core/signals/worktrees';
import * as styles from './PlaygroundPane.css';

// ── Collapsible Card ──────────────────────────────────────────────────────

const CollapsibleCard = (props: {
  title: string;
  badge?: string;
  icon?: any;
  defaultOpen?: boolean;
  children: any;
}) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  return (
    <div class={styles.card}>
      <div class={styles.cardHeader} onClick={() => setOpen(!open())}>
        <span class={styles.cardTitle}>
          <Show when={props.icon}>{props.icon}</Show>
          {props.title}
          <Show when={props.badge}>
            <span class={styles.cardBadge}>{props.badge}</span>
          </Show>
        </span>
        <span
          class={styles.chevron}
          classList={{ [styles.chevronOpen]: open() }}
        >
          <ChevronRight size={14} />
        </span>
      </div>
      <Show when={open()}>
        <div class={styles.cardBody}>{props.children}</div>
      </Show>
    </div>
  );
};

// ── Ambiguity Gauge ───────────────────────────────────────────────────────

const AmbiguityGauge = (props: { score: number; isAmbiguous: boolean }) => (
  <div class={styles.gaugeContainer}>
    <span class={styles.gaugeLabel}>
      Ambiguity {props.isAmbiguous ? '(!)' : ''}
    </span>
    <div class={styles.gaugeTrack}>
      <div
        class={styles.gaugeFill}
        style={{
          width: `${Math.round(props.score * 100)}%`,
          background: props.score > 0.7
            ? 'var(--danger, #ff4444)'
            : props.score > 0.4
              ? 'var(--warning, #ffaa00)'
              : undefined,
        }}
      />
    </div>
    <span class={styles.gaugeValue}>{(props.score * 100).toFixed(0)}%</span>
  </div>
);

// ── Main Pane ─────────────────────────────────────────────────────────────

const PlaygroundPane = () => {
  const [goal, setGoal] = createSignal('');
  const [cwd, setCwd] = createSignal('');
  const [result, setResult] = createSignal<PlaygroundResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Resolve CWD from override input, active worktree, or active project.
  const resolvedCwd = () => {
    const c = cwd();
    if (c) return c;
    const wt = activeWorktree();
    if (wt?.worktree_path) return wt.worktree_path;
    const proj = activeProject();
    if (proj?.repo_path) return proj.repo_path;
    return '';
  };

  // Manual trigger only — user clicks Analyze or presses Cmd+Enter.

  const runAnalysis = async (g?: string) => {
    const prompt = g ?? goal();
    const dir = resolvedCwd();
    if (!prompt.trim()) return;
    if (!dir) {
      setError('No CWD available. Open a project first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await playgroundProcess(prompt.trim(), dir);
      if (res) {
        setResult(res);
      } else {
        setError('Analysis returned no result.');
      }
    } catch (err) {
      setError(`Analysis failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div class={styles.root}>
      {/* Header */}
      <div class={styles.header}>
        <Sparkles size={16} />
        <span class={styles.headerTitle}>AI Engine Playground</span>
        <span class={styles.headerBadge}>dry run</span>
        <Show when={result()}>
          <span class={styles.durationBadge}>{result()!.duration_ms}ms</span>
        </Show>
      </div>

      {/* Input Area */}
      <div class={styles.inputArea}>
        <textarea
          class={styles.textarea}
          placeholder="Type a goal... e.g. 'Refactor the auth service to use JWT tokens' (Cmd+Enter to analyze)"
          value={goal()}
          onInput={(e) => setGoal(e.currentTarget.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              runAnalysis();
            }
          }}
          rows={3}
        />
        <div class={styles.inputRow}>
          <div class={styles.cwdDisplay} title={resolvedCwd()}>
            CWD: {resolvedCwd() || '(none)'}
          </div>
          <input
            class={styles.textarea}
            style={{ 'min-height': '28px', 'max-height': '28px', flex: '1' }}
            placeholder="Override CWD path..."
            value={cwd()}
            onInput={(e) => setCwd(e.currentTarget.value)}
          />
          <button
            class={styles.analyzeBtn}
            disabled={loading() || !goal().trim()}
            onClick={() => runAnalysis()}
          >
            {loading() ? 'Analyzing...' : 'Analyze'}
          </button>
          <button
            class={styles.analyzeBtn}
            style={{ background: 'transparent', border: `1px solid var(--color-border)`, color: 'var(--color-text-secondary)' }}
            onClick={() => { setGoal(''); setResult(null); setError(null); }}
            aria-label="Reset playground"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Results Area */}
      <div class={styles.resultsArea}>
        <Show when={loading()}>
          <div class={styles.loadingIndicator}>
            <Zap size={14} /> Running AI engine pipeline...
          </div>
        </Show>

        <Show when={error()}>
          <div class={styles.card}>
            <div class={styles.cardBody} style={{ color: 'var(--danger, #ff4444)', padding: 'var(--space-md, 12px)' }}>
              {error()}
            </div>
          </div>
        </Show>

        <Show when={result()} fallback={
          <Show when={!loading() && !error()}>
            <div class={styles.emptyState}>
              <div class={styles.emptyIcon}><Brain size={48} /></div>
              <div>Type a goal above to analyze the AI engine's response.</div>
              <div>The engine will select a strategy, infer files, and build context — without calling Claude.</div>
            </div>
          </Show>
        }>
          {(r) => (
            <>
              {/* Strategy Card (Hero) */}
              <div class={styles.strategyCard}>
                <div class={styles.strategyHeader}>
                  <span class={styles.strategyName}>{r().strategy}</span>
                  <span class={styles.confidenceBadge}>
                    {(r().confidence * 100).toFixed(1)}% confidence
                  </span>
                </div>

                <div class={styles.pillRow}>
                  <span class={styles.pill}>
                    <span class={styles.pillLabel}>Complexity</span>
                    {r().complexity}
                  </span>
                  <span class={styles.pill}>
                    <span class={styles.pillLabel}>Risk</span>
                    {r().risk}
                  </span>
                  <span class={styles.pill}>
                    <span class={styles.pillLabel}>Blast Radius</span>
                    {r().blast_radius}
                  </span>
                  <span class={styles.pill}>
                    <span class={styles.pillLabel}>Files</span>
                    {r().file_count}
                  </span>
                </div>

                <AmbiguityGauge
                  score={r().ambiguity_score}
                  isAmbiguous={r().is_ambiguous}
                />
              </div>

              {/* Alternatives Table */}
              <CollapsibleCard
                title="Strategy Alternatives"
                badge={`${(r().alternatives?.length ?? 0) + 1} strategies`}
                icon={<Layers size={14} />}
                defaultOpen={true}
              >
                <table class={styles.table}>
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      <th>Score</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Winner row */}
                    <tr class={styles.winnerRow}>
                      <td>{r().strategy}</td>
                      <td>
                        {(r().confidence * 100).toFixed(1)}%
                        <span
                          class={styles.scoreBar}
                          style={{ width: `${Math.round(r().confidence * 60)}px` }}
                        />
                      </td>
                      <td>Winner</td>
                    </tr>
                    {/* Alternative rows */}
                    <For each={r().alternatives ?? []}>
                      {(alt) => (
                        <tr>
                          <td>{alt.name}</td>
                          <td>
                            {(alt.score * 100).toFixed(1)}%
                            <span
                              class={styles.scoreBar}
                              style={{
                                width: `${Math.round(alt.score * 60)}px`,
                                opacity: 0.5,
                              }}
                            />
                          </td>
                          <td>{alt.reason}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </CollapsibleCard>

              {/* Inferred Files */}
              <CollapsibleCard
                title="Inferred Files"
                badge={`${r().inferred_files?.length ?? 0}`}
                icon={<FileCode size={14} />}
                defaultOpen={false}
              >
                <Show
                  when={(r().inferred_files?.length ?? 0) > 0}
                  fallback={
                    <div style={{ color: 'var(--text-disabled)', 'font-size': 'var(--font-size-xs, 12px)' }}>
                      No files inferred from prompt symbols.
                    </div>
                  }
                >
                  <ul class={styles.fileList}>
                    <For each={r().inferred_files ?? []}>
                      {(file) => <li class={styles.fileItem}>{file}</li>}
                    </For>
                  </ul>
                </Show>
              </CollapsibleCard>

              {/* Graph Stats */}
              <Show when={r().graph_stats}>
                {(gs) => (
                  <CollapsibleCard
                    title="Graph Stats"
                    icon={<BarChart3 size={14} />}
                    defaultOpen={true}
                  >
                    <div class={styles.statsRow}>
                      <div class={styles.statBox}>
                        <span class={styles.statValue}>{gs().files_indexed.toLocaleString()}</span>
                        <span class={styles.statLabel}>Files</span>
                      </div>
                      <div class={styles.statBox}>
                        <span class={styles.statValue}>{gs().symbols_indexed.toLocaleString()}</span>
                        <span class={styles.statLabel}>Symbols</span>
                      </div>
                      <div class={styles.statBox}>
                        <span class={styles.statValue}>{gs().edge_count.toLocaleString()}</span>
                        <span class={styles.statLabel}>Edges</span>
                      </div>
                    </div>
                  </CollapsibleCard>
                )}
              </Show>

              {/* Enriched Prompt */}
              <CollapsibleCard
                title="Enriched Prompt"
                icon={<Zap size={14} />}
                defaultOpen={false}
              >
                <Show
                  when={r().enriched_prompt}
                  fallback={
                    <div style={{ color: 'var(--text-disabled)', 'font-size': 'var(--font-size-xs, 12px)' }}>
                      No enriched prompt generated.
                    </div>
                  }
                >
                  <pre class={styles.codeBlock}>{r().enriched_prompt}</pre>
                </Show>
              </CollapsibleCard>

              {/* Session Memory */}
              <CollapsibleCard
                title="Session Memory"
                icon={<Brain size={14} />}
                defaultOpen={false}
              >
                <Show
                  when={r().session_memory}
                  fallback={
                    <div style={{ color: 'var(--text-disabled)', 'font-size': 'var(--font-size-xs, 12px)' }}>
                      No session memory available.
                    </div>
                  }
                >
                  <pre class={styles.codeBlock}>{r().session_memory}</pre>
                </Show>
              </CollapsibleCard>
            </>
          )}
        </Show>
      </div>
    </div>
  );
};

export default PlaygroundPane;
