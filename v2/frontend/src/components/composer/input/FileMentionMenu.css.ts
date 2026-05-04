// Author: Subash Karki
import { style, globalStyle } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const overlay = style({
  position: 'absolute',
  bottom: '100%',
  left: 0,
  right: 0,
  marginBottom: vars.space.xs,
  zIndex: 50,
})

export const menu = style({
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 90%, transparent)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  maxHeight: '300px',
  overflowY: 'auto',
  boxShadow: vars.shadow.lg,
  padding: vars.space.xs,
})

export const item = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.body,
  color: vars.color.textPrimary,
  ':hover': {
    background: vars.color.bgHover,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgActive,
    },
  },
})

export const fileName = style({
  fontWeight: 500,
  fontFamily: vars.font.mono,
  flexShrink: 0,
})

export const filePath = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  direction: 'rtl',
  textAlign: 'left',
})

export const empty = style({
  padding: `${vars.space.md} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  textAlign: 'center',
})

// === Scrollbar ===

globalStyle(`${menu}::-webkit-scrollbar`, {
  width: '4px',
})

globalStyle(`${menu}::-webkit-scrollbar-thumb`, {
  background: vars.color.border,
  borderRadius: '2px',
})

globalStyle(`${menu}::-webkit-scrollbar-track`, {
  background: 'transparent',
})
