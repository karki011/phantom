// Phantom — Settings > Terminal section
// Author: Subash Karki

import { createSignal, onMount, For } from 'solid-js';
import { Switch as KobalteSwitch } from '@kobalte/core/switch';
import { buttonRecipe } from '../../../styles/recipes.css';
import { getPreference, setPreference } from '../../../core/bindings';
import * as styles from '../SettingsDialog.css';

type CursorStyle = 'block' | 'bar' | 'underline';

const CURSOR_STYLES: { id: CursorStyle; label: string }[] = [
  { id: 'block',     label: 'Block' },
  { id: 'bar',       label: 'Bar' },
  { id: 'underline', label: 'Underline' },
];

export default function TerminalSection() {
  const [cursorStyle, setCursorStyle] = createSignal<CursorStyle>('bar');
  const [cursorBlink, setCursorBlink] = createSignal(true);

  onMount(async () => {
    const savedStyle = await getPreference('terminal_cursor_style');
    if (savedStyle && ['block', 'bar', 'underline'].includes(savedStyle)) {
      setCursorStyle(savedStyle as CursorStyle);
    }

    const savedBlink = await getPreference('terminal_cursor_blink');
    if (savedBlink !== '') {
      setCursorBlink(savedBlink !== 'false');
    }
  });

  function handleCursorStyleChange(style: CursorStyle) {
    setCursorStyle(style);
    void setPreference('terminal_cursor_style', style);
  }

  function handleCursorBlinkChange(checked: boolean) {
    setCursorBlink(checked);
    void setPreference('terminal_cursor_blink', String(checked));
  }

  return (
    <div class={styles.sectionRoot}>
      {/* Cursor Style */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>Cursor Style</span>
        <div class={styles.segmentedControl}>
          <For each={CURSOR_STYLES}>
            {(cs) => (
              <button
                type="button"
                class={buttonRecipe({
                  variant: cursorStyle() === cs.id ? 'primary' : 'ghost',
                  size: 'sm',
                })}
                onClick={() => handleCursorStyleChange(cs.id)}
              >
                {cs.label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Cursor Blink */}
      <div class={styles.settingGroup}>
        <div class={styles.settingRow}>
          <div>
            <div class={styles.settingLabel}>Cursor Blink</div>
            <div class={styles.settingDescription}>
              Enable blinking animation for the terminal cursor
            </div>
          </div>
          <KobalteSwitch
            class={styles.switchRoot}
            checked={cursorBlink()}
            onChange={handleCursorBlinkChange}
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
