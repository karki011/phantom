// PhantomOS v2 — Top status strip for Chrome Shell
// Author: Subash Karki

import { createMemo } from 'solid-js';
import { sessions } from '../../core/signals/sessions';
import { formatCost, formatTokens } from '../../utils/format';
import * as styles from './StatusStrip.css';

interface Props {
  class?: string;
}

export function StatusStrip(props: Props) {
  const activeCount = createMemo(() =>
    sessions().filter((s) => s.status === 'active').length,
  );

  const totalCost = createMemo(() =>
    sessions().reduce((sum, s) => sum + (s.estimated_cost_micros ?? 0), 0),
  );

  const totalTokens = createMemo(() =>
    sessions().reduce(
      (sum, s) => sum + (s.input_tokens ?? 0) + (s.output_tokens ?? 0),
      0,
    ),
  );

  const hasActive = createMemo(() => activeCount() > 0);

  return (
    <div class={`${styles.strip}${props.class ? ` ${props.class}` : ''}`}>
      <div class={styles.brand}>
        <span class={`${styles.dot} ${styles.dotActive}`} />
        PHANTOM OS
      </div>

      <div class={styles.metrics}>
        <div class={styles.metric}>
          <span class={styles.metricValue}>{activeCount()}</span>
          <span class={styles.metricLabel}>active</span>
        </div>

        <div class={styles.metric}>
          <span class={styles.metricValue}>{formatCost(totalCost())}</span>
          <span class={styles.metricLabel}>burn</span>
        </div>

        <div class={styles.metric}>
          <span class={styles.metricValue}>{formatTokens(totalTokens())}</span>
          <span class={styles.metricLabel}>tokens</span>
        </div>

        <span
          class={`${styles.dot} ${hasActive() ? styles.dotActive : styles.dotIdle}`}
        />
      </div>
    </div>
  );
}
