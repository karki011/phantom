// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const chipBar = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.xs,
  padding: `${vars.space.xs} 0`,
  marginBottom: vars.space.xs,
})

export const overflowPill = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  backgroundColor: vars.color.bgTertiary,
  cursor: 'pointer',
})
