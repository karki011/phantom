// Phantom — Quest Card component
// Author: Subash Karki

import { createMemo, Show } from 'solid-js';
import type { DailyQuest } from '@/core/types';
import { vars } from '@/styles/theme.css';
import {
  questCard,
  questCardComplete,
  questHeader,
  questLabel,
  questCheckmark,
  questProgressTrack,
  questProgressFill,
  questFooter,
  questProgress,
  xpBadge,
} from '@/styles/gamification.css';

interface QuestCardProps {
  quest: DailyQuest;
}

export const QuestCard = (props: QuestCardProps) => {
  const isComplete = createMemo(() => props.quest.completed > 0);

  const progressPercent = createMemo(() =>
    props.quest.target > 0
      ? Math.min((props.quest.progress / props.quest.target) * 100, 100)
      : 0,
  );

  return (
    <div
      class={`${questCard} ${isComplete() ? questCardComplete : ''}`}
      aria-label={`Quest: ${props.quest.label}. ${props.quest.progress} of ${props.quest.target}${isComplete() ? '. Completed.' : ''}`}
    >
      <div class={questHeader}>
        <span class={questLabel}>{props.quest.label}</span>
        <Show when={isComplete()}>
          <span class={questCheckmark} aria-label="Completed">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
        </Show>
      </div>

      <div
        class={questProgressTrack}
        role="progressbar"
        aria-valuenow={props.quest.progress}
        aria-valuemin={0}
        aria-valuemax={props.quest.target}
        aria-label={`Progress: ${props.quest.progress} of ${props.quest.target}`}
      >
        <div
          class={questProgressFill}
          style={{
            width: `${progressPercent()}%`,
            'background-color': isComplete()
              ? vars.color.success
              : vars.color.accent,
          }}
        />
      </div>

      <div class={questFooter}>
        <span class={questProgress}>
          {props.quest.progress} / {props.quest.target}
        </span>
        <span class={xpBadge}>+{props.quest.xp_reward} XP</span>
      </div>
    </div>
  );
};
