// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const fadeIn = keyframes({
  '0%': { opacity: 0 },
  '100%': { opacity: 1 },
});

const slideUp = keyframes({
  '0%': { opacity: 0, transform: 'translateY(16px) scale(0.96)' },
  '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  background: vars.color.bgOverlay,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 210,
  animation: `${fadeIn} 200ms ease-out`,
});

export const panel = style({
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
  borderRadius: vars.radius.lg,
  padding: `${vars.space.xxl} ${vars.space.xxl}`,
  boxShadow: `${vars.shadow.lg}, 0 0 60px rgba(124, 58, 237, 0.06)`,
  minWidth: '340px',
  maxWidth: '420px',
  textAlign: 'center',
  animation: `${slideUp} 300ms cubic-bezier(0.16, 1, 0.3, 1)`,
  fontFamily: vars.font.mono,
});

export const title = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.danger,
  letterSpacing: '0.1em',
  margin: 0,
  marginBottom: vars.space.md,
});

export const sessionInfo = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  marginBottom: vars.space.xl,
  letterSpacing: '0.05em',
});

export const actions = style({
  display: 'flex',
  gap: vars.space.md,
  justifyContent: 'center',
});

const buttonBase = style({
  padding: `${vars.space.sm} ${vars.space.xl}`,
  borderRadius: vars.radius.md,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  border: 'none',
  transition: 'all 150ms ease',
});

export const cancelButton = style([buttonBase, {
  background: 'transparent',
  color: vars.color.textSecondary,
  border: `1px solid ${vars.color.border}`,
  ':hover': {
    background: vars.color.bgHover,
    borderColor: vars.color.borderHover,
    color: vars.color.textPrimary,
  },
}]);

export const shutdownButton = style([buttonBase, {
  background: vars.color.danger,
  color: vars.color.textInverse,
  boxShadow: vars.shadow.dangerGlow,
  ':hover': {
    filter: 'brightness(1.15)',
    boxShadow: `${vars.shadow.dangerGlow}, 0 0 40px ${vars.color.dangerMuted}`,
  },
}]);
