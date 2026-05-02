// Phantom — Live server log lines for the header drawer
// Author: Subash Karki

import { createEffect, createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import { getRecentAppLogs } from '@/core/bindings/applog';
import * as styles from './AppBackendLogDrawer.css';

export interface AppBackendLogDrawerProps {
  open: Accessor<boolean>;
}

export function AppBackendLogDrawer(props: AppBackendLogDrawerProps): JSX.Element {
  const [logLines, setLogLines] = createSignal<string[]>([]);
  let logPreEl: HTMLPreElement | undefined;

  const pull = async () => {
    setLogLines(await getRecentAppLogs(50));
  };

  createEffect(() => {
    if (!props.open()) return;
    void pull();
    const id = setInterval(() => void pull(), 2000);
    onCleanup(() => clearInterval(id));
  });

  createEffect(() => {
    logLines();
    const el = logPreEl;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });

  return (
    <div class={styles.root}>
      <p class={styles.hint}>
        Last 50 lines · refreshes every 2s while open · pin the header so clicks outside do not close this drawer
      </p>
      <pre
        class={styles.pre}
        ref={(el) => {
          logPreEl = el ?? undefined;
        }}
      >
        {logLines().length > 0 ? logLines().join('\n') : 'No log lines yet.'}
      </pre>
    </div>
  );
}
