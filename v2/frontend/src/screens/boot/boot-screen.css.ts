// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const breathe = keyframes({
  '0%, 100%': { opacity: 0.7 },
  '50%': { opacity: 1 },
});

const textGlow = keyframes({
  '0%, 100%': { textShadow: `0 0 10px ${vars.color.accentGlow}` },
  '50%': { textShadow: `0 0 25px ${vars.color.accent}, 0 0 50px ${vars.color.accentGlow}` },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: vars.color.bgPrimary,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  animation: `${fadeIn} 400ms ease-out`,
});

export const overlayDismiss = style([
  overlay,
  {
    animation: `${fadeOut} 500ms ease-out forwards`,
    pointerEvents: 'none',
  },
]);

export const title = style({
  position: 'relative',
  zIndex: 1,
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xxl,
  fontWeight: 900,
  color: vars.color.accent,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  animation: `${textGlow} 3s ease-in-out infinite`,
  marginBottom: vars.space.sm,
});

export const subtitle = style({
  position: 'relative',
  zIndex: 1,
  fontSize: vars.fontSize.sm,
  color: vars.color.textDisabled,
  letterSpacing: '0.05em',
  marginBottom: vars.space.xl,
  transition: `color ${vars.animation.normal} ease`,
});

export const subtitleSuccess = style({
  color: vars.color.success,
});

export const stepList = style({
  position: 'relative',
  zIndex: 1,
  width: '320px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const stepRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '5px 0',
  fontFamily: vars.font.mono,
});

export const stepIcon = style({
  width: '16px',
  height: '16px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  flexShrink: 0,
  color: `color-mix(in srgb, ${vars.color.textPrimary} 20%, transparent)`,
});

export const stepIconRunning = style({
  color: vars.color.accent,
  animation: `${breathe} 1s ease-in-out infinite`,
});

export const stepIconDone = style({
  color: vars.color.success,
});

export const stepLabel = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  whiteSpace: 'nowrap',
});

export const stepDetail = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  marginLeft: 'auto',
  whiteSpace: 'nowrap',
});

export const stepDetailDone = style({
  color: vars.color.textSecondary,
});
