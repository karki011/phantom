// Phantom — Shortcut Sheet styles (Cmd+/ overlay)
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(-8px) scale(0.98)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  paddingTop: '60px',
  background: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(4px)',
});

export const container = style({
  width: '720px',
  maxWidth: 'calc(100vw - 48px)',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.lg,
  overflow: 'hidden',
  animation: `${fadeIn} 140ms ease-out`,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const title = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.textPrimary,
  letterSpacing: '-0.01em',
});

export const closeHint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  letterSpacing: '0.04em',
});

export const body = style({
  overflowY: 'auto',
  padding: `${vars.space.md} ${vars.space.lg}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
});

export const categoryBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const categoryTitle = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  paddingBottom: vars.space.xs,
  borderBottom: `1px solid ${vars.color.border}`,
  marginBottom: vars.space.xs,
});

export const shortcutGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: `${vars.space.xs} ${vars.space.md}`,
});

export const shortcutRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  transition: `background ${vars.animation.fast} ease`,
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
    },
  },
});

export const shortcutLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  flexShrink: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const keyCombo = style({
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  flexShrink: 0,
});

export const keyCap = style({
  fontFamily: vars.font.mono,
  fontSize: '11px',
  fontWeight: 500,
  lineHeight: 1,
  color: vars.color.textSecondary,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderBottom: `2px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '3px 6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
  whiteSpace: 'nowrap',
});

// Scrollbar styling
globalStyle(`${body}::-webkit-scrollbar`, {
  width: '4px',
});

globalStyle(`${body}::-webkit-scrollbar-thumb`, {
  background: vars.color.border,
  borderRadius: '2px',
});

globalStyle(`${body}::-webkit-scrollbar-track`, {
  background: 'transparent',
});
