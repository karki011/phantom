// Author: Subash Karki

import { For, createMemo } from 'solid-js';
import * as styles from './rings.css';

interface BootRingsProps {
  progress: number;
  total: number;
}

const RINGS = [
  { cx: 160, cy: 160, r: 55 },
  { cx: 160, cy: 160, r: 85 },
  { cx: 160, cy: 160, r: 115 },
];

export function BootRings(props: BootRingsProps) {
  const ringStates = createMemo(() => {
    const ratio = props.total > 0 ? props.progress / props.total : 0;
    return RINGS.map((ring, i) => {
      const threshold = (i + 1) / RINGS.length;
      const prevThreshold = i / RINGS.length;
      const circumference = 2 * Math.PI * ring.r;

      if (ratio >= threshold) {
        return { state: 'complete' as const, offset: 0, circumference };
      }
      if (ratio > prevThreshold) {
        const segmentProgress = (ratio - prevThreshold) / (threshold - prevThreshold);
        return {
          state: 'active' as const,
          offset: circumference * (1 - segmentProgress),
          circumference,
        };
      }
      return { state: 'idle' as const, offset: circumference, circumference };
    });
  });

  return (
    <div class={styles.ringsContainer}>
      <svg class={styles.ringsSvg} viewBox="0 0 320 320">
        <For each={RINGS}>
          {(ring, i) => {
            const ringState = () => ringStates()[i()];
            const circumference = () => 2 * Math.PI * ring.r;
            return (
              <>
                <circle
                  cx={ring.cx}
                  cy={ring.cy}
                  r={ring.r}
                  class={`${styles.ringBase} ${styles.ringIdle}`}
                />
                <circle
                  cx={ring.cx}
                  cy={ring.cy}
                  r={ring.r}
                  class={`${styles.ringProgress} ${
                    ringState().state === 'active'
                      ? styles.ringActive
                      : ringState().state === 'complete'
                        ? styles.ringComplete
                        : ''
                  }`}
                  style={{
                    'stroke-dasharray': `${circumference()}`,
                    'stroke-dashoffset': `${ringState().offset}`,
                  }}
                  transform={`rotate(-90 ${ring.cx} ${ring.cy})`}
                />
              </>
            );
          }}
        </For>
      </svg>
    </div>
  );
}
