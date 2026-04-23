// PhantomOS v2 — Switch branch dialog styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
});

export const textFieldRoot = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const textFieldLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

export const textFieldInput = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  selectors: {
    '&:focus': {
      borderColor: vars.color.borderFocus,
      boxShadow: `0 0 0 2px ${vars.color.accentMuted}`,
    },
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const branchList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  maxHeight: '240px',
  overflowY: 'auto',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  padding: vars.space.xs,
});

export const branchItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  width: '100%',
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.accent,
    },
    '&:focus': {
      outline: `1px solid ${vars.color.borderFocus}`,
    },
  },
});

export const emptyState = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  padding: vars.space.md,
  textAlign: 'center',
});

export const loaderWrap = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.md,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});
