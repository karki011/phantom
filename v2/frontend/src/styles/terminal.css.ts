// PhantomOS v2 — Terminal pane styles (Vanilla Extract)
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

export const terminalWrapper = style({
  width: '100%',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  background: vars.color.terminalBg,
});

export const terminalContainer = style({
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  // 'strict' includes size containment which prevents xterm from measuring
  // the true available width. Use layout+paint only so FitAddon.fit() sees
  // the correct container dimensions.
  contain: 'layout paint',
  // Match Warp's font rendering: subpixel antialiasing for crisp monospace text
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
});

// Hide xterm.js DOM layer text so native selection only shows the highlight,
// not a second copy of the text in a different font. The WebGL canvas renders
// the visible text; the DOM layer exists only for copy/paste and screen readers.
globalStyle('.xterm .xterm-rows', {
  color: 'transparent',
  opacity: 0,
});

globalStyle('.xterm textarea', {
  fontFamily: '"Hack", "JetBrains Mono", "Fira Code", "SF Mono", monospace',
});

export const restoreBanner = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  zIndex: 10,
  pointerEvents: 'none',
});

const slideDown = keyframes({
  from: { opacity: 0, transform: 'translateY(-6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const searchBar = style({
  position: 'absolute',
  top: vars.space.sm,
  right: vars.space.sm,
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.md,
  animation: `${slideDown} ${vars.animation.fast} ease-out`,
});

export const searchInput = style({
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  width: '180px',
  selectors: {
    '&:focus-within': {
      borderColor: vars.color.borderFocus,
    },
  },
});

export const searchInputField = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `2px ${vars.space.sm}`,
  width: '100%',
  outline: 'none',
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const searchButton = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  padding: `2px ${vars.space.sm}`,
  cursor: 'pointer',
  lineHeight: 1.4,
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
    borderColor: vars.color.borderHover,
  },
});

export const searchCloseButton = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  padding: `0 ${vars.space.xs}`,
  lineHeight: 1,
  ':hover': {
    color: vars.color.textPrimary,
  },
});

// Terminal display settings popover
export const settingsPanel = style({
  position: 'absolute',
  top: vars.space.xl,
  right: vars.space.sm,
  zIndex: 30,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.lg,
  padding: vars.space.md,
  minWidth: '200px',
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  animation: `${slideDown} ${vars.animation.fast} ease-out`,
});

export const settingsHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  fontWeight: 600,
  paddingBottom: vars.space.xs,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const settingsResetBtn = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  padding: `1px ${vars.space.sm}`,
  cursor: 'pointer',
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const settingsRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
});

export const settingsControl = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  selectors: {
    '& button': {
      background: 'transparent',
      border: `1px solid ${vars.color.border}`,
      borderRadius: vars.radius.sm,
      color: vars.color.textSecondary,
      width: '20px',
      height: '20px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      lineHeight: 1,
      padding: 0,
    },
    '& button:hover': {
      background: vars.color.bgHover,
      color: vars.color.textPrimary,
      borderColor: vars.color.borderHover,
    },
    '& span': {
      minWidth: '40px',
      textAlign: 'center',
      fontSize: vars.fontSize.xs,
    },
  },
});
