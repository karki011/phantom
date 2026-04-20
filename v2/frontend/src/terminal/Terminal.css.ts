// PhantomOS v2 — Terminal pane styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../styles/theme.css';

export const terminalPane = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.terminalBg,
  overflow: 'hidden',
  position: 'relative',
});

export const terminalHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  background: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  flexShrink: 0,
});

export const terminalCwdLabel = style({
  color: vars.color.accent,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const terminalContainer = style({
  flex: 1,
  overflow: 'hidden',
  padding: vars.space.sm,
  // xterm.js renders its own canvas — this container must have explicit dimensions
  position: 'relative',
});

export const placeholder = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.md,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  userSelect: 'none',
});

export const placeholderTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  color: vars.color.accentMuted,
  letterSpacing: '0.15em',
});
