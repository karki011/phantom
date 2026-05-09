// Phantom — Settings > Features section
// Author: Subash Karki

import { createSignal, onMount } from 'solid-js';
import { Switch as KobalteSwitch } from '@kobalte/core/switch';
import { getPreference } from '../../../core/bindings';
import { setPref } from '../../../core/signals/preferences';
import { composerV2Enabled, setComposerV2Enabled } from '../../../core/composer/preferences';
import * as styles from '../SettingsDialog.css';

export default function FeaturesSection() {
  const [conciseMode, setConciseMode] = createSignal(false);
  const [wardsEnabled, setWardsEnabled] = createSignal(false);

  onMount(async () => {
    const savedCaveman = await getPreference('caveman');
    if (savedCaveman === 'true') setConciseMode(true);

    const savedWards = await getPreference('wards_enabled');
    if (savedWards === 'true') setWardsEnabled(true);
  });

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
              Evaluate safety rules against AI tool calls — block, confirm, or warn on risky operations
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

      {/* Composer V2 */}
      <div class={styles.settingGroup}>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Use Composer V2 (experimental)</div>
            <div class={styles.settingDescription}>
              Routes new composer sessions to the V2 engine with stream-JSON IPC,
              multi-session support, and improved performance. V1 sessions continue
              using V1 until closed.
            </div>
          </div>
          <KobalteSwitch
            class={styles.switchRoot}
            checked={composerV2Enabled()}
            onChange={(checked: boolean) => void setComposerV2Enabled(checked)}
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
