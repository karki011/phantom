// Author: Subash Karki

import type { Session } from '../../../core/types';
import { ContextBar } from '../../../shared/ContextBar/ContextBar';
import * as styles from './SessionCard.css';

interface SessionCardProps {
  session: Session;
}

function deriveSessionName(s: Session): string {
  if (s.name) return s.name;
  if (s.cwd) {
    const parts = s.cwd.split('/');
    return parts[parts.length - 1] || s.id.slice(0, 8);
  }
  return s.id.slice(0, 8);
}

function formatTokens(n: number | null): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(micros: number | null): string {
  if (!micros) return '$0.00';
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

function formatRelativeTime(epochSecs: number | null): string {
  if (!epochSecs) return '';
  const diffSecs = Math.floor(Date.now() / 1000 - epochSecs);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  return `${Math.floor(diffSecs / 86400)}d ago`;
}

function statusClass(status: string | null): string {
  switch (status) {
    case 'active':
    case 'running':
      return `${styles.statusDot} ${styles.statusActive}`;
    case 'stale':
      return `${styles.statusDot} ${styles.statusStale}`;
    default:
      return `${styles.statusDot} ${styles.statusEnded}`;
  }
}

export function SessionCard(props: SessionCardProps) {
  const s = () => props.session;
  const totalTokens = () => (s().input_tokens ?? 0) + (s().output_tokens ?? 0);

  return (
    <div class={styles.card}>
      <div class={styles.header}>
        <div class={statusClass(s().status)} />
        <span class={styles.sessionName}>{deriveSessionName(s())}</span>
      </div>
      <div class={styles.model}>{s().model ?? 'unknown'}</div>
      <ContextBar percent={s().context_used_pct ?? 0} size="sm" />
      <div class={styles.stats}>
        <span class={styles.statValue}>{formatTokens(totalTokens())} tok</span>
        <span class={styles.costValue}>{formatCost(s().estimated_cost_micros)}</span>
        <span class={styles.statValue}>{formatRelativeTime(s().started_at)}</span>
      </div>
    </div>
  );
}
