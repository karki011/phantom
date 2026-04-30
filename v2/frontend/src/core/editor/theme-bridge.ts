// Phantom — Monaco theme generation from Vanilla Extract tokens
// Author: Subash Karki
//
// Resolves CSS custom property values at runtime and produces a
// complete IStandaloneThemeData for Monaco. Re-registers the theme
// whenever the app theme changes (reactive via createEffect).

import type * as monaco from 'monaco-editor';
import { vars } from '@/styles/theme.css';

/**
 * Convert any CSS color (hex, rgba, rgb) to Monaco-compatible hex (#RRGGBB or #RRGGBBAA).
 */
const toHex = (color: string): string => {
  // Already hex
  if (color.startsWith('#')) return color;

  // rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = Math.round(Number(rgbaMatch[1])).toString(16).padStart(2, '0');
    const g = Math.round(Number(rgbaMatch[2])).toString(16).padStart(2, '0');
    const b = Math.round(Number(rgbaMatch[3])).toString(16).padStart(2, '0');
    const a = rgbaMatch[4] !== undefined
      ? Math.round(Number(rgbaMatch[4]) * 255).toString(16).padStart(2, '0')
      : '';
    return `#${r}${g}${b}${a}`;
  }

  return color;
};

/**
 * Resolve a Vanilla Extract CSS variable expression (e.g. `var(--abc123)`)
 * to its computed value, then convert to hex for Monaco compatibility.
 */
const resolveVar = (varExpr: string, fallback: string): string => {
  const match = varExpr.match(/var\(([^)]+)\)/);
  if (!match) return toHex(varExpr);
  const value = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
  return toHex(value || fallback);
};

/**
 * Detect whether the current theme is light or dark based on the editor
 * background luminance. Returns 'vs' for light themes, 'vs-dark' for dark.
 */
const detectBaseTheme = (editorBg: string): 'vs' | 'vs-dark' => {
  // Parse hex color and compute relative luminance
  const hex = editorBg.replace('#', '');
  if (hex.length < 6) return 'vs-dark';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? 'vs' : 'vs-dark';
};

/**
 * Build a full Monaco IStandaloneThemeData from the currently-active
 * Phantom OS theme tokens. All 10+ themes get Monaco support automatically.
 */
export const buildMonacoTheme = (): monaco.editor.IStandaloneThemeData => {
  const editorBg = resolveVar(vars.color.editorBg, '#060B14');
  const editorGutter = resolveVar(vars.color.editorGutter, '#0D1422');
  const activeLine = resolveVar(vars.color.editorActiveLine, 'rgba(86, 204, 255, 0.06)');
  const selection = resolveVar(vars.color.editorSelection, 'rgba(86, 204, 255, 0.25)');
  const diffAdd = resolveVar(vars.color.editorDiffAdd, 'rgba(46, 230, 166, 0.2)');
  const diffRemove = resolveVar(vars.color.editorDiffRemove, 'rgba(255, 98, 126, 0.2)');
  const textPrimary = resolveVar(vars.color.textPrimary, '#EAF6FF');
  const textSecondary = resolveVar(vars.color.textSecondary, '#9CB2CC');
  const textDisabled = resolveVar(vars.color.textDisabled, '#647894');
  const accent = resolveVar(vars.color.accent, '#56CCFF');
  const border = resolveVar(vars.color.border, '#243552');
  const bgSecondary = resolveVar(vars.color.bgSecondary, '#0D1422');
  const success = resolveVar(vars.color.success, '#2EE6A6');
  const warning = resolveVar(vars.color.warning, '#FFB84D');
  const danger = resolveVar(vars.color.danger, '#FF627E');
  const info = resolveVar(vars.color.info, '#56CCFF');

  return {
    base: detectBaseTheme(editorBg),
    inherit: true,
    rules: [
      // Syntax token colors — inherit from base theme, override key tokens
      { token: 'comment', foreground: textDisabled.replace('#', ''), fontStyle: 'italic' },
      { token: 'keyword', foreground: accent.replace('#', '') },
      { token: 'string', foreground: success.replace('#', '') },
      { token: 'number', foreground: warning.replace('#', '') },
      { token: 'type', foreground: info.replace('#', '') },
      { token: 'function', foreground: textPrimary.replace('#', '') },
      { token: 'variable', foreground: textSecondary.replace('#', '') },
      { token: 'constant', foreground: danger.replace('#', '') },
    ],
    colors: {
      // Editor surface
      'editor.background': editorBg,
      'editor.foreground': textPrimary,
      'editorCursor.foreground': accent,

      // Gutter & line numbers
      'editorGutter.background': editorGutter,
      'editorLineNumber.foreground': textDisabled,
      'editorLineNumber.activeForeground': textSecondary,

      // Active line
      'editor.lineHighlightBackground': activeLine,
      'editor.lineHighlightBorder': '#00000000',

      // Selection
      'editor.selectionBackground': selection,
      'editor.inactiveSelectionBackground': selection,

      // Diff
      'diffEditor.insertedTextBackground': `${success}33`,
      'diffEditor.removedTextBackground': `${danger}33`,
      'diffEditor.insertedLineBackground': `${success}1a`,
      'diffEditor.removedLineBackground': `${danger}1a`,
      'diffEditorGutter.insertedLineBackground': `${success}44`,
      'diffEditorGutter.removedLineBackground': `${danger}44`,

      // Widget surfaces (autocomplete, hover, etc.)
      'editorWidget.background': bgSecondary,
      'editorWidget.border': border,
      'editorSuggestWidget.background': bgSecondary,
      'editorSuggestWidget.border': border,
      'editorSuggestWidget.selectedBackground': activeLine,

      // Scrollbar
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': `${textDisabled}33`,
      'scrollbarSlider.hoverBackground': `${textDisabled}66`,
      'scrollbarSlider.activeBackground': `${textDisabled}99`,

      // Minimap
      'minimap.background': editorBg,

      // Bracket match
      'editorBracketMatch.background': `${accent}22`,
      'editorBracketMatch.border': `${accent}66`,

      // Overview ruler
      'editorOverviewRuler.border': '#00000000',

      // Find match
      'editor.findMatchBackground': `${warning}44`,
      'editor.findMatchHighlightBackground': `${warning}22`,
    },
  };
};

/**
 * Register (or re-register) the Phantom OS theme with a Monaco instance.
 * Call this once after Monaco loads, and again when the app theme changes.
 */
export const registerPhantomTheme = (monacoRef: typeof monaco): void => {
  monacoRef.editor.defineTheme('phantom-theme', buildMonacoTheme());
};
