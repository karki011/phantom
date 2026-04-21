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
  contain: 'strict',
});

const textGlow = keyframes({
  '0%, 100%': { textShadow: `0 0 10px ${vars.color.accentGlow}` },
  '50%': { textShadow: `0 0 25px ${vars.color.accent}, 0 0 50px ${vars.color.accentGlow}` },
});

const scanline = keyframes({
  '0%': { top: '-2px' },
  '100%': { top: '100%' },
});

export const loadingOverlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: vars.color.terminalBg,
  zIndex: 5,
  overflow: 'hidden',
});

export const loadingText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.accent,
  letterSpacing: '0.15em',
  animation: `${textGlow} 3s ease-in-out infinite`,
});

export const loadingScanline = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: '2px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  opacity: 0.4,
  animation: `${scanline} 2s linear infinite`,
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
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `2px ${vars.space.sm}`,
  width: '180px',
  outline: 'none',
  ':focus': {
    borderColor: vars.color.borderFocus,
  },
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
