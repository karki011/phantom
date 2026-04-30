// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import { AutoTimer } from '../engine/AutoTimer';
import * as styles from '../styles/phases.css';

interface IdentityBindProps {
  detectedName: string;
  onComplete: (data: Record<string, string>) => void;
}

export function IdentityBind(props: IdentityBindProps) {
  const [name, setName] = createSignal(props.detectedName);
  const [paused, setPaused] = createSignal(false);

  onMount(() => {
    playSound('whoosh');
    const speech = props.detectedName
      ? 'Identity detected. Locking in.'
      : 'State your name, Operator.';
    const speechTimer = setTimeout(() => speakSystem(speech), 250);
    onCleanup(() => clearTimeout(speechTimer));
  });

  function handleSubmit() {
    const trimmed = name().trim();
    if (!trimmed) return;
    props.onComplete({ operator_name: trimmed });
  }

  function handleAutoResolve() {
    props.onComplete({ operator_name: name().trim() || props.detectedName });
  }

  function handleInteraction() {
    setPaused(true);
  }

  return (
    <PhasePanel title="Identity Lock" subtitle="The System requires a name to establish a link.">
      <div
        onPointerDown={handleInteraction}
        onKeyDown={handleInteraction}
        class={styles.phaseStack}
      >
        <div class={styles.field}>
          <label class={styles.label}>Your Name</label>
          <TextField>
            <TextField.Input
              class={styles.input}
              placeholder="State your name, Operator"
              value={name()}
              onInput={(e) => {
                setName(e.currentTarget.value);
                setPaused(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              autofocus
            />
          </TextField>
        </div>

        <Show when={props.detectedName}>
          <div class={`${styles.label} ${styles.labelDetected}`}>
            Identity detected: {props.detectedName}
          </div>
        </Show>

        <div class={styles.actionCenter}>
          <button
            class={buttonRecipe({ variant: 'primary', size: 'lg' })}
            onClick={handleSubmit}
            disabled={!name().trim()}
          >
            Lock In
          </button>
        </div>
      </div>

      <Show when={!!props.detectedName}>
        <AutoTimer
          timeout={10000}
          onResolve={handleAutoResolve}
          message="No override detected. Identity locked."
          paused={paused()}
        />
      </Show>
    </PhasePanel>
  );
}
