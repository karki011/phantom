// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { abilities } from '../config/phases';
import { AbilityReveal } from '../engine/AbilityReveal';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import * as styles from '../styles/awakening.css';

export function AbilityAwaken(props: { onComplete: (data: Record<string, string>) => void }) {
  const [allRevealed, setAllRevealed] = createSignal(false);

  onMount(() => {
    playSound('bass');
    const speechTimer = setTimeout(() => speakSystem('Your abilities are being prepared.'), 250);
    onCleanup(() => clearTimeout(speechTimer));
  });

  function handleAllRevealed() {
    setAllRevealed(true);
    setTimeout(() => speakSystem('Core functions unlocked.'), 500);
  }

  return (
    <PhasePanel title="Ability Awakening" subtitle="Final calibration in progress.">
      <AbilityReveal abilities={abilities} onAllRevealed={handleAllRevealed} />
      <Show when={allRevealed()}>
        <div class={styles.continueRow}>
          <button
            class={buttonRecipe({ variant: 'primary', size: 'md' })}
            onClick={() => props.onComplete({})}
          >
            Continue
          </button>
        </div>
      </Show>
    </PhasePanel>
  );
}
