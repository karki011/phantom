// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const sidebar = style({
  display: 'flex',
  flexDirection: 'column',
  width: 240,
  flex: '0 0 240px',
  borderRight: `1px solid ${vars.color.divider}`,
  background: vars.color.bgSecondary,
  overflow: 'hidden',
  transition: `width ${vars.animation.fast} ease, flex-basis ${vars.animation.fast} ease`,
})

export const sidebarCollapsed = style({
  width: 0,
  flexBasis: 0,
  borderRightWidth: 0,
})

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
})

export const newBtn = style({
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
  borderRadius: vars.radius.sm,
  padding: `4px ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  ':hover': {
    borderColor: vars.color.accent,
    color: vars.color.accent,
  },
})

export const sectionLabel = style({
  padding: `${vars.space.md} ${vars.space.md} ${vars.space.xs}`,
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: vars.color.textDisabled,
})

export const list = style({
  flex: 1,
  overflowY: 'auto',
  padding: `0 ${vars.space.xs} ${vars.space.sm}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
})

export const row = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.xs,
  padding: `6px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
})

export const rowActive = style({
  color: vars.color.accent,
  fontWeight: 600,
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      top: 4,
      bottom: 4,
      width: 2,
      borderRadius: vars.radius.sm,
      background: vars.color.accent,
    },
  },
})

export const rowContent = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  overflow: 'hidden',
})

export const rowName = style({
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const rowPrompt = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '10px',
  color: vars.color.textDisabled,
})

export const rowMeta = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flexShrink: 0,
  selectors: {
    [`${row}:hover &`]: { opacity: 0 },
  },
})

export const rowTime = style({
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease`,
  selectors: {
    [`${row}:hover &`]: { opacity: 1 },
  },
})

export const rowTurns = style({
  fontSize: '9px',
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease`,
  selectors: {
    [`${row}:hover &`]: { opacity: 1 },
  },
})

export const deleteBtn = style({
  position: 'absolute',
  right: 4,
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 18,
  borderRadius: vars.radius.sm,
  border: 0,
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease, background ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,
  padding: 0,
  selectors: {
    [`${row}:hover &`]: { opacity: 1 },
    '&:hover': {
      background: vars.color.dangerMuted,
      color: vars.color.danger,
    },
  },
})

export const liveBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 4px',
  marginRight: 4,
  borderRadius: vars.radius.sm,
  background: vars.color.successMuted,
  color: vars.color.success,
  fontSize: '8px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  lineHeight: '14px',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
})

export const interruptedBadge = style({
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  background: vars.color.warningMuted,
  color: vars.color.warning,
  fontSize: '9px',
  fontWeight: 600,
  lineHeight: '14px',
  whiteSpace: 'nowrap',
})

export const interruptedBanner = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `4px ${vars.space.sm}`,
  margin: `0 ${vars.space.xs} ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  background: vars.color.warningMuted,
  color: vars.color.warning,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.warning} 20%, transparent)`,
  },
})

export const empty = style({
  margin: 'auto',
  padding: vars.space.lg,
  textAlign: 'center',
  fontStyle: 'italic',
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
})

export const footer = style({
  borderTop: `1px solid ${vars.color.divider}`,
  padding: vars.space.xs,
  display: 'flex',
})

export const toggleBtn = style({
  flex: 1,
  background: 'transparent',
  border: 0,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
})

export const expandFloating = style({
  position: 'absolute',
  bottom: vars.space.xs,
  left: 0,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderLeft: 0,
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} 4px`,
  borderTopRightRadius: vars.radius.sm,
  borderBottomRightRadius: vars.radius.sm,
  cursor: 'pointer',
  zIndex: 6,
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: vars.color.borderHover,
  },
})
