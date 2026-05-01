// Author: Subash Karki

import { createSignal, onMount, Show } from 'solid-js';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { abilities } from '../config/phases';
import { AbilityReveal } from '../engine/AbilityReveal';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import * as styles from '../styles/awakening.css';

export function AbilityAwaken(props: { onComplete: (data: Record<string, string>) => void }) {
  const [allRevealed, setAllRevealed] = createSignal(false);
  const [revealReady, setRevealReady] = createSignal(false);

  onMount(() => {
    playSound('bass');
    setRevealReady(true);
  });

  function handleAllRevealed() {
    setAllRevealed(true);
    speakSystem('Core functions unlocked.');
  }

  return (
    <PhasePanel title="Ability Awakening" subtitle="Final calibration in progress.">
      <Show when={revealReady()}>
        <AbilityReveal abilities={abilities} onAllRevealed={handleAllRevealed} />
      </Show>
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
