// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const strip = style({
  position: 'sticky',
  top: 0,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.xxl}`,
  background: `color-mix(in srgb, ${vars.color.accent} 5%, ${vars.color.bgSecondary})`,
  borderBottom: `1px solid ${vars.color.divider}`,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
})

export const statusDot = style({
  width: 6,
  height: 6,
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  flexShrink: 0,
})

export const statusDotIdle = style({
  background: vars.color.textDisabled,
})

export const statusDotError = style({
  background: vars.color.danger,
})

export const grow = style({
  flex: 1,
})

export const tokenCount = style({
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
})

export const separator = style({
  color: vars.color.textDisabled,
  opacity: 0.5,
})
