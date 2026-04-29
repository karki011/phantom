// PhantomOS v2 — Settings > System section
// Author: Subash Karki

import { For } from 'solid-js';
import { RotateCcw, Keyboard, Info, Compass } from 'lucide-solid';
import { APP_NAME, APP_AUTHOR } from '../../../core/branding';
import { buttonRecipe } from '../../../styles/recipes.css';
import { setPreference } from '../../../core/bindings';
import { setPref } from '../../../core/signals/preferences';
import { startTour } from '../../../core/tour/tour';
import { closeSettings } from '../../../core/signals/settings';
import { showWarningToast } from '../../Toast/Toast';
import * as styles from '../SettingsDialog.css';

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Cmd + =',  description: 'Zoom in' },
  { keys: 'Cmd + -',  description: 'Zoom out' },
  { keys: 'Cmd + 0',  description: 'Reset zoom' },
  { keys: 'Cmd + ,',  description: 'Open settings' },
  { keys: 'Cmd + F',  description: 'Search in terminal' },
];

export default function SystemSection() {
  async function handleReinitialize() {
    try {
      await setPreference('onboarding_completed', '');
      showWarningToast('System Re-initialized', 'Reloading application...');
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      showWarningToast('Failed to re-initialize', 'Please try again');
    }
  }

  async function handleReplayTour() {
    await setPref('tour_completed', '');
    closeSettings();
    setTimeout(() => startTour(), 200);
  }

  return (
    <div class={styles.sectionRoot}>
      {/* Replay Tour */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>Guided Tour</span>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Replay Tour</div>
            <div class={styles.settingDescription}>
              Walk through the System interface again
            </div>
          </div>
          <button
            type="button"
            class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
            onClick={handleReplayTour}
          >
            <span class={styles.inlineIconLabel}>
              <Compass size={14} />
              Start Tour
            </span>
          </button>
        </div>
      </div>

      {/* Re-initialize */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>Danger Zone</span>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Re-initialize System</div>
            <div class={styles.settingDescription}>
              Reset onboarding and reload the application
            </div>
          </div>
          <button
            type="button"
            class={buttonRecipe({ variant: 'danger', size: 'sm' })}
            onClick={handleReinitialize}
          >
            <span class={styles.inlineIconLabel}>
              <RotateCcw size={14} />
              Re-initialize System
            </span>
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>
          <span class={styles.inlineIconLabel}>
            <Keyboard size={14} />
            Keyboard Shortcuts
          </span>
        </span>
        <div class={styles.shortcutList}>
          <For each={SHORTCUTS}>
            {(shortcut) => (
              <div class={styles.shortcutRow}>
                <kbd class={styles.shortcutKeys}>{shortcut.keys}</kbd>
                <span class={styles.shortcutDescription}>{shortcut.description}</span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* About */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>
          <span class={styles.inlineIconLabel}>
            <Info size={14} />
            About
          </span>
        </span>
        <div class={styles.aboutBlock}>
          <span class={styles.aboutTitle}>
            {APP_NAME} v2
          </span>
          <span class={styles.aboutAuthor}>
            Author: {APP_AUTHOR}
          </span>
        </div>
      </div>
    </div>
  );
}
