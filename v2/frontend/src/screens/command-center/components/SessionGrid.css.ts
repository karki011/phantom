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

export const list = style({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '8px 1fr 80px 60px 60px 56px',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  borderBottom: `1px solid ${vars.color.divider}`,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const statusDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
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

export const sessionName = style({
  color: vars.color.textPrimary,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const model = style({
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});


export const tokens = style({
  color: vars.color.textSecondary,
  textAlign: 'right',
});

export const cost = style({
  color: vars.color.accent,
  fontWeight: 600,
  textAlign: 'right',
});

export const time = style({
  color: vars.color.textDisabled,
  textAlign: 'right',
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

export const headerRow = style({
  display: 'grid',
  gridTemplateColumns: '8px 1fr 80px 60px 60px 56px',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `0 ${vars.space.md} ${vars.space.xs}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  borderBottom: `1px solid ${vars.color.border}`,
});
