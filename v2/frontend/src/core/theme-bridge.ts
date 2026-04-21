// PhantomOS v2 — Theme bridge for xterm.js
// Author: Subash Karki

import { vars } from '../styles/theme.css';

// Resolves a vanilla-extract CSS custom property expression to its computed value.
// vars.color.terminalBg produces "var(--abc123hash)" — xterm.js needs actual hex values.
function resolveVar(varExpr: string): string {
  const match = varExpr.match(/var\(([^)]+)\)/);
  if (!match) return varExpr;
  return getComputedStyle(document.body).getPropertyValue(match[1]).trim() || varExpr;
}

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export function getXtermTheme(): XtermTheme {
  return {
    background: resolveVar(vars.color.terminalBg) || '#0a0a1a',
    foreground: resolveVar(vars.color.terminalText) || '#e0def4',
    cursor: resolveVar(vars.color.terminalCursor) || '#b794f6',
    selectionBackground: resolveVar(vars.color.terminalSelection) || '#32264D80',
    // ANSI 16 colors — derived from common dark theme conventions
    black: '#1a1a2e',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e0def4',
    brightBlack: '#4a4a6a',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fcd34d',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  };
}
