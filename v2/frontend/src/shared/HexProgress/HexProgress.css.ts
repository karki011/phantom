// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const container = style({
  display: 'flex',
  gap: vars.space.sm,
  justifyContent: 'center',
  padding: vars.space.md,
});

export const hex = style({
  width: '12px',
  height: '12px',
  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
  background: vars.color.border,
  transition: `all ${vars.animation.normal} ease`,
});

export const hexActive = style({
  background: vars.color.accent,
  boxShadow: vars.shadow.glow,
});
