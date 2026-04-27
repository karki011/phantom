// PhantomOS v2 — MetricsPanel live system gauges styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const panelContainer = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.lg,
  width: '100%',
  height: '100%',
  animation: `${fadeIn} 400ms ease-out both`,
});

export const gaugesRow = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  justifyItems: 'center',
  alignItems: 'center',
  gap: 0,
  margin: '0 auto',
  width: '100%',
});

export const secondaryRow = style({
  display: 'flex',
  justifyContent: 'center',
  gap: vars.space.lg,
  flexWrap: 'wrap',
});

export const secondaryStat = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
});

export const secondaryValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const secondaryLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});
