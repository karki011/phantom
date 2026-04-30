// Phantom — ArcGauge SVG arc meter styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const gaugeWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
});

export const gaugeSvg = style({
  overflow: 'visible',
});

export const backgroundArc = style({
  fill: 'none',
  stroke: vars.color.border,
});

export const foregroundArc = style({
  fill: 'none',
  transition: 'stroke-dashoffset 600ms ease-out',
});

export const valueText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.lg,
  fontWeight: 700,
  fill: vars.color.textPrimary,
  textAnchor: 'middle',
  dominantBaseline: 'central',
});

export const unitText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fill: vars.color.textSecondary,
  textAnchor: 'middle',
  dominantBaseline: 'central',
});

export const labelText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textAlign: 'center',
  margin: 0,
  lineHeight: 1,
});

export const sublabelText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  margin: 0,
  lineHeight: 1,
});
