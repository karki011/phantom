// Author: Subash Karki

import { createSignal, For, onMount } from 'solid-js';
import { Switch as KobalteSwitch } from '@kobalte/core/switch';
import { playSound } from '../../../core/audio/engine';
import { AI_FEATURES, buildAIPrefs, defaultAIState } from '../config/ai-features';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import { AutoTimer } from '../engine/AutoTimer';
import * as phaseStyles from '../styles/phases.css';
import * as styles from '../styles/ai-consent.css';

interface AIEngineConsentProps {
  onComplete: (data: Record<string, string>) => void;
}

export function AIEngineConsent(props: AIEngineConsentProps) {
  const [states, setStates] = createSignal<Record<string, boolean>>(defaultAIState());
  const [paused, setPaused] = createSignal(false);

  onMount(() => {
    playSound('reveal');
  });

  function toggle(key: string, checked: boolean) {
    setPaused(true);
    setStates((prev) => ({ ...prev, [key]: checked }));
  }

  function enableAll() {
    setPaused(true);
    setStates(Object.fromEntries(AI_FEATURES.map((f) => [f.key, true])));
  }

  function handleConfirm() {
    props.onComplete(buildAIPrefs(states()));
  }

  function handleSkip() {
    // Skip persists nothing — defaults remain unset
    props.onComplete({});
  }

  function handleAutoResolve() {
    // Auto-resolve uses defaults
    props.onComplete(buildAIPrefs(states()));
  }

  return (
    <PhasePanel title="AI Engine" subtitle="Select which capabilities the AI engine should activate.">
      <div
        class={phaseStyles.phaseStack}
        onPointerDown={() => setPaused(true)}
        onKeyDown={() => setPaused(true)}
      >
        <div class={styles.featureList}>
          <For each={AI_FEATURES}>
            {(feature) => (
              <div class={phaseStyles.toggleRow}>
                <div class={phaseStyles.toggleLabel}>
                  <div class={styles.titleRow}>
                    <span class={phaseStyles.toggleTitle}>{feature.label}</span>
                    {feature.recommended && (
                      <span class={styles.recommendedBadge}>Recommended</span>
                    )}
                  </div>
                  <p class={phaseStyles.toggleDesc}>{feature.description}</p>
                </div>
                <KobalteSwitch
                  class={phaseStyles.switchRoot}
                  checked={states()[feature.key]}
                  onChange={(checked) => toggle(feature.key, checked)}
                >
                  <KobalteSwitch.Input />
                  <KobalteSwitch.Control class={phaseStyles.switchControl}>
                    <KobalteSwitch.Thumb class={phaseStyles.switchThumb} />
                  </KobalteSwitch.Control>
                </KobalteSwitch>
              </div>
            )}
          </For>
        </div>

        <div class={styles.actionRow}>
          <button
            class={buttonRecipe({ variant: 'outline', size: 'md' })}
            onClick={enableAll}
          >
            Enable All
          </button>
          <button
            class={buttonRecipe({ variant: 'primary', size: 'lg' })}
            onClick={handleConfirm}
          >
            Confirm
          </button>
        </div>
        <div class={styles.skipRow}>
          <button
            class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
            onClick={handleSkip}
          >
            Skip
          </button>
        </div>
      </div>

      <AutoTimer
        timeout={10000}
        onResolve={handleAutoResolve}
        message="Using default configuration."
        paused={paused()}
      />
    </PhasePanel>
  );
}
