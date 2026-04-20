// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

const pulse = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.4 },
});

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

export const liveDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  background: vars.color.success,
  animation: `${pulse} 2s ease infinite`,
});

export const list = style({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
});

export const entry = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  lineHeight: 1.4,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const timestamp = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
  width: '36px',
  textAlign: 'right',
});

export const icon = style({
  flexShrink: 0,
  width: '16px',
  textAlign: 'center',
});

export const detail = style({
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const typeTool = style({ color: vars.color.accent });
export const typeGit = style({ color: vars.color.info });
export const typeMessage = style({ color: vars.color.textSecondary });
export const typeResponse = style({ color: vars.color.textPrimary });

export const empty = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textDisabled,
});

export const pausedBanner = style({
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.warning,
  textAlign: 'center',
  cursor: 'pointer',
  ':hover': {
    background: vars.color.bgHover,
  },
});
