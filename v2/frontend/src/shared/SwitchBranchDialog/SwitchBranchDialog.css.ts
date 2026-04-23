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
  maxHeight: '300px',
  overflowY: 'auto',
  borderRadius: vars.radius.md,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, ${vars.color.border})`,
  backgroundColor: vars.color.bgPrimary,
  padding: vars.space.xs,
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

const branchItemBase = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: '0.78rem',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  width: '100%',
  transition: `background ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,
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

export const branchItem = branchItemBase;

export const branchItemDefault = style([branchItemBase, {
  borderBottom: `1px solid ${vars.color.divider}`,
  marginBottom: vars.space.xs,
  paddingBottom: vars.space.md,
  color: vars.color.accent,
  fontWeight: 600,
}]);

export const branchIcon = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const branchName = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const defaultBadge = style({
  color: vars.color.accent,
  flexShrink: 0,
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
