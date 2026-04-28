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

const sweepDown = keyframes({
  '0%': { top: '0%' },
  '100%': { top: '100%' },
});

const fadeOut = keyframes({
  '0%': { opacity: 1 },
  '100%': { opacity: 0 },
});

const cursorBlink = keyframes({
  '0%, 49%': { opacity: 1 },
  '50%, 100%': { opacity: 0 },
});

const pulse = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 1 },
});

export const bootScreen = style({
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

export const bootScreenDismiss = style({
  animation: `${fadeOut} 600ms ease-out 600ms forwards`,
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
  color: vars.color.accentMuted,
  fontSize: vars.fontSize.xs,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  marginBottom: vars.space.lg,
});

export const lineAccent = style({
  color: vars.color.accent,
  fontWeight: 600,
  fontSize: vars.fontSize.md,
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
});

export const cursor = style({
  display: 'inline-block',
  width: '8px',
  height: '1.2em',
  marginLeft: '2px',
  background: vars.color.terminalCursor,
  animation: `${cursorBlink} 1s step-end infinite`,
  verticalAlign: 'text-bottom',
});

export const promptSymbol = style({
  color: vars.color.success,
  fontWeight: 600,
  marginRight: '8px',
  userSelect: 'none',
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
  animation: `${sweepDown} 800ms ease-in-out forwards`,
  top: '0%',
  zIndex: 10,
});
