// Phantom — BarChart SVG bar chart styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const chartContainer = style({
  width: '100%',
  position: 'relative',
});

export const chartSvg = style({
  display: 'block',
  width: '100%',
  overflow: 'visible',
});

export const barRect = style({
  transition: `opacity ${vars.animation.fast} ease`,
  cursor: 'pointer',
  ':hover': {
    opacity: 0.8,
  },
});

export const xLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fill: vars.color.textDisabled,
  textAnchor: 'middle',
  dominantBaseline: 'hanging',
  userSelect: 'none',
});

export const tooltipGroup = style({
  pointerEvents: 'none',
});

export const tooltipRect = style({
  fill: vars.color.bgTertiary,
  stroke: vars.color.border,
  strokeWidth: '1',
  rx: '4',
  ry: '4',
});

export const tooltipText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fill: vars.color.textPrimary,
  textAnchor: 'middle',
  dominantBaseline: 'auto',
  fontWeight: 600,
});

export const emptyMessage = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  padding: vars.space.xl,
});
