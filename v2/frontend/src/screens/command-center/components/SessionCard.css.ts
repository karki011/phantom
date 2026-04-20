// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

const fadeSlideIn = keyframes({
  from: { opacity: 0, transform: 'translateY(-8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const card = style({
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.md,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  transition: `all ${vars.animation.fast} ease`,
  animation: `${fadeSlideIn} ${vars.animation.fast} ease`,
  cursor: 'pointer',
  ':hover': {
    borderColor: vars.color.borderHover,
    background: vars.color.bgHover,
  },
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
});

export const sessionName = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const statusDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const statusActive = style({
  background: vars.color.success,
  boxShadow: vars.shadow.successGlow,
});

export const statusEnded = style({
  background: vars.color.textDisabled,
});

export const statusStale = style({
  background: vars.color.danger,
  boxShadow: vars.shadow.dangerGlow,
});

export const model = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const stats = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const statValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const costValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  fontWeight: 600,
});
