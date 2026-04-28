// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const flickerIn = keyframes({
  '0%': { opacity: 0.85 },
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

/* ── CRT Power-Off Effect ────────────────────────────────────── */

const crtScanAccelerate = keyframes({
  '0%': { backgroundSize: '100% 4px' },
  '50%': { backgroundSize: '100% 2px' },
  '100%': { backgroundSize: '100% 1px' },
});

const crtShrinkVertical = keyframes({
  '0%': {
    transform: 'scaleY(1) scaleX(1)',
    filter: 'brightness(1)',
  },
  '60%': {
    transform: 'scaleY(0.005) scaleX(1)',
    filter: 'brightness(1.5)',
  },
  '100%': {
    transform: 'scaleY(0.005) scaleX(1)',
    filter: 'brightness(1.5)',
  },
});

const crtShrinkToDot = keyframes({
  '0%': {
    transform: 'scaleY(0.005) scaleX(1)',
    filter: 'brightness(1.5)',
  },
  '100%': {
    transform: 'scaleY(0.005) scaleX(0)',
    filter: 'brightness(2)',
  },
});

const crtDotFade = keyframes({
  '0%': { opacity: 1 },
  '40%': { opacity: 0.8 },
  '100%': { opacity: 0 },
});

export const shutdownScreen = style({
  position: 'fixed',
  inset: 0,
  background: vars.color.bgPrimary,
  zIndex: 220,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: vars.font.mono,
  animation: `${flickerIn} 150ms ease-out forwards`,
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

export const separator = style({
  width: '120px',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  margin: `${vars.space.sm} auto`,
});

export const stepRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '5px 0',
  width: '300px',
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
  animation: `${pulse} 1s ease-in-out infinite`,
});

export const stepIconDone = style({
  color: vars.color.success,
});

export const stepIconError = style({
  color: vars.color.danger,
});

export const stepLabel = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textDisabled,
});

export const stepLabelDone = style({
  color: vars.color.textPrimary,
});

export const stepLabelError = style({
  color: vars.color.danger,
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

/* ── CRT Power-Off Styles ────────────────────────────────────── */

export const crtPowerOff = style({
  animation: `${crtShrinkVertical} 600ms cubic-bezier(0.4, 0, 1, 1) forwards`,
  transformOrigin: 'center center',
});

export const crtCollapseToDot = style({
  animation: `${crtShrinkToDot} 400ms cubic-bezier(0.4, 0, 1, 1) forwards`,
  transformOrigin: 'center center',
});

export const crtDotFadeOut = style({
  animation: `${crtDotFade} 500ms ease-out forwards`,
  transformOrigin: 'center center',
});

export const crtScanOverlay = style({
  position: 'absolute',
  inset: 0,
  background: `repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0.15) 1px,
    transparent 1px,
    transparent 4px
  )`,
  animation: `${crtScanAccelerate} 600ms ease-in forwards`,
  pointerEvents: 'none',
  zIndex: 11,
});

export const crtGlowLine = style({
  position: 'absolute',
  top: '50%',
  left: '10%',
  right: '10%',
  height: '2px',
  transform: 'translateY(-50%)',
  background: vars.color.accent,
  boxShadow: `0 0 30px ${vars.color.accentGlow}, 0 0 60px ${vars.color.accentGlow}, 0 0 100px ${vars.color.accentMuted}`,
  borderRadius: vars.radius.full,
  zIndex: 12,
  opacity: 0,
  transition: 'opacity 200ms ease-in',
});

export const crtGlowLineVisible = style({
  opacity: 1,
});

export const blackScreen = style({
  position: 'fixed',
  inset: 0,
  background: '#000',
  zIndex: 220,
});
