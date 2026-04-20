// Author: Subash Karki

import { createSignal } from 'solid-js';
import {
  systemCoreDarkTheme,
  systemCoreLightTheme,
  shadowMonarchDarkTheme,
  shadowMonarchLightTheme,
  hunterRankDarkTheme,
  hunterRankLightTheme,
} from '../../styles/theme.css';
import { getPref, setPref } from './preferences';

export type ThemeId =
  | 'system-core-dark'
  | 'system-core-light'
  | 'shadow-monarch-dark'
  | 'shadow-monarch-light'
  | 'hunter-rank-dark'
  | 'hunter-rank-light';

const [activeTheme, setActiveTheme] = createSignal<ThemeId>('shadow-monarch-dark');

const themeClassMap: Record<ThemeId, string> = {
  'system-core-dark': systemCoreDarkTheme,
  'system-core-light': systemCoreLightTheme,
  'shadow-monarch-dark': shadowMonarchDarkTheme,
  'shadow-monarch-light': shadowMonarchLightTheme,
  'hunter-rank-dark': hunterRankDarkTheme,
  'hunter-rank-light': hunterRankLightTheme,
};

export function applyTheme(theme: ThemeId): void {
  const prev = activeTheme();
  if (prev) {
    document.body.classList.remove(themeClassMap[prev]);
  }
  document.body.classList.add(themeClassMap[theme]);
  setActiveTheme(theme);
  void setPref('theme', theme);
}

export function initTheme(savedTheme: string): void {
  const validIds: ThemeId[] = [
    'system-core-dark',
    'system-core-light',
    'shadow-monarch-dark',
    'shadow-monarch-light',
    'hunter-rank-dark',
    'hunter-rank-light',
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
    mono: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
    display: '"SF Pro Display", system-ui, sans-serif',
  },
  mono: {
    body: '"JetBrains Mono", "Fira Code", monospace',
    mono: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
    display: '"JetBrains Mono", "Fira Code", monospace',
  },
  gaming: {
    body: '"Orbitron", "Rajdhani", system-ui, sans-serif',
    mono: '"Share Tech Mono", "JetBrains Mono", monospace',
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
