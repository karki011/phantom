// PhantomOS v2 — Achievement unlock toast handler
// Author: Subash Karki

import { createEffect, on } from 'solid-js';
import { achievementUnlockEvent } from '@/core/signals/gamification';
import { showToast } from '@/shared/Toast/Toast';

/**
 * Reactive effect that watches for achievement unlock events
 * and displays a toast notification. Mount this component once
 * in the app root.
 */
export const AchievementToastWatcher = () => {
  createEffect(
    on(achievementUnlockEvent, (evt) => {
      if (!evt) return;
      showToast(
        `Achievement Unlocked! ${evt.icon}`,
        `${evt.name} — +${evt.xp_reward} XP`,
      );
    }),
  );

  return null;
};
