// PhantomOS v2 — Sticky-scroll overlay for the running terminal command
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from './theme.css';

/**
 * Pinned at the top of the terminal viewport. Mirrors the prompt line of the
 * currently-running command so the user keeps context while scrolled into
 * its output.
 *
 * `pointer-events: none` lets clicks fall through to xterm — the overlay is
 * decorative, not interactive.
 */
export const stickyOverlay = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '28px',
  lineHeight: '28px',
  paddingInline: vars.space.md,
  // Subtle tint over the terminal bg so the overlay reads as "above" the rows
  // without obscuring them. Match the restoreBanner look.
  background: vars.color.bgSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  color: vars.color.terminalText,
  fontFamily: '"Hack", "JetBrains Mono", "Fira Code", "SF Mono", monospace',
  fontSize: '13px',
  whiteSpace: 'pre',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  // xterm's WebGL canvas sits below DOM rows; bump above both.
  zIndex: 5,
  pointerEvents: 'none',
  opacity: 0,
  transition: 'opacity 120ms ease-out',
});

export const stickyOverlayVisible = style({
  opacity: 1,
});
