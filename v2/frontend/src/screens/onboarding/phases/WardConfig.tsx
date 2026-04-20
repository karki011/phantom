// Author: Subash Karki

import { createSignal, For, Show, onMount } from 'solid-js';
import { ToggleGroup } from '@kobalte/core/toggle-group';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { wardOptions } from '../config/phases';
import type { WardLevel } from '../config/types';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import { AutoTimer } from '../engine/AutoTimer';
import * as styles from '../styles/phases.css';

interface WardConfigProps {
  onComplete: (data: Record<string, string>) => void;
}

export function WardConfig(props: WardConfigProps) {
  const [wardLevel, setWardLevel] = createSignal<WardLevel>('balanced');
  const [paused, setPaused] = createSignal(false);

  onMount(() => {
    playSound('scan');
    speakSystem('Choose your level of control.');
  });

  function handleComplete() {
    props.onComplete({ ward_level: wardLevel() });
  }

  return (
    <PhasePanel title="Ward Configuration" subtitle="Power without control leads to instability.">
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '24px' }}>
        <div class={styles.field}>
          <label class={styles.label}>Defense Level</label>
          <ToggleGroup
            value={wardLevel()}
            onChange={(val) => {
              if (val) {
                setPaused(true);
                setWardLevel(val as WardLevel);
              }
            }}
            class={styles.selectGroup}
          >
            <For each={wardOptions}>
              {(option) => (
                <ToggleGroup.Item
                  value={option.value}
                  class={styles.selectOption}
                >
                  <span class={styles.toggleTitle}>{option.label}</span>
                  <Show when={option.value === 'balanced'}>
                    <span class={styles.label}>recommended</span>
                  </Show>
                  <span class={styles.toggleDesc}>{option.desc}</span>
                </ToggleGroup.Item>
              )}
            </For>
          </ToggleGroup>
        </div>

        <div style={{ display: 'flex', 'justify-content': 'center' }}>
          <button
            class={buttonRecipe({ variant: 'primary', size: 'lg' })}
            onClick={handleComplete}
          >
            Activate Wards
          </button>
        </div>
      </div>

      <AutoTimer
        timeout={5000}
        onResolve={handleComplete}
        message="No selection made. Balanced configuration applied."
        paused={paused()}
      />
    </PhasePanel>
  );
}
