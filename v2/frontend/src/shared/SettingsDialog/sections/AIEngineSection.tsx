// Phantom — Settings > AI Engine section
// Author: Subash Karki

import { createSignal, For, onMount } from 'solid-js';
import { Switch as KobalteSwitch } from '@kobalte/core/switch';
import { getPreference } from '../../../core/bindings';
import { setPref } from '../../../core/signals/preferences';
import { AI_FEATURES, defaultAIState } from '../../../screens/onboarding/config/ai-features';
import { buttonRecipe } from '../../../styles/recipes.css';
import * as styles from '../SettingsDialog.css';

export default function AIEngineSection() {
  const [states, setStates] = createSignal<Record<string, boolean>>(defaultAIState());
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    const loaded: Record<string, boolean> = {};
    for (const feature of AI_FEATURES) {
      const saved = await getPreference(feature.key);
      loaded[feature.key] = saved ? saved === 'true' : feature.default;
    }
    setStates(loaded);
    setLoading(false);
  });

  function handleToggle(key: string, checked: boolean) {
    setStates((prev) => ({ ...prev, [key]: checked }));
    void setPref(key, String(checked));
  }

  function disableAll() {
    const next: Record<string, boolean> = {};
    for (const f of AI_FEATURES) {
      next[f.key] = false;
      void setPref(f.key, 'false');
    }
    setStates(next);
  }

  function resetDefaults() {
    const next = defaultAIState();
    for (const [k, v] of Object.entries(next)) {
      void setPref(k, String(v));
    }
    setStates(next);
  }

  return (
    <div class={styles.sectionRoot}>
      <For each={AI_FEATURES}>
        {(feature) => (
          <div class={styles.settingGroup}>
            <div class={styles.settingRow}>
              <div>
                <div class={styles.settingLabel}>{feature.label}</div>
                <div class={styles.settingDescription}>{feature.description}</div>
              </div>
              <KobalteSwitch
                class={styles.switchRoot}
                checked={!loading() && (states()[feature.key] ?? feature.default)}
                onChange={(checked) => handleToggle(feature.key, checked)}
                disabled={loading()}
              >
                <KobalteSwitch.Input />
                <KobalteSwitch.Control class={styles.switchControl}>
                  <KobalteSwitch.Thumb class={styles.switchThumb} />
                </KobalteSwitch.Control>
              </KobalteSwitch>
            </div>
          </div>
        )}
      </For>

      <div class={styles.detectButtonRow}>
        <button
          class={buttonRecipe({ variant: 'outline', size: 'sm' })}
          onClick={disableAll}
        >
          Disable All
        </button>
        <button
          class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
          onClick={resetDefaults}
        >
          Reset Defaults
        </button>
      </div>
    </div>
  );
}
