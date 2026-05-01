// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const strategyBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.md}`,
  background: `color-mix(in srgb, ${vars.color.accent} 5%, ${vars.color.bgSecondary})`,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
});

export const strategyHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  color: vars.color.textSecondary,
});

export const strategyName = style({
  fontWeight: 600,
  color: vars.color.accent,
  fontFamily: vars.font.mono,
});

export const strategyConfidence = style({
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
});

export const strategyDetails = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.md,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: '10px',
});

export const strategyTag = style({
  padding: '1px 6px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
});
