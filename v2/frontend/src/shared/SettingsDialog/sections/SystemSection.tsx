// PhantomOS v2 — Settings > System section
// Author: Subash Karki

import { For } from 'solid-js';
import { RotateCcw, Keyboard, Info } from 'lucide-solid';
import { vars } from '../../../styles/theme.css';
import { buttonRecipe } from '../../../styles/recipes.css';
import { setPreference } from '../../../core/bindings';
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
      await setPreference('onboarding_complete', '');
      showWarningToast('System Re-initialized', 'Reloading application...');
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      showWarningToast('Failed to re-initialize', 'Please try again');
    }
  }

  return (
    <div class={styles.sectionRoot}>
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
            <span style={{ display: 'inline-flex', 'align-items': 'center', gap: vars.space.xs }}>
              <RotateCcw size={14} />
              Re-initialize System
            </span>
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: vars.space.xs }}>
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
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: vars.space.xs }}>
            <Info size={14} />
            About
          </span>
        </span>
        <div class={styles.aboutBlock}>
          <span style={{ 'font-family': vars.font.display, 'font-size': vars.fontSize.lg, color: vars.color.textPrimary, 'font-weight': '600' }}>
            PhantomOS v2
          </span>
          <span style={{ 'font-family': vars.font.mono, 'font-size': vars.fontSize.xs, color: vars.color.textSecondary }}>
            Author: Subash Karki
          </span>
        </div>
      </div>
    </div>
  );
}
