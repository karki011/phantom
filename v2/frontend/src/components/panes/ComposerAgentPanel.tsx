// Author: Subash Karki
//
// Agent Status Panel — floating sidebar showing spawned agent status.
// Appears automatically when agents spawn, auto-hides 10s after all complete
// (unless pinned by the user).

import { createSignal, onCleanup, For, Show } from 'solid-js';
import { Check, X, Pin, Bot } from 'lucide-solid';
import * as styles from './ComposerAgentPanel.css';

// ── Public types ────────────────────────────────────────────────────────

export interface AgentInfo {
  toolUseId: string;
  description: string;
  subagentType: string;
  model: string;
  isBackground: boolean;
  status: 'spawning' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt: number;
  result: string;
  tokenEstimate: number;
}

interface AgentPanelProps {
  agents: AgentInfo[];
  onClose: () => void;
  pinned: boolean;
  onTogglePin: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const formatElapsed = (startMs: number, endMs: number): string => {
  const elapsed = (endMs || Date.now()) - startMs;
  if (elapsed < 0) return '0s';
  const totalSec = Math.floor(elapsed / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
};

const formatTokens = (n: number): string => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
};

const truncateResult = (text: string, max = 500): string =>
  text.length > max ? text.slice(0, max) + '...' : text;

// ── Component ───────────────────────────────────────────────────────────

export default function ComposerAgentPanel(props: AgentPanelProps) {
  const [expandedId, setExpandedId] = createSignal<string | null>(null);
  const [now, setNow] = createSignal(Date.now());

  // Live-update elapsed time for running agents every second.
  const timer = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(timer));

  const runningCount = () => props.agents.filter(a => a.status === 'running' || a.status === 'spawning').length;
  const completedCount = () => props.agents.filter(a => a.status === 'completed').length;
  const failedCount = () => props.agents.filter(a => a.status === 'failed').length;

  // Sort: running first, then failed, then completed.
  const sortedAgents = () => {
    const order: Record<string, number> = { spawning: 0, running: 1, failed: 2, completed: 3 };
    return [...props.agents].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // Consume `now` inside elapsed so SolidJS tracks the dependency.
  const elapsedFor = (agent: AgentInfo): string => {
    void now();
    const end = agent.status === 'running' || agent.status === 'spawning' ? Date.now() : agent.completedAt;
    return formatElapsed(agent.startedAt, end);
  };

  return (
    <div
      class={`${styles.panel}`}
      role="complementary"
      aria-label="Spawned agents status"
    >
      {/* Header */}
      <div class={styles.panelHeader}>
        <div class={styles.panelTitle}>
          <Bot size={13} />
          <span>Agents</span>
          <span class={styles.panelCount}>{props.agents.length}</span>
        </div>
        <div class={styles.panelActions}>
          <button
            class={`${styles.panelBtn} ${props.pinned ? styles.panelBtnActive : ''}`}
            type="button"
            onClick={props.onTogglePin}
            title={props.pinned ? 'Unpin panel (auto-hide when done)' : 'Pin panel open'}
            aria-label={props.pinned ? 'Unpin agent panel' : 'Pin agent panel'}
            aria-pressed={props.pinned}
          >
            <Pin size={12} />
          </button>
          <button
            class={styles.panelBtn}
            type="button"
            onClick={props.onClose}
            title="Close agent panel"
            aria-label="Close agent panel"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <Show when={props.agents.length > 0}>
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          padding: '4px 12px',
          'font-size': '10px',
          'font-family': 'var(--font-mono)',
          color: 'var(--text-disabled)',
          'border-bottom': '1px solid var(--divider)',
        }}>
          <Show when={runningCount() > 0}>
            <span style={{ color: 'var(--accent)' }}>{runningCount()} running</span>
          </Show>
          <Show when={completedCount() > 0}>
            <span style={{ color: 'var(--success)' }}>{completedCount()} done</span>
          </Show>
          <Show when={failedCount() > 0}>
            <span style={{ color: 'var(--danger)' }}>{failedCount()} failed</span>
          </Show>
        </div>
      </Show>

      {/* Agent cards */}
      <div class={styles.panelBody} role="list" aria-label="Agent list">
        <Show when={props.agents.length === 0}>
          <div class={styles.panelEmpty}>No agents spawned</div>
        </Show>

        <For each={sortedAgents()}>
          {(agent) => {
            const isExpanded = () => expandedId() === agent.toolUseId;
            const cardClass = () => {
              let cls = styles.agentCard;
              if (agent.status === 'running' || agent.status === 'spawning') cls += ` ${styles.agentCardRunning}`;
              if (agent.status === 'failed') cls += ` ${styles.agentCardFailed}`;
              return cls;
            };

            return (
              <div
                class={cardClass()}
                role="listitem"
                aria-label={`Agent: ${agent.description}, status: ${agent.status}`}
                onClick={() => toggleExpand(agent.toolUseId)}
              >
                {/* Primary row: status + description + elapsed */}
                <div class={styles.agentCardRow}>
                  <Show when={agent.status === 'running' || agent.status === 'spawning'}>
                    <span class={styles.statusSpinner} />
                  </Show>
                  <Show when={agent.status === 'completed'}>
                    <span class={styles.statusDone}><Check size={10} stroke-width={3} /></span>
                  </Show>
                  <Show when={agent.status === 'failed'}>
                    <span class={styles.statusFailed}><X size={10} stroke-width={3} /></span>
                  </Show>
                  <span class={styles.agentDescription} title={agent.description}>
                    {agent.description}
                  </span>
                  <span class={styles.agentElapsed}>{elapsedFor(agent)}</span>
                </div>

                {/* Meta row: model badge + subagent type + tokens */}
                <div class={styles.agentMeta}>
                  <span class={styles.agentBadge}>{agent.model}</span>
                  <Show when={agent.subagentType && agent.subagentType !== agent.model}>
                    <span class={styles.agentBadge}>{agent.subagentType}</span>
                  </Show>
                  <Show when={agent.isBackground}>
                    <span class={styles.agentBadge}>bg</span>
                  </Show>
                  <Show when={agent.tokenEstimate > 0}>
                    <span class={styles.agentTokens}>{formatTokens(agent.tokenEstimate)} tok</span>
                  </Show>
                </div>

                {/* Expanded result */}
                <Show when={isExpanded() && agent.result}>
                  <pre
                    class={`${styles.agentResult} ${agent.status === 'failed' ? styles.agentResultError : ''}`}
                  >
                    {truncateResult(agent.result)}
                  </pre>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
