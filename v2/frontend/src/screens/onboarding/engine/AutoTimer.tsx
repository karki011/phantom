// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import * as styles from '../styles/flow.css';

interface AutoTimerProps {
  timeout: number;     // total ms (e.g. 5000)
  onResolve: () => void; // called when timer hits 0
  message: string;     // shown after resolve (e.g. "No override detected.")
  paused: boolean;     // externally controlled pause state
}

export function AutoTimer(props: AutoTimerProps) {
  const [remaining, setRemaining] = createSignal(props.timeout);
  const [resolved, setResolved] = createSignal(false);

  onMount(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let lastTick = Date.now();

    intervalId = setInterval(() => {
      if (resolved()) return;

      const now = Date.now();
      if (props.paused) {
        lastTick = now;
        return;
      }

      const elapsed = now - lastTick;
      lastTick = now;

      setRemaining((prev) => {
        const next = prev - elapsed;
        if (next <= 0) {
          clearInterval(intervalId);
          setResolved(true);
          props.onResolve();
          return 0;
        }
        return next;
      });
    }, 100);

    onCleanup(() => clearInterval(intervalId));
  });

  return (
    <div class={styles.autoTimerWrapper}>
      <Show
        when={!resolved()}
        fallback={<div class={styles.autoTimerMessage}>{props.message}</div>}
      >
        <div class={styles.autoTimerBar}>
          <div
            class={styles.autoTimerFill}
            style={{ width: `${(remaining() / props.timeout) * 100}%` }}
          />
        </div>
        <div class={styles.autoTimerText}>
          {`Resolving in ${Math.ceil(remaining() / 1000)}s...`}
        </div>
      </Show>
    </div>
  );
}
