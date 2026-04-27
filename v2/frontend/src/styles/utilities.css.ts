// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

// === Layout Utilities ===

export const flexRow = style({
  display: 'flex',
  alignItems: 'center',
});

export const flexColumn = style({
  display: 'flex',
  flexDirection: 'column',
});

export const flexCenter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

// === Text Utilities ===

export const truncateText = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sectionLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: vars.color.textSecondary,
});

// === Icon Utilities ===

export const iconShrink = style({
  flexShrink: 0,
});

export const iconSuccess = style({
  color: vars.color.success,
  flexShrink: 0,
});

export const iconDanger = style({
  color: vars.color.danger,
  flexShrink: 0,
});

export const iconWarning = style({
  color: vars.color.warning,
  flexShrink: 0,
});

export const iconAccent = style({
  color: vars.color.accent,
  flexShrink: 0,
});

export const iconMuted = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
});

// === Status Indicators ===

export const statusDot = style({
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  flexShrink: 0,
});

// === Badge Utilities ===

export const badgeDanger = style({
  background: `color-mix(in srgb, ${vars.color.danger} 18%, transparent)`,
  color: vars.color.danger,
  border: `1px solid color-mix(in srgb, ${vars.color.danger} 35%, transparent)`,
});

export const badgeWarning = style({
  background: `color-mix(in srgb, ${vars.color.warning} 18%, transparent)`,
  color: vars.color.warning,
  border: `1px solid color-mix(in srgb, ${vars.color.warning} 35%, transparent)`,
});

export const badgeAccent = style({
  background: `color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  color: vars.color.accent,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 35%, transparent)`,
});

// === Animations ===

const spinKeyframes = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

export const spin = style({
  animation: `${spinKeyframes} 1s linear infinite`,
});
