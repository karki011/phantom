// PhantomOS v2 — Settings > Appearance section
// Author: Subash Karki

import { For } from 'solid-js';
import { buttonRecipe } from '../../../styles/recipes.css';
import {
  applyTheme,
  activeTheme,
  applyFontStyle,
  activeFontStyle,
  type ThemeId,
  type FontStyleId,
} from '../../../core/signals/theme';
import {
  activeZoom,
  applyZoom,
  ZOOM_LEVELS,
  type ZoomLevelId,
} from '../../../core/signals/zoom';
import * as styles from '../SettingsDialog.css';

const THEME_SWATCHES: { id: ThemeId; label: string; accent: string; bg: string }[] = [
  { id: 'system-core-dark',      label: 'System Core',    accent: '#56CCFF', bg: '#060B14' },
  { id: 'shadow-monarch-dark',   label: 'Shadow Monarch', accent: '#8B5CFF', bg: '#050309' },
  { id: 'hunter-rank-dark',      label: 'Hunter Rank',    accent: '#3DDC97', bg: '#0A0E10' },
  { id: 'cz-dark',               label: 'CloudZero',      accent: '#4599ac', bg: '#0d0d10' },
  { id: 'cyberpunk',             label: 'Cyberpunk',      accent: '#ec4899', bg: '#0a0a1a' },
  { id: 'dracula',               label: 'Dracula',        accent: '#bd93f9', bg: '#282a36' },
  { id: 'nord-dark',             label: 'Nord Dark',      accent: '#88c0d0', bg: '#2e3440' },
  { id: 'system-core-light',     label: 'System Light',   accent: '#169DDB', bg: '#F4FAFF' },
  { id: 'shadow-monarch-light',  label: 'Monarch Light',  accent: '#6F45E8', bg: '#FAF7FF' },
  { id: 'hunter-rank-light',     label: 'Hunter Light',   accent: '#12B76A', bg: '#F5FAF8' },
  { id: 'cz-light',              label: 'CZ Light',       accent: '#2286a1', bg: '#f1f1f4' },
  { id: 'nord-light',            label: 'Nord Light',     accent: '#5e81ac', bg: '#eceff4' },
];

const FONT_STYLES: { id: FontStyleId; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'mono',   label: 'Mono' },
  { id: 'gaming', label: 'Gaming' },
];

export default function AppearanceSection() {
  return (
    <div class={styles.sectionRoot}>
      {/* Theme */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>Theme</span>
        <div class={styles.themeGrid}>
          <For each={THEME_SWATCHES}>
            {(swatch) => {
              const isActive = () => activeTheme() === swatch.id;
              return (
                <button
                  type="button"
                  class={styles.themeSwatch}
                  classList={{ [styles.themeSwatchActive]: isActive() }}
                  onClick={() => applyTheme(swatch.id)}
                  title={swatch.label}
                  style={{
                    '--swatch-accent': swatch.accent,
                    '--swatch-bg': swatch.bg,
                  }}
                >
                  <div
                    class={styles.themeSwatchCircle}
                    style={{ background: swatch.accent }}
                  />
                  <span class={styles.themeSwatchLabel}>{swatch.label}</span>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Font Style */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>Font Style</span>
        <div class={styles.segmentedControl}>
          <For each={FONT_STYLES}>
            {(fs) => (
              <button
                type="button"
                class={buttonRecipe({
                  variant: activeFontStyle() === fs.id ? 'primary' : 'ghost',
                  size: 'sm',
                })}
                onClick={() => applyFontStyle(fs.id)}
              >
                {fs.label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Zoom Level */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>Zoom Level</span>
        <div class={styles.segmentedControl}>
          <For each={ZOOM_LEVELS}>
            {(level) => (
              <button
                type="button"
                class={buttonRecipe({
                  variant: activeZoom() === level.id ? 'primary' : 'ghost',
                  size: 'sm',
                })}
                onClick={() => applyZoom(level.id as ZoomLevelId)}
              >
                {level.label}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
