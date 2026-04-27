// PhantomOS v2 — AddProviderDialog styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  padding: `${vars.space.md} 0`,
});

export const fieldGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const fieldLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const fieldInput = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  outline: 'none',
  transition: `border-color ${vars.animation.fast} ease`,
  ':focus': {
    borderColor: vars.color.borderFocus,
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const fieldTextarea = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  outline: 'none',
  resize: 'vertical',
  minHeight: '120px',
  transition: `border-color ${vars.animation.fast} ease`,
  ':focus': {
    borderColor: vars.color.borderFocus,
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const fieldHint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const modeToggle = style({
  display: 'flex',
  gap: vars.space.sm,
  marginBottom: vars.space.sm,
});

export const actions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: vars.space.sm,
  paddingTop: vars.space.md,
  borderTop: `1px solid ${vars.color.border}`,
});
