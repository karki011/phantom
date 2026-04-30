// Phantom — Ward alerts panel for RightSidebar
// Author: Subash Karki

import { Show, For } from 'solid-js';
import { wardAlerts, clearAlerts } from '@/core/signals/wards';
import type { WardEvaluation } from '@/core/types';
import * as styles from './WardAlerts.css';

function levelClass(level: string): string {
  switch (level) {
    case 'block': return styles.levelBlock;
    case 'warn': return styles.levelWarn;
    case 'confirm': return styles.levelConfirm;
    default: return styles.levelLog;
  }
}

function itemClass(level: string): string {
  switch (level) {
    case 'block': return `${styles.alertItem} ${styles.alertItemBlock}`;
    case 'warn': return `${styles.alertItem} ${styles.alertItemWarn}`;
    case 'confirm': return `${styles.alertItem} ${styles.alertItemConfirm}`;
    default: return styles.alertItem;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function WardAlerts() {
  return (
    <div class={styles.alertsContainer}>
      <div class={styles.alertsHeader}>
        <span class={styles.alertsTitle}>Ward Alerts</span>
        <Show when={wardAlerts().length > 0}>
          <button class={styles.clearButton} onClick={clearAlerts}>Clear</button>
        </Show>
      </div>

      <Show when={wardAlerts().length > 0} fallback={
        <div class={styles.emptyState}>No ward alerts</div>
      }>
        <For each={wardAlerts()}>
          {(alert: WardEvaluation) => (
            <div class={itemClass(alert.level)}>
              <div class={styles.alertHeader}>
                <span class={`${styles.alertLevel} ${levelClass(alert.level)}`}>{alert.level}</span>
                <span class={styles.alertRuleName}>{alert.rule_name}</span>
                <span class={styles.alertTime}>{formatTime(alert.timestamp)}</span>
              </div>
              <div class={styles.alertMessage}>{alert.message}</div>
              <Show when={alert.tool_name}>
                <div class={styles.alertTool}>Tool: {alert.tool_name}</div>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
