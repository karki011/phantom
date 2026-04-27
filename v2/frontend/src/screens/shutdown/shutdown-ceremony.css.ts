// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const flickerIn = keyframes({
  '0%': { opacity: 0 },
  '5%': { opacity: 0.6 },
  '10%': { opacity: 0.2 },
  '15%': { opacity: 0.8 },
  '20%': { opacity: 0.1 },
  '30%': { opacity: 0.9 },
  '40%': { opacity: 0.4 },
  '50%': { opacity: 1 },
  '100%': { opacity: 1 },
});

const textGlow = keyframes({
  '0%, 100%': { textShadow: `0 0 10px ${vars.color.accentGlow}` },
  '50%': { textShadow: `0 0 25px ${vars.color.accent}, 0 0 50px ${vars.color.accentGlow}` },
});

const sweepUp = keyframes({
  '0%': { bottom: '0%' },
  '100%': { bottom: '100%' },
});

const fadeOut = keyframes({
  '0%': { opacity: 1 },
  '100%': { opacity: 0 },
});

const pulse = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 1 },
});

const dimDown = keyframes({
  '0%': { filter: 'brightness(1)' },
  '100%': { filter: 'brightness(0)' },
});

export const shutdownScreen = style({
  position: 'fixed',
  inset: 0,
  background: vars.color.bgPrimary,
  zIndex: 200,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: vars.font.mono,
  animation: `${flickerIn} 400ms ease-out forwards`,
});

export const shutdownScreenDismiss = style({
  animation: `${dimDown} 1200ms ease-in forwards`,
});

export const flickerOverlay = style({
  position: 'absolute',
  inset: 0,
  background: `radial-gradient(ellipse at center, transparent 60%, ${vars.color.bgPrimary} 100%)`,
  pointerEvents: 'none',
});

export const terminalContainer = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  maxWidth: '600px',
  width: '100%',
  zIndex: 1,
});

export const line = style({
  whiteSpace: 'pre-wrap',
  minHeight: '1.8em',
  textAlign: 'center',
  fontSize: vars.fontSize.sm,
  lineHeight: 2,
  color: vars.color.terminalText,
});

export const lineNormal = style({
  color: vars.color.terminalText,
});

export const lineTitle = style({
  color: vars.color.accent,
  fontFamily: vars.font.display,
  fontWeight: 700,
  fontSize: vars.fontSize.xxl,
  letterSpacing: '0.2em',
  animation: `${textGlow} 3s ease-in-out infinite`,
  marginBottom: vars.space.md,
});

export const lineSubtitle = style({
  color: vars.color.warning,
  fontSize: vars.fontSize.xs,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  marginBottom: vars.space.lg,
});

export const lineAccent = style({
  color: vars.color.accent,
  fontWeight: 600,
  fontSize: vars.fontSize.md,
  letterSpacing: '0.15em',
});

export const lineSuccess = style({
  color: vars.color.success,
  fontWeight: 600,
  fontSize: vars.fontSize.md,
  letterSpacing: '0.15em',
});

export const lineDim = style({
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
  letterSpacing: '0.05em',
});

export const cursor = style({
  color: vars.color.terminalCursor,
  marginLeft: '2px',
});

export const separator = style({
  width: '120px',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  margin: `${vars.space.sm} auto`,
});

export const waitingPulse = style({
  animation: `${pulse} 2s ease-in-out infinite`,
});

export const sweepLine = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: '2px',
  background: vars.color.accent,
  boxShadow: `0 0 20px ${vars.color.accentGlow}, 0 -10px 30px ${vars.color.accentMuted}, 0 10px 30px ${vars.color.accentMuted}`,
  animation: `${sweepUp} 800ms ease-in-out forwards`,
  bottom: '0%',
  zIndex: 10,
});

export const blackScreen = style({
  position: 'fixed',
  inset: 0,
  background: '#000',
  zIndex: 200,
});
