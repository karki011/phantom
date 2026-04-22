// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const scaleIn = keyframes({
  from: { opacity: 0, transform: 'translate(-50%, -50%) scale(0.95)' },
  to: { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
});

const borderGlow = keyframes({
  '0%, 100%': { boxShadow: `0 0 20px color-mix(in srgb, ${vars.color.accent} 10%, transparent), inset 0 0 20px color-mix(in srgb, ${vars.color.accent} 5%, transparent)` },
  '50%': { boxShadow: `0 0 30px color-mix(in srgb, ${vars.color.accent} 20%, transparent), inset 0 0 30px color-mix(in srgb, ${vars.color.accent} 8%, transparent)` },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: vars.color.bgOverlay,
  zIndex: 400,
  animation: `${fadeIn} 200ms ease`,
});

export const content = style({
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 401,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, ${vars.color.border})`,
  borderRadius: vars.radius.lg,
  padding: vars.space.xxl,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100vh - 64px)',
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  animation: `${scaleIn} 250ms cubic-bezier(0.16, 1, 0.3, 1), ${borderGlow} 4s ease-in-out infinite`,
  overflow: 'hidden',
});

export const sm = style({ width: '480px' });
export const md = style({ width: '600px' });
export const lg = style({ width: '760px' });

export const header = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const title = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  color: vars.color.accent,
  letterSpacing: '0.08em',
  fontWeight: 700,
  margin: 0,
});

export const description = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  letterSpacing: '0.02em',
  lineHeight: 1.5,
  margin: 0,
});

export const separator = style({
  width: '80px',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
});

export const actions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignSelf: 'stretch',
  width: '100%',
  gap: vars.space.lg,
  marginTop: vars.space.xl,
  paddingTop: vars.space.lg,
  borderTop: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, ${vars.color.border})`,
});
