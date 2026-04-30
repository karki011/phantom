// Phantom — Level Up celebration overlay
// Author: Subash Karki

import { Show } from 'solid-js';
import { levelUpEvent } from '@/core/signals/gamification';
import { celebrationOverlay, levelUpText, levelUpNumber, particleRing } from '@/styles/gamification.css';
import { vars } from '@/styles/theme.css';

export const LevelUpCelebration = () => {
  return (
    <Show when={levelUpEvent()}>
      {(evt) => (
        <div class={celebrationOverlay}>
          {/* Particle rings */}
          <div
            class={particleRing}
            style={{
              'border-color': vars.color.xp,
              'animation-delay': '0s',
            }}
          />
          <div
            class={particleRing}
            style={{
              'border-color': vars.color.xp,
              'animation-delay': '0.3s',
              width: '280px',
              height: '280px',
              opacity: 0,
            }}
          />

          <span class={levelUpText}>LEVEL UP!</span>
          <span class={levelUpNumber}>{evt().newLevel}</span>
        </div>
      )}
    </Show>
  );
};
