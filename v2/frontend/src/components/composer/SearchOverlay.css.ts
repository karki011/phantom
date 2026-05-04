// Author: Subash Karki
// Search overlay (Cmd+F / Ctrl+F) for Composer V2 — ported from V1

import { style, globalStyle } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

// Floating pill anchored to top-right of the session content area
export const overlay = style({
  position: 'absolute',
  top: vars.space.xs,
  right: vars.space.md,
  zIndex: 10,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `4px ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  border: `1px solid ${vars.color.borderFocus}`,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 92%, transparent)`,
  backdropFilter: 'blur(8px)',
  boxShadow: vars.shadow.md,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
})

export const input = style({
  width: 180,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  '::placeholder': {
    color: vars.color.textDisabled,
  },
})

export const matchInfo = style({
  fontSize: '10px',
  color: 'inherit',
  opacity: 0.6,
  fontFamily: vars.font.mono,
  whiteSpace: 'nowrap',
})

export const navBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: 2,
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
  ':disabled': {
    opacity: 0.3,
    cursor: 'default',
  },
})

export const closeBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: 2,
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
})

// Global style for highlighted search matches — applied via DOM manipulation
globalStyle('mark.search-hit', {
  background: `color-mix(in srgb, ${vars.color.accent} 40%, transparent)`,
  color: 'inherit',
  borderRadius: '2px',
  padding: '0 1px',
})

// Active match gets a stronger highlight so the user knows which one is focused
globalStyle('mark.search-hit-active', {
  background: `color-mix(in srgb, ${vars.color.accent} 70%, transparent)`,
  color: 'inherit',
  borderRadius: '2px',
  padding: '0 1px',
  outline: `1px solid ${vars.color.accent}`,
})
