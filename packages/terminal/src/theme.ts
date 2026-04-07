/**
 * Terminal color themes mapped from PhantomOS CSS custom properties.
 * @author Subash Karki
 */
import type { ITheme } from '@xterm/xterm';

const css = (prop: string, fallback: string): string =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(prop)
    .trim() || fallback;

export const getTerminalTheme = (): ITheme => ({
  background: css('--phantom-surface-bg', '#000000'),
  foreground: css('--phantom-text-primary', '#f8f8f2'),
  cursor: css('--phantom-accent-glow', '#4599ac'),
  cursorAccent: '#000000',
  selectionBackground: 'rgba(69, 153, 172, 0.3)',
  // ANSI colors
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
});
