// PhantomOS v2 — ChatPane local styles (slash command UI)
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const popoverFadeIn = keyframes({
  '0%': { opacity: 0, transform: 'translateY(4px)' },
  '100%': { opacity: 1, transform: 'translateY(0)' },
});

// Wraps the textarea so we can anchor the slash help popover above it
export const slashAnchor = style({
  flex: 1,
  position: 'relative',
  display: 'flex',
});

export const slashPopoverContent = style({
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.lg,
  padding: vars.space.xs,
  minWidth: '260px',
  maxWidth: '360px',
  fontFamily: vars.font.body,
  outline: 'none',
  animation: `${popoverFadeIn} ${vars.animation.fast} ease`,
  zIndex: 1000,
});

export const slashPopoverHeader = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: `${vars.space.xs} ${vars.space.sm}`,
});

export const slashCommandRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'default',
  selectors: {
    '&[data-active="true"]': {
      background: vars.color.bgHover,
    },
  },
});

export const slashCommandName = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.accent,
  minWidth: '64px',
});

export const slashCommandDesc = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  flex: 1,
});
