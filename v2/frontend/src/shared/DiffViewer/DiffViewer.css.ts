// Author: Subash Karki

import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const container = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: vars.color.bgPrimary,
})

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
})

export const toolbarBtn = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  background: 'transparent',
  border: `1px solid transparent`,
  borderRadius: vars.radius.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast}, border-color ${vars.animation.fast}`,
  selectors: {
    '&:hover': {
      color: vars.color.textSecondary,
    },
    '&[data-active="true"]': {
      color: vars.color.textPrimary,
      borderColor: vars.color.border,
    },
  },
})

export const scrollArea = style({
  flex: 1,
  overflow: 'auto',
})

export const diffTable = style({
  width: '100%',
  fontFamily: vars.font.mono,
  fontSize: '13px',
  lineHeight: '1.6',
})

export const gutterOld = style({
  width: '48px',
  minWidth: '48px',
  textAlign: 'right',
  paddingRight: vars.space.sm,
  color: vars.color.textDisabled,
  userSelect: 'none',
  verticalAlign: 'top',
  flexShrink: 0,
})

export const gutterNew = style({
  width: '48px',
  minWidth: '48px',
  textAlign: 'right',
  paddingRight: vars.space.sm,
  color: vars.color.textDisabled,
  userSelect: 'none',
  verticalAlign: 'top',
  flexShrink: 0,
})

export const gutterPrefix = style({
  width: '20px',
  minWidth: '20px',
  textAlign: 'center',
  color: vars.color.textDisabled,
  userSelect: 'none',
  verticalAlign: 'top',
  flexShrink: 0,
})

export const lineRow = style({
  display: 'flex',
  minHeight: '22px',
  padding: `0 ${vars.space.sm}`,
})

export const lineRowAdd = style({
  background: vars.color.editorDiffAdd,
})

export const lineRowRemove = style({
  background: vars.color.editorDiffRemove,
})

export const lineContent = style({
  flex: 1,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  paddingLeft: vars.space.xs,
})

export const wordAdd = style({
  background: vars.color.editorDiffAddWord,
  borderRadius: '2px',
  padding: '0 1px',
})

export const wordRemove = style({
  background: vars.color.editorDiffRemoveWord,
  borderRadius: '2px',
  padding: '0 1px',
})

export const collapseBar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.space.xs} 0`,
  background: vars.color.bgTertiary,
  borderTop: `1px solid ${vars.color.divider}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  userSelect: 'none',
  minHeight: '28px',
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
      color: vars.color.textSecondary,
    },
  },
})

export const splitContainer = style({
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
})

export const splitPanel = style({
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  selectors: {
    '&:first-child': {
      borderRight: `1px solid ${vars.color.divider}`,
    },
  },
})

export const emptyLine = style({
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 40%, transparent)`,
})

export const statsBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
})

export const statAdd = style({
  color: vars.color.success,
})

export const statRemove = style({
  color: vars.color.danger,
})
