// Phantom — Server log drawer body
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  padding: vars.space.md,
  boxSizing: 'border-box',
});

export const hint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  margin: `0 0 ${vars.space.sm}`,
  flexShrink: 0,
});

export const pre = style({
  margin: 0,
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: '11px',
  lineHeight: 1.45,
  color: vars.color.textSecondary,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});
