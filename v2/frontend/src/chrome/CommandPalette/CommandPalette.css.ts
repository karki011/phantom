// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';
import { fadeIn } from '../../styles/animations.css';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  background: `color-mix(in srgb, ${vars.color.bgPrimary} 70%, transparent)`,
  backdropFilter: 'blur(8px)',
  zIndex: 200,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '120px',
});

export const palette = style({
  width: '480px',
  maxHeight: '400px',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  overflow: 'hidden',
  boxShadow: vars.shadow.lg,
  display: 'flex',
  flexDirection: 'column',
  animation: `${fadeIn} ${vars.animation.fast} ease-out`,
});

export const searchRow = style({
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const searchIcon = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.lg,
});

export const searchInput = style({
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.md,
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const resultList = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.xs} 0`,
});

export const resultItem = style({
  padding: `${vars.space.sm} ${vars.space.lg}`,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast}`,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const resultItemSelected = style({
  background: vars.color.bgActive,
  color: vars.color.accent,
});

export const resultIcon = style({
  fontSize: '18px',
  width: '28px',
  textAlign: 'center',
  color: vars.color.textSecondary,
});

export const resultLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
});

export const resultHint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  marginLeft: 'auto',
});

export const empty = style({
  padding: vars.space.xl,
  textAlign: 'center',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
});
