// Phantom — Settings > Appearance section
// Author: Subash Karki

import { For, Show, createMemo } from 'solid-js';
import { Check } from 'lucide-solid';
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
import {
  activeBrightness,
  applyBrightness,
  MIN_BRIGHTNESS,
  MAX_BRIGHTNESS,
} from '../../../core/signals/brightness';
import * as styles from '../SettingsDialog.css';

const THEME_SWATCHES: { id: ThemeId; label: string; accent: string; bg: string }[] = [
  { id: 'system-core-dark',      label: 'System Core',    accent: '#56CCFF', bg: '#060B14' },
  { id: 'shadow-monarch-dark',   label: 'Shadow Monarch', accent: '#8B5CFF', bg: '#050309' },
  { id: 'hunter-rank-dark',      label: 'Hunter Rank',    accent: '#3DDC97', bg: '#0A0E10' },
  { id: 'teal-dark',             label: 'Teal Dark',      accent: '#4599ac', bg: '#0d0d10' },
  { id: 'cyberpunk',             label: 'Cyberpunk',      accent: '#ec4899', bg: '#0a0a1a' },
  { id: 'dracula',               label: 'Dracula',        accent: '#bd93f9', bg: '#282a36' },
  { id: 'nord-dark',             label: 'Nord Dark',      accent: '#88c0d0', bg: '#2e3440' },
  { id: 'system-core-light',     label: 'System Light',   accent: '#169DDB', bg: '#F4FAFF' },
  { id: 'shadow-monarch-light',  label: 'Monarch Light',  accent: '#6F45E8', bg: '#FAF7FF' },
  { id: 'hunter-rank-light',     label: 'Hunter Light',   accent: '#12B76A', bg: '#F5FAF8' },
  { id: 'teal-light',            label: 'Teal Light',     accent: '#2286a1', bg: '#f1f1f4' },
  { id: 'nord-light',            label: 'Nord Light',     accent: '#5e81ac', bg: '#eceff4' },
  { id: 'one-dark-pro',           label: 'One Dark',       accent: '#61afef', bg: '#282c34' },
  { id: 'github-dark',            label: 'GitHub Dark',    accent: '#58a6ff', bg: '#0d1117' },
  { id: 'catppuccin',             label: 'Catppuccin',     accent: '#cba6f7', bg: '#1e1e2e' },
  { id: 'rose-pine',              label: 'Rosé Pine',      accent: '#c4a7e7', bg: '#191724' },
  { id: 'tokyo-night',            label: 'Tokyo Night',    accent: '#7aa2f7', bg: '#1a1b26' },
  { id: 'gruvbox',                label: 'Gruvbox',        accent: '#fe8019', bg: '#282828' },
  { id: 'solarized-dark',         label: 'Solarized',      accent: '#268bd2', bg: '#002b36' },
  { id: 'ayu-dark',               label: 'Ayu Dark',       accent: '#e6b450', bg: '#0b0e14' },
  { id: 'kanagawa',               label: 'Kanagawa',       accent: '#7e9cd8', bg: '#1f1f28' },
  { id: 'vscode-dark',            label: 'VS Code',        accent: '#4fc1ff', bg: '#1f1f1f' },
];

const FONT_STYLES: { id: FontStyleId; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'mono',   label: 'Mono' },
  { id: 'gaming', label: 'Gaming' },
];

export default function AppearanceSection() {
  const activeThemeLabel = createMemo(() =>
    THEME_SWATCHES.find((s) => s.id === activeTheme())?.label ?? activeTheme(),
  );

  return (
    <div class={styles.sectionRoot}>
      {/* Theme */}
      <div class={styles.settingGroup}>
        <span class={styles.settingGroupHeader}>Theme</span>
        <span class={styles.themeSelectedLabel}>
          Selected: <strong>{activeThemeLabel()}</strong>
        </span>
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
                  aria-pressed={isActive()}
                  style={{
                    '--swatch-accent': swatch.accent,
                    '--swatch-bg': swatch.bg,
                  }}
                >
                  <Show when={isActive()}>
                    <span class={styles.themeSwatchCheck}>
                      <Check size={10} strokeWidth={3} />
                    </span>
                  </Show>
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
        <span class={styles.settingGroupHeader}>Font Style</span>
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
        <span class={styles.settingGroupHeader}>Zoom Level</span>
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

      {/* Font Size */}
      <div class={styles.settingGroup}>
        <span class={styles.settingGroupHeader}>
          Font Size · {Math.round(16 * (ZOOM_LEVELS.find(z => z.id === activeZoom())?.scale ?? 1))}px
        </span>
        <input
          type="range"
          class={styles.sliderInput}
          min={0}
          max={ZOOM_LEVELS.length - 1}
          step={1}
          value={ZOOM_LEVELS.findIndex(z => z.id === activeZoom())}
          onInput={(e) => {
            const idx = Number(e.currentTarget.value);
            if (ZOOM_LEVELS[idx]) applyZoom(ZOOM_LEVELS[idx].id as ZoomLevelId);
          }}
        />
      </div>

      {/* Brightness */}
      <div class={styles.settingGroup}>
        <span class={styles.settingGroupHeader}>Brightness · {activeBrightness()}%</span>
        <input
          type="range"
          class={styles.sliderInput}
          min={MIN_BRIGHTNESS}
          max={MAX_BRIGHTNESS}
          step={5}
          value={activeBrightness()}
          onInput={(e) => applyBrightness(Number(e.currentTarget.value))}
        />
      </div>
    </div>
  );
}
