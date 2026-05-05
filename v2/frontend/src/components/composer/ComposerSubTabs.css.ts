// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const tabStrip = style({
  display: 'flex',
  flexDirection: 'row',
  gap: '2px',
  borderBottom: `1px solid ${vars.color.divider}`,
  background: vars.color.bgSecondary,
  overflowX: 'auto',
  minHeight: '36px',
  alignItems: 'center',
  paddingLeft: '4px',
  paddingRight: '4px',
})

export const tab = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  color: vars.color.textSecondary,
  whiteSpace: 'nowrap',
  userSelect: 'none',
  transition: 'background 150ms ease, color 150ms ease',
  ':hover': {
    background: vars.color.bgHover,
  },
})

export const tabActive = style({
  background: vars.color.bgActive,
  color: vars.color.textPrimary,
})

export const tabClose = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: '4px',
  cursor: 'pointer',
  opacity: 0.6,
  transition: 'opacity 150ms ease, background 150ms ease',
  ':hover': {
    opacity: 1,
    background: vars.color.bgHover,
  },
})

export const activityDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: vars.color.accent,
  flexShrink: 0,
})

export const permissionDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: vars.color.warning,
  flexShrink: 0,
})

export const tabRenameInput = style({
  background: 'transparent',
  border: `1px solid ${vars.color.borderFocus}`,
  borderRadius: '4px',
  color: vars.color.textPrimary,
  fontSize: '12px',
  padding: '1px 4px',
  outline: 'none',
  width: '120px',
  fontFamily: 'inherit',
})

export const addButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '6px',
  cursor: 'pointer',
  color: vars.color.textSecondary,
  flexShrink: 0,
  transition: 'background 150ms ease, color 150ms ease',
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
})
