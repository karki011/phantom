// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';
import { fadeIn, dissolve, screenPowerOn } from '../../../styles/animations.css';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: vars.color.bgPrimary,
  display: 'flex',
  flexDirection: 'column',
});

export const powerOnBlackout = style({
  position: 'absolute',
  inset: 0,
  zIndex: 10,
  background: '#000',
  animation: `${screenPowerOn} 2s ease-out forwards`,
  pointerEvents: 'none',
});

export const overlayDissolving = style({
  animation: `${dissolve} 800ms ease forwards`,
  pointerEvents: 'none',
});

export const phaseContainer = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: vars.color.bgPrimary,
  animation: `${fadeIn} ${vars.animation.normal} ease`,
});

export const phasePlaceholder = style({
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.xl,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  alignItems: 'center',
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  pointerEvents: 'auto',
});

export const scanlines = style({
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  pointerEvents: 'none',
  background: `repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  )`,
  opacity: 0.5,
  animation: `${fadeIn} 2s ease`,
});

export const progressBar = style({
  position: 'absolute',
  bottom: vars.space.xl,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 3,
});

// AutoTimer styles

export const autoTimerWrapper = style({
  marginTop: vars.space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  alignItems: 'center',
});

export const autoTimerBar = style({
  width: '200px',
  height: '3px',
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.full,
  overflow: 'hidden',
});

export const autoTimerFill = style({
  height: '100%',
  background: vars.color.accent,
  borderRadius: vars.radius.full,
  transition: 'width 100ms linear',
});

export const autoTimerText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  letterSpacing: '0.5px',
});

export const autoTimerMessage = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  letterSpacing: '0.5px',
});
