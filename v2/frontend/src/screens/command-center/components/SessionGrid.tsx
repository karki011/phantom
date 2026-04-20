// Author: Subash Karki

import { For, Show, createMemo, type Accessor } from 'solid-js';
import type { Session } from '../../../core/types';
import { formatTokens, formatCost, relativeTime, isActiveSession } from '../../../utils/format';
import * as styles from './SessionGrid.css';

interface SessionGridProps {
  sessions: Accessor<Session[]>;
}

function deriveSessionName(s: Session): string {
  if (s.name) return s.name;
  if (s.cwd) {
    const parts = s.cwd.split('/');
    return parts[parts.length - 1] || s.id.slice(0, 8);
  }
  return s.id.slice(0, 8);
}

function statusDotClass(status: string | null): string {
  if (isActiveSession(status)) return `${styles.statusDot} ${styles.statusActive}`;
  if (status === 'stale') return `${styles.statusDot} ${styles.statusStale}`;
  return `${styles.statusDot} ${styles.statusEnded}`;
}

function contextFillClass(pct: number): string {
  if (pct >= 90) return `${styles.contextFill} ${styles.contextFillDanger}`;
  if (pct >= 75) return `${styles.contextFill} ${styles.contextFillWarning}`;
  return styles.contextFill;
}

export function SessionGrid(props: SessionGridProps) {
  const sorted = createMemo(() =>
    [...props.sessions()].sort((a, b) => {
      const aActive = isActiveSession(a.status) ? 1 : 0;
      const bActive = isActiveSession(b.status) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (b.started_at ?? 0) - (a.started_at ?? 0);
    })
  );

  const activeCount = () =>
    props.sessions().filter((s) => isActiveSession(s.status)).length;

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <span class={styles.title}>Sessions</span>
        <span class={styles.count}>{activeCount()} active · {props.sessions().length} total</span>
      </div>

      <Show
        when={props.sessions().length > 0}
        fallback={<div class={styles.empty}>No sessions</div>}
      >
        <div class={styles.headerRow}>
          <span />
          <span>name</span>
          <span>model</span>
          <span>ctx</span>
          <span style={{ 'text-align': 'right' }}>tokens</span>
          <span style={{ 'text-align': 'right' }}>cost</span>
          <span style={{ 'text-align': 'right' }}>when</span>
        </div>
        <div class={styles.list}>
          <For each={sorted()}>
            {(session) => {
              const pct = () => session.context_used_pct ?? 0;
              const totalTok = () => (session.input_tokens ?? 0) + (session.output_tokens ?? 0);
              return (
                <div class={styles.row}>
                  <div class={statusDotClass(session.status)} />
                  <span class={styles.sessionName}>{deriveSessionName(session)}</span>
                  <span class={styles.model}>{session.model ?? 'unknown'}</span>
                  <div class={styles.contextCell}>
                    <div class={styles.contextBar}>
                      <div class={contextFillClass(pct())} style={{ width: `${pct()}%` }} />
                    </div>
                    <span class={styles.contextPct}>{pct()}%</span>
                  </div>
                  <span class={styles.tokens}>{formatTokens(totalTok())}</span>
                  <span class={styles.cost}>{formatCost(session.estimated_cost_micros)}</span>
                  <span class={styles.time}>{relativeTime(session.started_at)}</span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
