// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

const powerOnSweep = keyframes({
  '0%': { top: '0%' },
  '100%': { top: '100%' },
});

const powerOnFade = keyframes({
  '0%': { opacity: 1 },
  '100%': { opacity: 0 },
});

export const appShell = style({
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgPrimary,
  fontFamily: vars.font.body,
  overflow: 'hidden',
});

export const shellReady = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  userSelect: 'none',
});

export const bootOverlay = style({
  position: 'fixed',
  inset: 0,
  background: vars.color.bgPrimary,
  zIndex: 150,
  animation: `${powerOnFade} 500ms ease-out 1000ms forwards`,
  pointerEvents: 'none',
});

export const bootSweepLine = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: '2px',
  background: vars.color.accent,
  boxShadow: `0 0 20px ${vars.color.accentGlow}, 0 -10px 30px ${vars.color.accentMuted}, 0 10px 30px ${vars.color.accentMuted}`,
  animation: `${powerOnSweep} 800ms ease-in-out 200ms forwards`,
  top: '0%',
});

