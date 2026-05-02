// Phantom — Right-side drawer styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const slideIn = keyframes({
  from: { transform: 'translateX(100%)' },
  to: { transform: 'translateX(0)' },
});

const borderGlow = keyframes({
  '0%, 100%': {
    boxShadow: `
      -4px 0 20px color-mix(in srgb, ${vars.color.accent} 8%, transparent),
      inset 4px 0 20px color-mix(in srgb, ${vars.color.accent} 3%, transparent)
    `,
  },
  '50%': {
    boxShadow: `
      -4px 0 30px color-mix(in srgb, ${vars.color.accent} 15%, transparent),
      inset 4px 0 30px color-mix(in srgb, ${vars.color.accent} 5%, transparent)
    `,
  },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: vars.color.bgOverlay,
  zIndex: 400,
  animation: `${fadeIn} 200ms ease`,
});

export const panel = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 401,
  width: '560px',
  maxWidth: 'calc(100vw - 48px)',
  backgroundColor: vars.color.bgPrimary,
  borderLeft: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, ${vars.color.border})`,
  display: 'flex',
  flexDirection: 'column',
  animation: `${slideIn} 280ms cubic-bezier(0.16, 1, 0.3, 1), ${borderGlow} 4s ease-in-out infinite`,
  overflow: 'hidden',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.lg} ${vars.space.xl}`,
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, ${vars.color.border})`,
  flexShrink: 0,
});

export const title = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.md,
  color: vars.color.accent,
  letterSpacing: '0.08em',
  fontWeight: 700,
  margin: 0,
  flex: 1,
  minWidth: 0,
});

export const headerTrailingWrap = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const pinToggle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'all 150ms ease',
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

export const pinToggleActive = style({
  color: vars.color.accent,
  borderColor: `color-mix(in srgb, ${vars.color.accent} 45%, ${vars.color.border})`,
  background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
});

export const closeButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'all 150ms ease',
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

export const body = style({
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});
