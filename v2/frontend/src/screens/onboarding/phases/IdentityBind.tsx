// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { getGitUserName } from '../../../core/bindings';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import { AutoTimer } from '../engine/AutoTimer';
import * as styles from '../styles/phases.css';

interface IdentityBindProps {
  onComplete: (data: Record<string, string>) => void;
}

export function IdentityBind(props: IdentityBindProps) {
  const [name, setName] = createSignal('');
  const [detected, setDetected] = createSignal('');
  const [paused, setPaused] = createSignal(false);

  onMount(async () => {
    playSound('whoosh');
    const speechTimer = setTimeout(() => speakSystem('Identity detected. Locking in.'), 250);
    onCleanup(() => clearTimeout(speechTimer));

    const gitName = await getGitUserName();
    if (gitName) {
      setDetected(gitName);
      setName(gitName);
    }
  });

  function handleSubmit() {
    const trimmed = name().trim();
    if (!trimmed) return;
    props.onComplete({ operator_name: trimmed });
  }

  function handleAutoResolve() {
    props.onComplete({ operator_name: name().trim() || detected() || '' });
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

        <Show when={detected()}>
          <div class={`${styles.label} ${styles.labelDetected}`}>
            Identity detected: {detected()}
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

      <AutoTimer
        timeout={5000}
        onResolve={handleAutoResolve}
        message="No override detected. Identity locked."
        paused={paused()}
      />
    </PhasePanel>
  );
}
