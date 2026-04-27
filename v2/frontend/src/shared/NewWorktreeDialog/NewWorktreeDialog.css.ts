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

export const selectTrigger = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  selectors: {
    '&:focus': {
      borderColor: vars.color.borderFocus,
      boxShadow: `0 0 0 2px ${vars.color.accentMuted}`,
    },
    '&[data-expanded]': {
      borderColor: vars.color.borderFocus,
    },
  },
});

export const selectValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  selectors: {
    '&[data-placeholder-shown]': {
      color: vars.color.textDisabled,
    },
  },
});

export const selectContent = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderFocus}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.xs} 0`,
  boxShadow: vars.shadow.md,
  zIndex: 500,
  maxHeight: '200px',
  overflowY: 'auto',
});

export const selectItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  selectors: {
    '&[data-highlighted]': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.accent,
    },
    '&[data-selected]': {
      color: vars.color.accent,
    },
  },
});

export const selectItemLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
});

export const loaderWrap = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.md,
});

export const branchesLoaderText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  letterSpacing: '0.05em',
});

export const optionalLabel = style({
  fontWeight: 400,
  opacity: 0.6,
});

export const branchPreview = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  opacity: 0.7,
  marginTop: `calc(-1 * ${vars.space.sm})`,
});
