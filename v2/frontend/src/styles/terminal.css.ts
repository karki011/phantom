// PhantomOS v2 — Terminal pane styles (Vanilla Extract)
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
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
