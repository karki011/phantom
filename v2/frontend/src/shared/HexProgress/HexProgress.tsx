// Author: Subash Karki

import { For } from 'solid-js';
import * as styles from './HexProgress.css';

interface HexProgressProps {
  total: number;
  current: number; // 0-based: 0 = none complete, 1 = first done, etc.
}

export function HexProgress(props: HexProgressProps) {
  return (
    <div class={styles.container}>
      <For each={Array.from({ length: props.total })}>
        {(_, i) => (
          <div
            class={styles.hex}
            classList={{ [styles.hexActive]: i() < props.current }}
          />
        )}
      </For>
    </div>
  );
}
