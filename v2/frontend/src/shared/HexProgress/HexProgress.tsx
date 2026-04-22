// Author: Subash Karki

import { For, createMemo } from 'solid-js';
import { Progress } from '@kobalte/core/progress';
import * as styles from './HexProgress.css';

interface HexProgressProps {
  total: number;
  current: number;
}

export function HexProgress(props: HexProgressProps) {
  const percentage = () =>
    props.total > 0 ? Math.round((props.current / props.total) * 100) : 0;

  const hexItems = createMemo(() => Array.from({ length: props.total }, (_, i) => i));

  return (
    <Progress
      value={percentage()}
      minValue={0}
      maxValue={100}
      class={styles.progressRoot}
    >
      <div class={styles.container}>
        <For each={hexItems()}>
          {(i) => (
            <div
              class={styles.hex}
              classList={{ [styles.hexActive]: i < props.current }}
            />
          )}
        </For>
      </div>
    </Progress>
  );
}
