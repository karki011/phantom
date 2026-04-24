// PhantomOS v2 — Settings > Features section
// Author: Subash Karki

import { createSignal, onMount } from 'solid-js';
import { Switch as KobalteSwitch } from '@kobalte/core/switch';
import { getPreference } from '../../../core/bindings';
import { setPref } from '../../../core/signals/preferences';
import * as styles from '../SettingsDialog.css';

export default function FeaturesSection() {
  const [gamification, setGamification] = createSignal(false);
  const [conciseMode, setConciseMode] = createSignal(false);
  const [wardsEnabled, setWardsEnabled] = createSignal(false);

  onMount(async () => {
    const savedGamification = await getPreference('gamification');
    if (savedGamification === 'true') setGamification(true);

    const savedCaveman = await getPreference('caveman');
    if (savedCaveman === 'true') setConciseMode(true);

    const savedWards = await getPreference('wards_enabled');
    if (savedWards === 'true') setWardsEnabled(true);
  });

  function handleGamificationChange(checked: boolean) {
    setGamification(checked);
    void setPref('gamification', String(checked));
  }

  function handleConciseModeChange(checked: boolean) {
    setConciseMode(checked);
    void setPref('caveman', String(checked));
  }

  function handleWardsChange(checked: boolean) {
    setWardsEnabled(checked);
    void setPref('wards_enabled', String(checked));
  }

  return (
    <div class={styles.sectionRoot}>
      {/* Gamification */}
      <div class={styles.settingGroup}>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Gamification</div>
            <div class={styles.settingDescription}>
              Enable XP, ranks, and achievement tracking for your workflow
            </div>
          </div>
          <KobalteSwitch
            class={styles.switchRoot}
            checked={gamification()}
            onChange={handleGamificationChange}
          >
            <KobalteSwitch.Input />
            <KobalteSwitch.Control class={styles.switchControl}>
              <KobalteSwitch.Thumb class={styles.switchThumb} />
            </KobalteSwitch.Control>
          </KobalteSwitch>
        </div>
      </div>

      {/* Concise Mode */}
      <div class={styles.settingGroup}>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Concise Mode</div>
            <div class={styles.settingDescription}>
              Reduce UI text and descriptions to their essentials
            </div>
          </div>
          <KobalteSwitch
            class={styles.switchRoot}
            checked={conciseMode()}
            onChange={handleConciseModeChange}
          >
            <KobalteSwitch.Input />
            <KobalteSwitch.Control class={styles.switchControl}>
              <KobalteSwitch.Thumb class={styles.switchThumb} />
            </KobalteSwitch.Control>
          </KobalteSwitch>
        </div>
      </div>

      {/* Ward System */}
      <div class={styles.settingGroup}>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Ward System</div>
            <div class={styles.settingDescription}>
              Evaluate safety rules against Claude tool calls — block, confirm, or warn on risky operations
            </div>
          </div>
          <KobalteSwitch
            class={styles.switchRoot}
            checked={wardsEnabled()}
            onChange={handleWardsChange}
          >
            <KobalteSwitch.Input />
            <KobalteSwitch.Control class={styles.switchControl}>
              <KobalteSwitch.Thumb class={styles.switchThumb} />
            </KobalteSwitch.Control>
          </KobalteSwitch>
        </div>
      </div>
    </div>
  );
}
