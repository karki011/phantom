// Author: Subash Karki

import type { Session } from '../../../core/types';
import { formatTokens, formatCost, relativeTime, isActiveSession } from '../../../utils/format';
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


function statusClass(status: string | null): string {
  if (isActiveSession(status)) return `${styles.statusDot} ${styles.statusActive}`;
  if (status === 'stale') return `${styles.statusDot} ${styles.statusStale}`;
  return `${styles.statusDot} ${styles.statusEnded}`;
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
        <span class={styles.statValue}>{relativeTime(s().started_at)}</span>
      </div>
    </div>
  );
}
