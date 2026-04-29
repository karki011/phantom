// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const breathe = keyframes({
  '0%, 100%': { opacity: 0.15 },
  '50%': { opacity: 0.4 },
});

export const ringsContainer = style({
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  pointerEvents: 'none',
  zIndex: 0,
});

export const ringsSvg = style({
  width: '320px',
  height: '320px',
  opacity: 0.6,
  filter: `drop-shadow(0 0 8px ${vars.color.accentGlow})`,
});

export const ringBase = style({
  fill: 'none',
  strokeWidth: '1.5',
  strokeLinecap: 'round',
  transition: 'all 800ms ease-out',
});

export const ringIdle = style({
  stroke: vars.color.border,
  opacity: 0.3,
});

export const ringActive = style({
  stroke: vars.color.accent,
  opacity: 0.6,
  animation: `${breathe} 2s ease-in-out infinite`,
  filter: `drop-shadow(0 0 6px ${vars.color.accentGlow})`,
});

export const ringComplete = style({
  stroke: vars.color.accent,
  opacity: 0.8,
  filter: `drop-shadow(0 0 4px ${vars.color.accentGlow})`,
});

export const ringProgress = style({
  fill: 'none',
  strokeWidth: '2',
  strokeLinecap: 'round',
  stroke: vars.color.accent,
  transition: 'stroke-dashoffset 600ms ease-out',
});
