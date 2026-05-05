// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const container = style({
  position: 'relative',
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
});

export const scrollArea = style({
  height: '100%',
  overflowY: 'auto',
  width: '100%',
});

export const messageStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  padding: `${vars.space.lg} ${vars.space.xxl}`,
  paddingBottom: '200px',
});

export const virtualItem = style({
  paddingLeft: vars.space.md,
  paddingRight: vars.space.md,
  paddingBottom: '12px',
});

export const streamingBar = style({
  position: 'sticky',
  bottom: 0,
  marginTop: '-180px',
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.xxl}`,
  background: `color-mix(in srgb, ${vars.color.accent} 5%, ${vars.color.bgSecondary})`,
  borderTop: `1px solid ${vars.color.divider}`,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  zIndex: 10,
  fontStyle: 'italic',
})

export const streamingDot = style({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: vars.color.accent,
  animation: 'pulse 1.2s ease-in-out infinite',
  flexShrink: 0,
})

export const jumpPill = style({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  padding: `${vars.space.xs} ${vars.space.md}`,
  background: `color-mix(in srgb, ${vars.color.accent} 10%, ${vars.color.bgSecondary})`,
  border: 'none',
  borderTop: `1px solid ${vars.color.divider}`,
  color: vars.color.accent,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  textAlign: 'center' as const,
  cursor: 'pointer',
  zIndex: 10,
  selectors: {
    '&:hover': {
      background: `color-mix(in srgb, ${vars.color.accent} 18%, ${vars.color.bgSecondary})`,
    },
  },
});
