// PhantomOS v2 — Terminal theme system
// Author: Subash Karki

import type { ITheme } from '@xterm/xterm';
import { TERMINAL_THEMES as THEMES_RAW } from './theme-data.generated';
export type { TerminalThemeDefinition } from './theme-data.generated';

export const APP_THEME_DEFAULT_ID = '__app_theme__';

export const TERMINAL_THEMES = THEMES_RAW;

export const TERMINAL_THEMES_BY_ID = new Map(
  THEMES_RAW.map((t) => [t.id, t]),
);

export const getTerminalThemeById = (id: string) => {
  return TERMINAL_THEMES_BY_ID.get(id);
};
