// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 900,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: vars.color.bgOverlay,
  backdropFilter: 'blur(4px)',
})

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  width: '90vw',
  maxWidth: '960px',
  maxHeight: '80vh',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.lg,
  overflow: 'hidden',
})

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
})

export const filePath = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const diffBody = style({
  flex: 1,
  overflow: 'auto',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  lineHeight: '1.6',
})

export const lineRow = style({
  display: 'flex',
  minHeight: '22px',
  padding: `0 ${vars.space.md}`,
})

export const lineNumber = style({
  width: '48px',
  flexShrink: 0,
  textAlign: 'right',
  paddingRight: vars.space.sm,
  color: vars.color.textDisabled,
  userSelect: 'none',
})

export const lineContent = style({
  flex: 1,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
})

export const lineSame = style({
  color: vars.color.textPrimary,
})

export const lineAdd = style({
  background: vars.color.editorDiffAdd,
  color: vars.color.success,
})

export const lineRemove = style({
  background: vars.color.editorDiffRemove,
  color: vars.color.danger,
})

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderTop: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
})

export const btnBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.space.xs} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  border: 'none',
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast}`,
})

export const btnReject = style({
  background: vars.color.dangerMuted,
  color: vars.color.danger,
  selectors: {
    '&:hover': {
      background: vars.color.danger,
      color: vars.color.textInverse,
    },
  },
})

export const btnAccept = style({
  background: vars.color.successMuted,
  color: vars.color.success,
  selectors: {
    '&:hover': {
      background: vars.color.success,
      color: vars.color.textInverse,
    },
  },
})

export const statsBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
})

export const statAdd = style({
  color: vars.color.success,
})

export const statRemove = style({
  color: vars.color.danger,
})
