// Author: Subash Karki

import { style, globalStyle, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'scale(0.96) translateY(-4px)' },
  to: { opacity: 1, transform: 'scale(1) translateY(0)' },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
});

export const menu = style({
  position: 'fixed',
  zIndex: 9999,
  minWidth: '220px',
  maxWidth: '280px',
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 88%, transparent)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.lg,
  padding: `${vars.space.xs} 0`,
  animation: `${fadeIn} 120ms ease-out forwards`,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  userSelect: 'none',
});

export const section = style({
  padding: `${vars.space.xs} 0`,
});

export const divider = style({
  height: '1px',
  background: vars.color.divider,
  margin: `${vars.space.xs} 0`,
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `5px ${vars.space.md}`,
  cursor: 'pointer',
  color: vars.color.textPrimary,
  transition: 'background 80ms',
  borderRadius: 0,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const itemDisabled = style({
  opacity: 0.4,
  cursor: 'default',
  pointerEvents: 'none',
});

export const itemIcon = style({
  width: '14px',
  height: '14px',
  flexShrink: 0,
  color: vars.color.textSecondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const itemLabel = style({
  flex: 1,
  lineHeight: 1.4,
});

export const itemShortcut = style({
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
  letterSpacing: '0.02em',
  flexShrink: 0,
});
