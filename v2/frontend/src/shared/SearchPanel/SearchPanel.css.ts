// Phantom — Search Panel styles (Cmd+Shift+F content search)
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(-8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  paddingTop: '80px',
});

export const container = style({
  width: '640px',
  maxWidth: 'calc(100vw - 48px)',
  maxHeight: '520px',
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.lg,
  overflow: 'hidden',
  animation: `${fadeIn} 120ms ease-out`,
});

export const searchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const searchIcon = style({
  color: vars.color.textSecondary,
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
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const resultCount = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

export const resultsList = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.xs} 0`,
});

export const resultItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: `${vars.space.sm} ${vars.space.lg}`,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
    },
    '&[data-selected="true"]': {
      background: vars.color.bgActive,
    },
  },
});

export const resultHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  minWidth: 0,
});

export const fileIcon = style({
  color: vars.color.textSecondary,
  flexShrink: 0,
  width: '12px',
  height: '12px',
});

export const filePath = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flex: 1,
  minWidth: 0,
});

export const lineNumber = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const lineContent = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  whiteSpace: 'pre',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: '1.4',
  paddingLeft: '16px',
});

export const matchHighlight = style({
  color: vars.color.accent,
  fontWeight: 600,
  background: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  borderRadius: '2px',
});

export const emptyState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.space.xl} ${vars.space.lg}`,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

export const shortcutHint = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.lg}`,
  borderTop: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const shortcutKey = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '1px 4px',
});

export const shortcutLabel = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
});

// Scrollbar styling
globalStyle(`${resultsList}::-webkit-scrollbar`, {
  width: '4px',
});

globalStyle(`${resultsList}::-webkit-scrollbar-thumb`, {
  background: vars.color.border,
  borderRadius: '2px',
});

globalStyle(`${resultsList}::-webkit-scrollbar-track`, {
  background: 'transparent',
});
