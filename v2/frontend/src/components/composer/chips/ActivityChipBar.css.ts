// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const activityBar = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.xs,
  padding: `${vars.space.xs} 0`,
  marginTop: vars.space.xs,
  borderTop: `1px solid ${vars.color.divider}`,
})

export const activityLabel = style({
  fontSize: '10px',
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  lineHeight: '20px',
  marginRight: vars.space.xs,
  userSelect: 'none',
})
