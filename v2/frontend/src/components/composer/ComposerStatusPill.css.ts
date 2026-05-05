// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

const pulse = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.6 },
})

export const pill = style({
  position: 'fixed',
  bottom: '8px',
  right: '8px',
  zIndex: 100,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 12px',
  borderRadius: '999px',
  fontSize: '11px',
  cursor: 'pointer',
  transition: 'background 150ms ease',
  userSelect: 'none',
  background: vars.color.bgSecondary,
  ':hover': {
    background: vars.color.bgHover,
  },
})

export const idle = style({
  color: vars.color.textSecondary,
})

export const streaming = style({
  color: vars.color.accent,
  animation: `${pulse} 1.5s ease infinite`,
})

export const permissionNeeded = style({
  color: vars.color.warning,
})

export const hasError = style({
  color: vars.color.danger,
})
