// Phantom — Quick Open styles (Cmd+P file finder)
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
  width: '560px',
  maxWidth: 'calc(100vw - 48px)',
  maxHeight: '420px',
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

export const resultsList = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.xs} 0`,
});

export const resultItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
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

export const fileIcon = style({
  color: vars.color.textSecondary,
  flexShrink: 0,
  width: '14px',
  height: '14px',
});

export const fileName = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const filePath = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginLeft: vars.space.xs,
});

export const resultText = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: vars.space.xs,
  overflow: 'hidden',
  minWidth: 0,
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

export const highlight = style({
  color: vars.color.accent,
  fontWeight: 600,
});

// Scrollbar styling inside results
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
