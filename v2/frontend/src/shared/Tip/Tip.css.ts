// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(2px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const trigger = style({
  display: 'inline-flex',
  alignItems: 'center',
});

export const content = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  boxShadow: vars.shadow.md,
  zIndex: 200,
  animation: `${fadeIn} 150ms ease`,
  maxWidth: '240px',
  lineHeight: 1.4,
  whiteSpace: 'pre-line',
});

export const arrow = style({
  fill: vars.color.bgTertiary,
  stroke: vars.color.border,
  strokeWidth: '1px',
});
