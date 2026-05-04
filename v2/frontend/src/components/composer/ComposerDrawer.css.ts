// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

const slideIn = keyframes({
  from: { transform: 'translateX(100%)' },
  to: { transform: 'translateX(0)' },
})

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0, 0, 0, 0.3)',
})

export const drawer = style({
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '480px',
  maxWidth: '100vw',
  zIndex: 1001,
  background: vars.color.bgPrimary,
  borderLeft: `1px solid ${vars.color.divider}`,
  display: 'flex',
  flexDirection: 'column',
  animation: `${slideIn} 200ms ease`,
})

export const header = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: `1px solid ${vars.color.divider}`,
  fontWeight: 600,
  fontSize: '14px',
  color: vars.color.textPrimary,
})

export const closeButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  color: vars.color.textSecondary,
  border: 'none',
  background: 'transparent',
  transition: 'background 150ms ease, color 150ms ease',
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
})

export const sessionList = style({
  flex: 1,
  overflowY: 'auto',
  padding: '8px',
})

export const sessionItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'background 150ms ease',
  ':hover': {
    background: vars.color.bgHover,
  },
})

export const sessionItemActive = style({
  background: vars.color.bgActive,
})

export const sessionIcon = style({
  display: 'flex',
  alignItems: 'center',
  color: vars.color.accent,
  flexShrink: 0,
})

export const sessionInfo = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
})

export const sessionLabel = style({
  fontSize: '13px',
  fontWeight: 500,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const sessionMeta = style({
  fontSize: '11px',
  color: vars.color.textDisabled,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const statusDot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
})

export const statusStreaming = style({
  background: vars.color.accent,
})

export const statusPermission = style({
  background: vars.color.warning,
})

export const statusIdle = style({
  background: vars.color.textDisabled,
})

export const emptyState = style({
  padding: '24px 16px',
  textAlign: 'center',
  color: vars.color.textDisabled,
  fontSize: '13px',
})
