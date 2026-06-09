// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: vars.color.bgPrimary,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const searchInput = style({
  flex: 1,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  outline: 'none',
  '::placeholder': {
    color: vars.color.textDisabled,
  },
  selectors: {
    '&:focus': {
      borderColor: vars.color.accent,
    },
  },
});

export const portCount = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  whiteSpace: 'nowrap',
});

export const tableWrapper = style({
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
});

export const tableHeader = style({
  display: 'grid',
  gridTemplateColumns: '80px 80px 1fr 120px 80px 60px',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  position: 'sticky',
  top: 0,
  background: vars.color.bgPrimary,
  zIndex: 1,
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '80px 80px 1fr 120px 80px 60px',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.lg}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.border} 50%, transparent)`,
  alignItems: 'center',
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
    },
  },
});

export const cellPort = style({
  color: vars.color.accent,
  fontWeight: 600,
});

export const cellPid = style({
  color: vars.color.textSecondary,
});

export const cellCommand = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const cellUser = style({
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const cellType = style({
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
});

export const killButton = style({
  background: 'transparent',
  border: `1px solid color-mix(in srgb, ${vars.color.danger} 40%, transparent)`,
  borderRadius: vars.radius.sm,
  color: vars.color.danger,
  padding: `2px ${vars.space.xs}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  transition: 'all 120ms ease',
  selectors: {
    '&:hover': {
      background: `color-mix(in srgb, ${vars.color.danger} 15%, transparent)`,
      borderColor: vars.color.danger,
    },
  },
});

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: vars.space.md,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
});

export const refreshHint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

// Kill confirmation overlay
const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

export const confirmOverlay = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
  zIndex: 1000,
  animation: `${fadeIn} 120ms ease`,
});

export const confirmDialog = style({
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  maxWidth: '400px',
  fontFamily: vars.font.body,
});

export const confirmActions = style({
  display: 'flex',
  gap: vars.space.sm,
  justifyContent: 'flex-end',
});

export const confirmCancel = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
});

export const confirmKill = style({
  background: vars.color.danger,
  border: 'none',
  borderRadius: vars.radius.sm,
  color: '#fff',
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  fontWeight: 600,
});
