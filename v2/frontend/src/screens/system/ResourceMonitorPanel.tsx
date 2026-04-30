// Phantom — Resource Monitor panel with live sessions, terminals, and process stats
// Author: Subash Karki

import {
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  Show,
  For,
} from 'solid-js';
import { Terminal as TerminalIcon } from 'lucide-solid';
import { sessions } from '@/core/signals/sessions';
import { killSession, pauseSession, resumeSession } from '@/core/bindings/sessions';
import { listTerminals, destroyTerminal } from '@/core/bindings/terminal';
import { healthCheck } from '@/core/bindings/health';
import { addTabWithData } from '@/core/panes/signals';
import { activeProvider, activeProviderLabel } from '@/core/signals/active-provider';
import * as styles from './ResourceMonitorPanel.css';

import type { JSX } from 'solid-js';
import type { HealthResponse } from '@/core/types';
import type { TerminalInfo } from '@/core/bindings/terminal';

// Provider color map (provider-specific, not theme tokens)
const PROVIDER_COLORS: Record<string, string> = {
  claude: '#a855f7',
  codex: '#22c55e',
  gemini: '#3b82f6',
};

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
};

const formatDuration = (startedAtSecs: number, nowMs: number): string => {
  const elapsedSecs = Math.max(0, Math.floor((nowMs - startedAtSecs * 1000) / 1000));
  const hours = Math.floor(elapsedSecs / 3600);
  const minutes = Math.floor((elapsedSecs % 3600) / 60);
  const secs = elapsedSecs % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const truncateCwd = (cwd: string | null, maxLen = 30): string => {
  if (!cwd) return '';
  if (cwd.length <= maxLen) return cwd;
  return `...${cwd.slice(-(maxLen - 3))}`;
};

const contextBarColor = (pct: number): string => {
  if (pct >= 80) return '#ef4444'; // red
  if (pct >= 50) return '#f59e0b'; // yellow/amber
  return '#22c55e'; // green
};

export function ResourceMonitorPanel(): JSX.Element {
  const [terminals, setTerminals] = createSignal<TerminalInfo[]>([]);
  const [health, setHealth] = createSignal<HealthResponse | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const [confirmKillSessionId, setConfirmKillSessionId] = createSignal<string | null>(null);
  const [confirmKillTerminalId, setConfirmKillTerminalId] = createSignal<string | null>(null);

  // ── Polling: terminals + health every 5s ──────────────────────────────────

  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;

  const pollData = async () => {
    const [terms, h] = await Promise.all([listTerminals(), healthCheck()]);
    setTerminals(terms);
    if (h) setHealth(h);
  };

  onMount(() => {
    void pollData();
    pollTimer = setInterval(pollData, 5000);
    // Tick every second for running-duration display
    tickTimer = setInterval(() => setNow(Date.now()), 1000);
  });

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (tickTimer) clearInterval(tickTimer);
  });

  // ── Derived: active sessions ──────────────────────────────────────────────

  const activeSessions = createMemo(() =>
    sessions().filter(
      (s) => s.status === 'active' || s.status === 'paused',
    ),
  );

  const activeSessionCount = createMemo(() => activeSessions().length);
  const terminalCount = createMemo(() => terminals().length);
  const goroutines = createMemo(() => health()?.goroutines ?? 0);
  const goMemory = createMemo(() => {
    const h = health();
    return h ? `${h.mem_alloc_mb.toFixed(1)} MB` : '--';
  });

  return (
    <div class={styles.panelContainer}>
      <span class={styles.panelTitle}>Resource Monitor</span>

      {/* ── Section 1: Process Overview ───────────────────────────────────── */}
      <div class={styles.section}>
        <span class={styles.sectionTitle}>Process Overview</span>
        <div class={styles.statsRow}>
          <div class={styles.statCard}>
            <span class={styles.statValue}>{activeSessionCount()}</span>
            <span class={styles.statLabel}>Sessions</span>
          </div>
          <div class={styles.statCard}>
            <span class={styles.statValue}>{terminalCount()}</span>
            <span class={styles.statLabel}>Terminals</span>
          </div>
          <div class={styles.statCard}>
            <span class={styles.statValue}>{goroutines()}</span>
            <span class={styles.statLabel}>Goroutines</span>
          </div>
          <div class={styles.statCard}>
            <span class={styles.statValue}>{goMemory()}</span>
            <span class={styles.statLabel}>Go Memory</span>
          </div>
        </div>
      </div>

      {/* ── Section 2: Active Sessions ───────────────────────────────────── */}
      <div class={styles.section}>
        <span class={styles.sectionTitle}>Active Sessions</span>
        <Show
          when={activeSessions().length > 0}
          fallback={
            <div class={styles.emptyState}>No active sessions</div>
          }
        >
          <For each={activeSessions()}>
            {(session) => {
              const provider = session.provider?.toLowerCase() ?? 'unknown';
              const dotColor = PROVIDER_COLORS[provider] ?? '#6b7280';
              const statusColor =
                session.status === 'active' ? '#22c55e' : '#f59e0b';
              const contextPct = session.context_used_pct ?? 0;
              const totalTokens =
                (session.input_tokens ?? 0) + (session.output_tokens ?? 0);

              return (
                <div class={styles.sessionRow}>
                  <div
                    class={styles.providerDot}
                    style={{ 'background-color': dotColor }}
                  />
                  <span class={styles.sessionProvider}>{provider}</span>
                  <Show when={session.model}>
                    <span class={styles.sessionModel}>{session.model}</span>
                  </Show>
                  <div
                    class={styles.statusDot}
                    style={{ 'background-color': statusColor }}
                  />
                  <span class={styles.sessionCwd}>
                    {truncateCwd(session.cwd)}
                  </span>
                  <div class={styles.contextBarOuter}>
                    <div
                      class={styles.contextBarInner}
                      style={{
                        width: `${Math.min(100, contextPct)}%`,
                        'background-color': contextBarColor(contextPct),
                      }}
                    />
                  </div>
                  <span class={styles.sessionTokens}>
                    {formatTokens(totalTokens)}
                  </span>
                  <Show when={session.started_at}>
                    <span class={styles.sessionDuration}>
                      {formatDuration(session.started_at!, now())}
                    </span>
                  </Show>
                  <span class={styles.actionButtonRow}>
                    <button
                      type="button"
                      class={styles.actionButton}
                      title="Attach to this session in a new terminal pane"
                      onClick={() => {
                        const cwd = session.cwd ?? '';
                        const resumeCmd = activeProvider()?.config?.commands?.resume?.replace('${SESSION_ID}', session.id)
                          ?? `claude --resume ${session.id}`;
                        addTabWithData('terminal', `${activeProviderLabel()} (attached)`, {
                          cwd,
                          command: resumeCmd,
                        });
                      }}
                    >
                      Attach
                    </button>
                    <button
                      type="button"
                      class={styles.actionButton}
                      title={session.status === 'paused' ? 'Resume this session' : 'Pause this session (SIGTSTP)'}
                      onClick={async () => {
                        try {
                          if (session.status === 'paused') {
                            await resumeSession(session.id);
                          } else {
                            await pauseSession(session.id);
                          }
                        } catch (err) {
                          console.error('pause/resume failed', err);
                        }
                      }}
                    >
                      {session.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      class={`${styles.actionButton} ${styles.actionButtonDanger}`}
                      title="Kill this session"
                      onClick={async () => {
                        if (confirmKillSessionId() !== session.id) {
                          setConfirmKillSessionId(session.id);
                          setTimeout(() => {
                            if (confirmKillSessionId() === session.id) setConfirmKillSessionId(null);
                          }, 3000);
                          return;
                        }
                        try {
                          await killSession(session.id);
                        } catch (err) {
                          console.error('killSession failed', err);
                        } finally {
                          setConfirmKillSessionId(null);
                        }
                      }}
                    >
                      {confirmKillSessionId() === session.id ? 'Confirm?' : 'Kill'}
                    </button>
                  </span>
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      {/* ── Section 3: Active Terminals ──────────────────────────────────── */}
      <div class={styles.section}>
        <span class={styles.sectionTitle}>Active Terminals</span>
        <Show
          when={terminals().length > 0}
          fallback={
            <div class={styles.emptyState}>No active terminals</div>
          }
        >
          <For each={terminals()}>
            {(term) => (
              <div class={styles.terminalRow}>
                <TerminalIcon size={14} class={styles.terminalIcon} />
                <span class={styles.terminalId}>
                  {term.id.length > 12
                    ? `${term.id.slice(0, 12)}...`
                    : term.id}
                </span>
                <span class={styles.terminalCwd}>
                  {truncateCwd(term.cwd)}
                </span>
                <span class={styles.terminalSize}>
                  {term.cols}x{term.rows}
                </span>
                <button
                  type="button"
                  class={`${styles.actionButton} ${styles.actionButtonDanger}`}
                  style={{ 'margin-left': 'auto' }}
                  title="Kill this terminal"
                  onClick={async () => {
                    if (confirmKillTerminalId() !== term.id) {
                      setConfirmKillTerminalId(term.id);
                      setTimeout(() => {
                        if (confirmKillTerminalId() === term.id) setConfirmKillTerminalId(null);
                      }, 3000);
                      return;
                    }
                    try {
                      await destroyTerminal(term.id);
                    } catch (err) {
                      console.error('destroyTerminal failed', err);
                    } finally {
                      setConfirmKillTerminalId(null);
                    }
                  }}
                >
                  {confirmKillTerminalId() === term.id ? 'Confirm?' : 'Kill'}
                </button>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
