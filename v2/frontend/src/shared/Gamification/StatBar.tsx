// Phantom — RPG Stat Bar component
// Author: Subash Karki

import { createMemo, onMount, createSignal } from 'solid-js';
import { STAT_COLORS, statBarRow, statAbbr, statBarTrack, statBarFillStyle, statValue } from '@/styles/gamification.css';

interface StatBarProps {
  label: string;
  abbreviation: string;
  value: number;
  maxValue?: number;
  color?: string;
  /** Stagger delay in ms for entrance animation */
  delay?: number;
}

export const StatBar = (props: StatBarProps) => {
  const [mounted, setMounted] = createSignal(false);

  const effectiveMax = createMemo(() =>
    Math.max(props.maxValue ?? 100, Math.ceil(props.value / 50) * 50 + 50),
  );

  const percentage = createMemo(() =>
    Math.min((props.value / effectiveMax()) * 100, 100),
  );

  const barColor = createMemo(() =>
    props.color ?? STAT_COLORS[props.abbreviation] ?? '#6B7280',
  );

  onMount(() => {
    const delay = props.delay ?? 0;
    setTimeout(() => setMounted(true), delay);
  });

  return (
    <div class={statBarRow}>
      <span class={statAbbr}>{props.abbreviation}</span>
      <div
        class={statBarTrack}
        role="progressbar"
        aria-valuenow={props.value}
        aria-valuemin={0}
        aria-valuemax={effectiveMax()}
        aria-label={`${props.label}: ${props.value} out of ${effectiveMax()}`}
      >
        <div
          class={statBarFillStyle}
          style={{
            width: mounted() ? `${percentage()}%` : '0%',
            'background-color': barColor(),
            'transition-delay': `${props.delay ?? 0}ms`,
          }}
        />
      </div>
      <span class={statValue}>{props.value}</span>
    </div>
  );
};
