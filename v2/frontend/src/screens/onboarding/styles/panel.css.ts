// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

export const wrapper = style({
  pointerEvents: 'auto',
  maxWidth: '680px',
  width: '100%',
  padding: `0 ${vars.space.xl}`,
  opacity: 0,
  transform: 'translateY(20px)',
  transition: `all ${vars.animation.slow} cubic-bezier(0.16, 1, 0.3, 1)`,
});

export const wrapperVisible = style({
  opacity: 1,
  transform: 'translateY(0)',
});

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xxl,
});

export const brandMark = style({
  alignSelf: 'center',
  marginBottom: vars.space.md,
  opacity: 0.95,
});

export const header = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const title = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xxl,
  color: vars.color.accent,
  letterSpacing: '0.12em',
  margin: 0,
  textTransform: 'uppercase',
});

export const subtitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  margin: 0,
  lineHeight: 1.5,
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xl,
});
