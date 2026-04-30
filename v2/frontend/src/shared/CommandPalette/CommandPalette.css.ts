// Phantom — Command palette styles (glass panel + accent glow)
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

// === Animations ===

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(-12px) scale(0.96)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

const glowPulse = keyframes({
  '0%, 100%': { boxShadow: `${vars.shadow.lg}, 0 0 30px color-mix(in srgb, ${vars.color.accent} 15%, transparent)` },
  '50%': { boxShadow: `${vars.shadow.lg}, 0 0 50px color-mix(in srgb, ${vars.color.accent} 25%, transparent)` },
});

const backdropFadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

// === Layout ===

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  paddingTop: '72px',
  background: vars.color.bgOverlay,
  animation: `${backdropFadeIn} 120ms ease-out`,
});

export const container = style({
  width: '600px',
  maxWidth: 'calc(100vw - 48px)',
  maxHeight: '480px',
  display: 'flex',
  flexDirection: 'column',
  // Glass panel effect
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
  borderRadius: vars.radius.lg,
  boxShadow: `${vars.shadow.lg}, 0 0 40px color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  overflow: 'hidden',
  animation: `${fadeIn} 150ms cubic-bezier(0.16, 1, 0.3, 1), ${glowPulse} 4s ease-in-out infinite`,
});

// === Search Row ===

export const searchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.divider}`,
});

export const searchIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
  width: '16px',
  height: '16px',
});

export const searchInput = style({
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: vars.fontSize.md,
  fontFamily: vars.font.body,
  color: vars.color.textPrimary,
  caretColor: vars.color.accent,
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const escBadge = style({
  flexShrink: 0,
  padding: `2px ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  lineHeight: 1.4,
});

// === Action List ===

export const actionList = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.xs} 0`,
});

export const categoryHeader = style({
  padding: `${vars.space.sm} ${vars.space.lg}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  color: vars.color.accent,
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  opacity: 0.8,
  selectors: {
    '&:not(:first-child)': {
      marginTop: vars.space.xs,
      borderTop: `1px solid ${vars.color.divider}`,
      paddingTop: vars.space.md,
    },
  },
});

export const actionItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  borderLeft: '2px solid transparent',
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
    },
    '&[data-selected="true"]': {
      background: vars.color.bgActive,
      borderLeftColor: vars.color.accent,
    },
    '&[data-disabled="true"]': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
});

export const actionIcon = style({
  color: vars.color.textSecondary,
  flexShrink: 0,
  width: '14px',
  height: '14px',
  selectors: {
    [`${actionItem}[data-selected="true"] &`]: {
      color: vars.color.accent,
    },
  },
});

export const actionLabel = style({
  flex: 1,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const shortcutBadge = style({
  flexShrink: 0,
  padding: `2px ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  lineHeight: 1.4,
});

// === Footer ===

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.lg,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderTop: `1px solid ${vars.color.divider}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
});

export const footerKbd = style({
  padding: `1px ${vars.space.xs}`,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '3px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});

// === Empty State ===

export const emptyState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.space.xxl} ${vars.space.lg}`,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

// === Scrollbar ===

globalStyle(`${actionList}::-webkit-scrollbar`, {
  width: '4px',
});

globalStyle(`${actionList}::-webkit-scrollbar-thumb`, {
  background: vars.color.border,
  borderRadius: '2px',
});

globalStyle(`${actionList}::-webkit-scrollbar-track`, {
  background: 'transparent',
});
