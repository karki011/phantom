// PhantomOS v2 — Terminal pane styles (Vanilla Extract)
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from './theme.css';

export const terminalContainer = style({
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: vars.color.terminalBg,
  // contain:strict lets the browser skip layout/paint outside this box;
  // xterm.js manages its own canvas layout internally.
  contain: 'strict',
  position: 'relative',
});

export const restoreBanner = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  zIndex: 10,
  pointerEvents: 'none',
});
