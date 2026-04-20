// Author: Subash Karki

import { createSignal, For, onMount, onCleanup } from 'solid-js';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import type { Ability } from '../config/types';
import * as styles from '../styles/ability.css';

interface AbilityRevealProps {
  abilities: Ability[];
  onAllRevealed: () => void;
}

export function AbilityReveal(props: AbilityRevealProps) {
  const [revealedCount, setRevealedCount] = createSignal(0);

  onMount(() => {
    let cancelled = false;

    onCleanup(() => {
      cancelled = true;
    });

    async function revealAll() {
      for (let i = 0; i < props.abilities.length; i++) {
        if (cancelled) return;
        const ability = props.abilities[i];
        const delay = i === 0 ? 0 : ability.revealDelay;

        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
        if (cancelled) return;

        setRevealedCount(i + 1);
        playSound(ability.sound);
        await speakSystem(ability.speech);
        if (cancelled) return;
      }

      await new Promise((r) => setTimeout(r, 500));
      if (!cancelled) props.onAllRevealed();
    }

    revealAll();
  });

  return (
    <div class={styles.abilityList}>
      <For each={props.abilities}>
        {(ability, index) => (
          <div
            class={styles.abilityCard}
            classList={{ [styles.abilityCardVisible]: index() < revealedCount() }}
          >
            <span class={styles.abilityIcon}>{ability.icon}</span>
            <div class={styles.abilityInfo}>
              <div class={styles.abilityName}>{ability.name}</div>
              <div class={styles.abilityDesc}>{ability.desc}</div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
