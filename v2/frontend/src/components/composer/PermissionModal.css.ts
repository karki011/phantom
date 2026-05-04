// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const container = style({
  padding: '12px 16px',
  borderTop: `1px solid ${vars.color.warning}`,
  background: vars.color.warningMuted,
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  alignItems: 'center',
})

export const icon = style({
  color: vars.color.warning,
  flexShrink: 0,
})

export const info = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
})

export const toolLabel = style({
  fontWeight: 600,
  fontSize: '13px',
  color: vars.color.textPrimary,
})

export const description = style({
  fontSize: '12px',
  color: vars.color.textSecondary,
})

export const actions = style({
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  flexShrink: 0,
})

export const approveBtn = style({
  padding: '6px 16px',
  borderRadius: '6px',
  border: 'none',
  background: vars.color.success,
  color: '#fff',
  fontWeight: 500,
  fontSize: '12px',
  cursor: 'pointer',
  ':hover': {
    opacity: 0.9,
  },
})

export const denyBtn = style({
  padding: '6px 16px',
  borderRadius: '6px',
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textPrimary,
  fontWeight: 500,
  fontSize: '12px',
  cursor: 'pointer',
  ':hover': {
    background: vars.color.bgHover,
  },
})
