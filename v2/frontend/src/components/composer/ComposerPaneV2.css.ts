// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const paneRoot = style({
  display: 'flex',
  flexDirection: 'row',
  height: '100%',
  background: `color-mix(in srgb, ${vars.color.accent} 3%, ${vars.color.bgPrimary})`,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  overflow: 'hidden',
})

export const mainColumn = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
})

export const sessionContent = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
})
