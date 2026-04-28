// PhantomOS v2 — XP Progress Bar component
// Author: Subash Karki

import { createMemo } from 'solid-js';
import { hunterRank } from '@/core/signals/gamification';
import { RANK_COLORS, xpBarContainer, xpBarHeader, xpBarLabel, xpBarPercentage, xpBarTrack, xpBarFill, xpBarShimmer, xpBarMini } from '@/styles/gamification.css';
import { vars } from '@/styles/theme.css';

interface XPProgressBarProps {
  current: number;
  required: number;
  level: number;
  /** Mini variant for status bar */
  mini?: boolean;
}

export const XPProgressBar = (props: XPProgressBarProps) => {
  const current = () => props.current ?? 0;
  const required = () => props.required ?? 100;
  const level = () => props.level ?? 1;
  const percentage = createMemo(() =>
    required() > 0 ? Math.min((current() / required()) * 100, 100) : 0,
  );

  const percentLabel = createMemo(() => `${Math.round(percentage())}%`);

  const rankColors = createMemo(() => {
    const rank = hunterRank();
    return RANK_COLORS[rank] ?? RANK_COLORS.E;
  });

  if (props.mini) {
    return (
      <div
        class={`${xpBarTrack} ${xpBarMini}`}
        role="progressbar"
        aria-valuenow={current()}
        aria-valuemin={0}
        aria-valuemax={required()}
        aria-label={`XP: ${current()} of ${required()}`}
      >
        <div
          class={xpBarFill}
          style={{
            width: `${percentage()}%`,
            background: rankColors().gradient,
          }}
        />
      </div>
    );
  }

  return (
    <div class={xpBarContainer}>
      <div class={xpBarHeader}>
        <span class={xpBarLabel}>
          Level {level()} · {current().toLocaleString()} / {required().toLocaleString()} XP
        </span>
        <span class={xpBarPercentage}>{percentLabel()}</span>
      </div>
      <div
        class={xpBarTrack}
        role="progressbar"
        aria-valuenow={current()}
        aria-valuemin={0}
        aria-valuemax={required()}
        aria-label={`Level ${level()} experience: ${current()} of ${required()} XP (${percentLabel()})`}
      >
        <div
          class={xpBarFill}
          style={{
            width: `${percentage()}%`,
            background: rankColors().gradient,
          }}
        />
        <div class={xpBarShimmer} style={{ width: `${percentage()}%` }} />
      </div>
    </div>
  );
};
