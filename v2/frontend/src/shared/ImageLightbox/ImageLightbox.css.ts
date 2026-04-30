// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const viewer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  minHeight: '40vh',
  padding: vars.space.md,
});

export const image = style({
  display: 'block',
  maxWidth: '100%',
  maxHeight: '78vh',
  objectFit: 'contain',
  borderRadius: vars.radius.md,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, ${vars.color.border})`,
  boxShadow: vars.shadow.lg,
  background: vars.color.bgSecondary,
});

export const caption = style({
  marginTop: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  letterSpacing: '0.02em',
  textAlign: 'center',
  wordBreak: 'break-all',
});

export const figure = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  margin: 0,
});

// Make markdown-rendered images appear clickable inside the chat pane.
// Uses globalStyle so it applies to <img> elements rendered via innerHTML.
globalStyle(`[data-lightbox-trigger="true"]`, {
  cursor: 'zoom-in',
  transition: 'transform 120ms ease, box-shadow 120ms ease',
});

globalStyle(`[data-lightbox-trigger="true"]:hover`, {
  transform: 'scale(1.01)',
  boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 35%, transparent)`,
});
