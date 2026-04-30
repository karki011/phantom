// Phantom — Terminal theme manager
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { setPref, loadPref } from '@/core/signals/preferences';
import { APP_THEME_DEFAULT_ID, TERMINAL_THEMES_BY_ID } from './themes';
import { getAllSessions } from './registry';
import type { ITheme } from '@xterm/xterm';

const [activeTerminalThemeId, setActiveTerminalThemeId] = createSignal(APP_THEME_DEFAULT_ID);

export { activeTerminalThemeId };

export const initTerminalTheme = async (): Promise<void> => {
  const saved = await loadPref('terminal_theme');
  if (saved && (saved === APP_THEME_DEFAULT_ID || TERMINAL_THEMES_BY_ID.has(saved))) {
    setActiveTerminalThemeId(saved);
    applyTerminalTheme(saved);
  }
};

export const applyTerminalTheme = (themeId: string): void => {
  setActiveTerminalThemeId(themeId);
  void setPref('terminal_theme', themeId);

  if (themeId === APP_THEME_DEFAULT_ID) {
    // When switching back to "Use App Theme", existing terminals keep their
    // colors until the next app theme change triggers refreshAppThemeTerminals.
    return;
  }

  const def = TERMINAL_THEMES_BY_ID.get(themeId);
  if (!def) return;

  for (const session of getAllSessions()) {
    session.terminal.options.theme = { ...def.colors };
  }
};

export const resolveTerminalTheme = (themeId: string): ITheme | null => {
  if (themeId === APP_THEME_DEFAULT_ID) return null;
  const def = TERMINAL_THEMES_BY_ID.get(themeId);
  return def?.colors ?? null;
};

/** Called when app theme changes while terminal theme is "Use App Theme" */
export const refreshAppThemeTerminals = (resolvedCssTheme: ITheme): void => {
  if (activeTerminalThemeId() !== APP_THEME_DEFAULT_ID) return;
  for (const session of getAllSessions()) {
    session.terminal.options.theme = { ...resolvedCssTheme };
  }
};
