// PhantomOS v2 — Settings > Editor section
// Author: Subash Karki

import { createSignal, onMount } from 'solid-js';
import { getPreference, setPreference } from '../../../core/bindings';
import * as styles from '../SettingsDialog.css';

const DEFAULTS = { fontSize: 13, lineHeight: 20 };
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const MIN_LINE_HEIGHT = 14;
const MAX_LINE_HEIGHT = 40;

export default function EditorSection() {
  const [fontSize, setFontSize] = createSignal(DEFAULTS.fontSize);
  const [lineHeight, setLineHeight] = createSignal(DEFAULTS.lineHeight);

  onMount(async () => {
    const savedSize = await getPreference('editor_fontSize');
    if (savedSize) setFontSize(Number(savedSize));

    const savedLh = await getPreference('editor_lineHeight');
    if (savedLh) setLineHeight(Number(savedLh));
  });

  const updateFontSize = (value: number) => {
    const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, value));
    setFontSize(clamped);
    void setPreference('editor_fontSize', String(clamped));
    window.dispatchEvent(new CustomEvent('phantom:editor-settings-changed', { detail: { fontSize: clamped } }));
  };

  const updateLineHeight = (value: number) => {
    const clamped = Math.max(MIN_LINE_HEIGHT, Math.min(MAX_LINE_HEIGHT, value));
    setLineHeight(clamped);
    void setPreference('editor_lineHeight', String(clamped));
    window.dispatchEvent(new CustomEvent('phantom:editor-settings-changed', { detail: { lineHeight: clamped } }));
  };

  const reset = () => {
    updateFontSize(DEFAULTS.fontSize);
    updateLineHeight(DEFAULTS.lineHeight);
  };

  return (
    <div class={styles.sectionRoot}>
      {/* Font Size */}
      <div class={styles.settingGroup}>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Font Size</div>
            <div class={styles.settingDescription}>
              {MIN_FONT_SIZE}–{MAX_FONT_SIZE}px — applies to all editor panes
            </div>
          </div>
          <div class={styles.segmentedControl}>
            <button
              type="button"
              class={styles.segmentedButton}
              onClick={() => updateFontSize(fontSize() - 1)}
            >
              −
            </button>
            <span class={styles.segmentedButton} style={{ cursor: 'default', 'min-width': '48px', 'text-align': 'center' }}>
              {fontSize()}px
            </span>
            <button
              type="button"
              class={styles.segmentedButton}
              onClick={() => updateFontSize(fontSize() + 1)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Line Height */}
      <div class={styles.settingGroup}>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Line Height</div>
            <div class={styles.settingDescription}>
              {MIN_LINE_HEIGHT}–{MAX_LINE_HEIGHT}px
            </div>
          </div>
          <div class={styles.segmentedControl}>
            <button
              type="button"
              class={styles.segmentedButton}
              onClick={() => updateLineHeight(lineHeight() - 1)}
            >
              −
            </button>
            <span class={styles.segmentedButton} style={{ cursor: 'default', 'min-width': '48px', 'text-align': 'center' }}>
              {lineHeight()}px
            </span>
            <button
              type="button"
              class={styles.segmentedButton}
              onClick={() => updateLineHeight(lineHeight() + 1)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Reset */}
      <div class={styles.settingGroup}>
        <button
          type="button"
          class={styles.segmentedButton}
          onClick={reset}
          style={{ 'align-self': 'flex-start' }}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
