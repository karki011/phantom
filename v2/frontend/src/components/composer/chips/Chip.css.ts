// Author: Subash Karki
import { style, styleVariants } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const chipBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  padding: '0px 4px',
  borderRadius: vars.radius.full,
  fontSize: '11px',
  fontFamily: vars.font.mono,
  lineHeight: '16px',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  border: '1px solid transparent',
  maxWidth: '360px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'none',
})

export const chipStatus = styleVariants({
  success: {
    backgroundColor: vars.color.successMuted,
    color: vars.color.success,
    borderColor: vars.color.success,
  },
  warning: {
    backgroundColor: vars.color.warningMuted,
    color: vars.color.warning,
    borderColor: vars.color.warning,
  },
  error: {
    backgroundColor: vars.color.dangerMuted,
    color: vars.color.danger,
    borderColor: vars.color.danger,
  },
  active: {
    backgroundColor: vars.color.accentMuted,
    color: vars.color.accent,
    borderColor: vars.color.accent,
  },
  neutral: {
    backgroundColor: vars.color.bgTertiary,
    color: vars.color.textSecondary,
    borderColor: vars.color.border,
  },
})

export const chipExpanded = style({
  maxWidth: 'none',
  whiteSpace: 'normal',
  padding: vars.space.sm,
  borderRadius: vars.radius.md,
  flexDirection: 'column',
  alignItems: 'flex-start',
})

export const chipTiming = style({
  color: vars.color.textDisabled,
  fontSize: '10px',
  marginLeft: vars.space.xs,
})

export const chipExpandedContent = style({
  marginTop: vars.space.xs,
  padding: vars.space.sm,
  backgroundColor: vars.color.bgPrimary,
  borderRadius: vars.radius.sm,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  width: '100%',
  maxHeight: '200px',
  overflow: 'auto',
})
