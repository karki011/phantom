// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
});

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${vars.space.sm} ${vars.space.md}`,
  flexShrink: 0,
});

export const title = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});

export const count = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: vars.space.md,
  padding: vars.space.md,
  overflowY: 'auto',
  flex: 1,
});

export const empty = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textDisabled,
});
