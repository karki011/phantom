// Phantom — Rank Up grand celebration overlay
// Author: Subash Karki

import { Show } from 'solid-js';
import { rankUpEvent } from '@/core/signals/gamification';
import { RANK_COLORS, celebrationOverlay, rankUpText, rankUpBadge, particleRing } from '@/styles/gamification.css';
import { RankBadge } from './RankBadge';

export const RankUpCelebration = () => {
  return (
    <Show when={rankUpEvent()}>
      {(evt) => {
        const colors = () => RANK_COLORS[evt().newRank] ?? RANK_COLORS.E;

        return (
          <div class={celebrationOverlay}>
            {/* Particle rings in rank color */}
            <div
              class={particleRing}
              style={{
                'border-color': colors().border,
                'animation-delay': '0s',
              }}
            />
            <div
              class={particleRing}
              style={{
                'border-color': colors().border,
                'animation-delay': '0.3s',
                width: '300px',
                height: '300px',
                opacity: 0,
              }}
            />
            <div
              class={particleRing}
              style={{
                'border-color': colors().border,
                'animation-delay': '0.6s',
                width: '400px',
                height: '400px',
                opacity: 0,
              }}
            />

            <span
              class={rankUpText}
              style={{
                color: colors().text,
                'text-shadow': `0 0 30px ${colors().border}80, 0 0 60px ${colors().border}40`,
              }}
            >
              RANK UP!
            </span>

            <div class={rankUpBadge}>
              <RankBadge rank={evt().newRank} title={evt().newTitle} size="lg" />
            </div>
          </div>
        );
      }}
    </Show>
  );
};
