// PhantomOS v2 — Quick-Fix lightbulb styles (Vanilla Extract)
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';

import { vars } from './theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(-2px) scale(0.92)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

/**
 * Wrapper applied to the xterm decoration's own DOM element. The decoration
 * already gets its size from xterm; we just need to centre the button.
 */
export const decorationHost = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingRight: vars.space.xs,
  pointerEvents: 'none',
});

/**
 * The 💡 button itself — small, brand-purple, fades in over the prompt line.
 * Pointer events re-enabled here so the host can stay non-interactive (we
 * don't want the decoration eating clicks on terminal text).
 */
export const lightbulb = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  padding: 0,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.sm,
  background: vars.color.accentMuted,
  color: vars.color.textPrimary,
  fontSize: '11px',
  lineHeight: 1,
  cursor: 'pointer',
  pointerEvents: 'auto',
  boxShadow: vars.shadow.glow,
  animation: `${fadeIn} 180ms ease-out`,
  transition: `transform 120ms ease-out, background 120ms ease-out`,

  selectors: {
    '&:hover': {
      background: vars.color.accent,
      transform: 'scale(1.1)',
    },
    '&:focus-visible': {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: '2px',
    },
    '&:active': {
      transform: 'scale(0.95)',
    },
  },
});
