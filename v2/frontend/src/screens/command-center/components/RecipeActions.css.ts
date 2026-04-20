// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

const pulseGreen = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.4 },
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const sectionLabel = style({
  fontFamily: vars.font.mono,
  fontSize: '9px',
  fontWeight: 600,
  color: vars.color.textDisabled,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: `0 ${vars.space.xs}`,
});

export const recipeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const playBtn = style({
  background: 'none',
  border: 'none',
  color: vars.color.accent,
  cursor: 'pointer',
  padding: 0,
  fontSize: vars.fontSize.xs,
  flexShrink: 0,
  ':hover': { color: vars.color.accentHover },
});

export const pinBtn = style({
  background: 'none',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: 0,
  fontSize: vars.fontSize.xs,
  flexShrink: 0,
  ':hover': { color: vars.color.warning },
});

export const pinBtnActive = style({
  color: vars.color.warning,
});

export const recipeLabel = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const runningDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  background: vars.color.success,
  animation: `${pulseGreen} 1.5s ease infinite`,
  flexShrink: 0,
});

export const expandToggle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: `${vars.space.xs}`,
  ':hover': { color: vars.color.textSecondary },
});

export const scrollList = style({
  maxHeight: '150px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
});
