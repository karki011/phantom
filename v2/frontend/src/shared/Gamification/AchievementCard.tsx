// Phantom — Premium Achievement Card component
// Author: Subash Karki

import { Show, createMemo } from 'solid-js';
import type { Achievement } from '@/core/types';
import {
  achievementCard,
  achievementCardUnlocked,
  achievementCardLocked,
  achievementLockOverlay,
  achievementLockSvg,
  achievementIconArea,
  achievementCardBody,
  achievementName,
  achievementDesc,
  achievementMeta,
  xpBadge,
  categoryBadge,
  achievementDate,
  CATEGORY_COLORS,
} from '@/styles/gamification.css';

interface AchievementCardProps {
  achievement: Achievement;
  index: number;
}

const formatDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const AchievementCard = (props: AchievementCardProps) => {
  const isUnlocked = () => props.achievement.unlocked_at !== null;

  const categoryColor = createMemo(() => {
    const cat = props.achievement.category?.toLowerCase() ?? '';
    return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS['default'];
  });

  const staggerDelay = () => `${Math.min(props.index * 40, 600)}ms`;

  return (
    <div
      class={`${achievementCard} ${isUnlocked() ? achievementCardUnlocked : achievementCardLocked}`}
      style={{
        'border-left-color': isUnlocked() ? categoryColor() : undefined,
        'animation-delay': staggerDelay(),
      }}
      aria-label={`Achievement: ${props.achievement.name}. ${isUnlocked() ? 'Unlocked' : 'Locked'}. ${props.achievement.xp_reward} XP.`}
    >
      {/* Lock overlay for locked cards */}
      <Show when={!isUnlocked()}>
        <div class={achievementLockOverlay}>
          <svg class={achievementLockSvg} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      </Show>

      {/* Icon area */}
      <span
        class={achievementIconArea}
        style={{
          'text-shadow': isUnlocked() ? `0 0 12px ${categoryColor()}40` : 'none',
        }}
        aria-hidden="true"
      >
        {props.achievement.icon}
      </span>

      {/* Card body */}
      <div class={achievementCardBody}>
        <span class={achievementName}>
          {props.achievement.name}
        </span>

        <span class={achievementDesc}>
          {props.achievement.description}
        </span>
      </div>

      {/* Meta row: XP + category badges */}
      <div class={achievementMeta}>
        <Show when={props.achievement.category}>
          <span
            class={categoryBadge}
            style={{ color: categoryColor(), 'border-color': `${categoryColor()}40` }}
          >
            {props.achievement.category}
          </span>
        </Show>
        <span class={xpBadge}>+{props.achievement.xp_reward} XP</span>
      </div>

      {/* Unlocked date */}
      <Show when={isUnlocked() && props.achievement.unlocked_at}>
        <span class={achievementDate}>
          Unlocked {formatDate(props.achievement.unlocked_at!)}
        </span>
      </Show>
    </div>
  );
};
