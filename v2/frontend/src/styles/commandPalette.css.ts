// Author: Subash Karki
// PhantomOS v2 — Command palette popover styles.
// Anchored absolutely over the terminal element. Theme tokens only — no
// raw hex values — so it adapts to every theme in theme.css.ts.

import { keyframes, style } from '@vanilla-extract/css';
import { vars } from './theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(-4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const overlay = style({
  position: 'absolute',
  inset: 0,
  background: 'transparent',
  zIndex: 9,
});

export const popover = style({
  position: 'absolute',
  top: '12px',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(600px, calc(100% - 24px))',
  maxHeight: '60vh',
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.lg,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  zIndex: 10,
  animation: `${fadeIn} ${vars.animation.fast} ease-out`,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.border}`,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
});

export const headerHint = style({
  color: vars.color.textSecondary,
  opacity: 0.7,
});

export const list = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  overflowY: 'auto',
  flex: 1,
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  cursor: 'pointer',
  borderLeft: '2px solid transparent',
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
    },
  },
});

export const itemActive = style({
  background: vars.color.bgSelected,
  borderLeftColor: vars.color.accent,
});

export const status = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const statusOk = style({
  background: vars.color.success,
  boxShadow: `0 0 6px ${vars.color.successMuted}`,
  opacity: 0.7,
});

export const statusFail = style({
  background: vars.color.danger,
  boxShadow: `0 0 6px ${vars.color.dangerMuted}`,
});

export const statusUnknown = style({
  background: vars.color.border,
  opacity: 0.5,
});

export const command = style({
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: vars.color.textPrimary,
});

export const prompt = style({
  color: vars.color.accent,
  marginRight: vars.space.xs,
  userSelect: 'none',
});

export const cwd = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  opacity: 0.7,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '40%',
  textAlign: 'right',
});

export const empty = style({
  padding: `${vars.space.lg} ${vars.space.md}`,
  textAlign: 'center',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
});
