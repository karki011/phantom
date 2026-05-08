// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const statusStrip = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderTop: `1px solid ${vars.color.divider}`,
  backgroundColor: vars.color.bgSecondary,
  alignItems: 'center',
  minHeight: '28px',
})
