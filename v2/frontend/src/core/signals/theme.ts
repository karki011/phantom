// Author: Subash Karki

import { createSignal } from 'solid-js';
import {
  systemCoreDarkTheme,
  systemCoreLightTheme,
  shadowMonarchDarkTheme,
  shadowMonarchLightTheme,
  hunterRankDarkTheme,
  hunterRankLightTheme,
  czDarkTheme,
  czLightTheme,
  cyberpunkTheme,
  draculaTheme,
  nordDarkTheme,
  nordLightTheme,
} from '../../styles/theme.css';
import { getPref, setPref } from './preferences';
import { vars } from '../../styles/theme.css';

export type ThemeId =
  | 'system-core-dark'
  | 'system-core-light'
  | 'shadow-monarch-dark'
  | 'shadow-monarch-light'
  | 'hunter-rank-dark'
  | 'hunter-rank-light'
  | 'cz-dark'
  | 'cz-light'
  | 'cyberpunk'
  | 'dracula'
  | 'nord-dark'
  | 'nord-light';

const [activeTheme, setActiveTheme] = createSignal<ThemeId>('shadow-monarch-dark');

const themeClassMap: Record<ThemeId, string> = {
  'system-core-dark': systemCoreDarkTheme,
  'system-core-light': systemCoreLightTheme,
  'shadow-monarch-dark': shadowMonarchDarkTheme,
  'shadow-monarch-light': shadowMonarchLightTheme,
  'hunter-rank-dark': hunterRankDarkTheme,
  'hunter-rank-light': hunterRankLightTheme,
  'cz-dark': czDarkTheme,
  'cz-light': czLightTheme,
  'cyberpunk': cyberpunkTheme,
  'dracula': draculaTheme,
  'nord-dark': nordDarkTheme,
  'nord-light': nordLightTheme,
};

export function applyTheme(theme: ThemeId): void {
  const prev = activeTheme();
  if (prev) {
    document.body.classList.remove(themeClassMap[prev]);
  }
  document.body.classList.add(themeClassMap[theme]);
  setActiveTheme(theme);
  void setPref('theme', theme);

  // When the terminal is using "Use App Theme", re-resolve CSS vars after the
  // theme class swap so existing terminals pick up the new app theme colors.
  requestAnimationFrame(() => {
    // Lazy import to avoid circular dependency at module init time
    import('../terminal/theme-manager').then(({ refreshAppThemeTerminals, activeTerminalThemeId }) => {
      // Import the constant separately to avoid pulling in the generated data eagerly
      const APP_THEME_ID = '__app_theme__';
      if (activeTerminalThemeId() !== APP_THEME_ID) return;

      const cs = getComputedStyle(document.body);
      const resolve = (cssVar: string, fallback: string): string => {
        const raw = cssVar.replace(/^var\(/, '').replace(/\)$/, '');
        return cs.getPropertyValue(raw).trim() || fallback;
      };

      refreshAppThemeTerminals({
        background: resolve(vars.color.terminalBg, '#0a0a1a'),
        foreground: resolve(vars.color.terminalText, '#e0def4'),
        cursor: resolve(vars.color.terminalCursor, '#b794f6'),
        selectionBackground: resolve(vars.color.terminalSelection, 'rgba(139,92,255,0.3)'),
      });
    });
  });
}

export function initTheme(savedTheme: string): void {
  const validIds: ThemeId[] = [
    'system-core-dark',
    'system-core-light',
    'shadow-monarch-dark',
    'shadow-monarch-light',
    'hunter-rank-dark',
    'hunter-rank-light',
    'cz-dark',
    'cz-light',
    'cyberpunk',
    'dracula',
    'nord-dark',
    'nord-light',
  ];
  const theme: ThemeId = (validIds.includes(savedTheme as ThemeId) ? savedTheme : 'shadow-monarch-dark') as ThemeId;
  applyTheme(theme);
}

export { activeTheme };

// Font style system

export type FontStyleId = 'system' | 'mono' | 'gaming';

const [activeFontStyle, setActiveFontStyle] = createSignal<FontStyleId>('system');

const fontStyleMap: Record<FontStyleId, { body: string; mono: string; display: string }> = {
  system: {
    body: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    mono: '"Hack", "JetBrains Mono", "Fira Code", "SF Mono", monospace',
    display: '"SF Pro Display", system-ui, sans-serif',
  },
  mono: {
    body: '"JetBrains Mono", "Fira Code", monospace',
    mono: '"Hack", "JetBrains Mono", "Fira Code", "SF Mono", monospace',
    display: '"JetBrains Mono", "Fira Code", monospace',
  },
  gaming: {
    body: '"Orbitron", "Rajdhani", system-ui, sans-serif',
    mono: '"Hack", "Share Tech Mono", "JetBrains Mono", monospace',
    display: '"Orbitron", "Rajdhani", system-ui, sans-serif',
  },
};

export function applyFontStyle(id: FontStyleId): void {
  setActiveFontStyle(id);
  const fonts = fontStyleMap[id];
  document.documentElement.style.setProperty('--font-body-override', fonts.body);
  document.documentElement.style.setProperty('--font-mono-override', fonts.mono);
  document.documentElement.style.setProperty('--font-display-override', fonts.display);
  void setPref('font_style', id);
}

export function initFontStyle(saved: string): void {
  const id: FontStyleId = (['system', 'mono', 'gaming'].includes(saved) ? saved : 'system') as FontStyleId;
  applyFontStyle(id);
}

export { activeFontStyle };

/**
 * Returns the raw mono font-family string for the active font style.
 * Reactive — tracks activeFontStyle() so callers (e.g. xterm.js) can
 * subscribe and update live when the user switches font styles.
 */
export function currentMonoFont(): string {
  return fontStyleMap[activeFontStyle()].mono;
}
