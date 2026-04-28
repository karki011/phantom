// PhantomOS v2 — Floating XP gain animation
// Author: Subash Karki

import { Show } from 'solid-js';
import { xpGainEvent } from '@/core/signals/gamification';
import { xpFloatContainer, xpFloatText } from '@/styles/gamification.css';

export const XPGainFloat = () => {
  return (
    <Show when={xpGainEvent()}>
      {(evt) => (
        <div class={xpFloatContainer}>
          <span class={xpFloatText}>+{evt().amount} XP</span>
        </div>
      )}
    </Show>
  );
};
