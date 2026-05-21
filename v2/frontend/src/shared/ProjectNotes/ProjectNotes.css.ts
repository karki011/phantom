// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const notesSection = style({
  marginTop: vars.space.lg,
});

export const notesHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} 0`,
  cursor: 'pointer',
  userSelect: 'none',
});

export const notesHeaderChevron = style({
  color: vars.color.textDisabled,
  transition: 'transform 200ms ease',
  width: '14px',
  height: '14px',
  flexShrink: 0,
});

export const notesHeaderTitle = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

export const notesCountBadge = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const notesAddBtn = style({
  marginLeft: 'auto',
  background: 'transparent',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, ${vars.color.border})`,
  color: vars.color.accent,
  borderRadius: vars.radius.sm,
  padding: '2px 8px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  transition: `all ${vars.animation.fast} ease`,
  selectors: {
    '&:hover': {
      borderColor: `color-mix(in srgb, ${vars.color.accent} 50%, ${vars.color.border})`,
      background: vars.color.bgHover,
    },
  },
});

export const notesGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: vars.space.md,
  paddingTop: vars.space.sm,
  overflow: 'hidden',
});

export const notesEmpty = style({
  textAlign: 'center',
  padding: vars.space.xl,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  gridColumn: '1 / -1',
});
