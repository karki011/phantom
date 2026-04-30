// Phantom — Session controls styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const controlsCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.md,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
  cursor: 'default',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
    boxShadow: `0 0 8px color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

export const controlsHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const controlsTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 400,
});

export const controlsIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
});

export const controlsRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flexWrap: 'nowrap',
});

export const controlButtons = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  marginLeft: 'auto',
  flexShrink: 0,
});

export const sessionName = style({
  fontSize: '0.75rem',
  color: vars.color.textPrimary,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '200px',
});

export const sessionModel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
});

export const statusBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
});

export const statusActive = style({
  backgroundColor: `color-mix(in srgb, ${vars.color.success} 15%, transparent)`,
  color: vars.color.success,
});

export const statusPaused = style({
  backgroundColor: 'rgba(245, 158, 11, 0.15)',
  color: '#f59e0b',
});

export const controlButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '3px 8px',
  borderRadius: vars.radius.sm,
  fontSize: '0.65rem',
  fontFamily: vars.font.mono,
  fontWeight: 400,
  border: 'none',
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  transition: `all 150ms ease`,
  ':hover': {
    color: vars.color.accent,
  },
});

export const controlButtonDanger = style({
  ':hover': {
    color: vars.color.danger,
  },
});

export const policyGroup = style({
  display: 'inline-flex',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
});

export const policyOption = style({
  padding: '3px 8px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  background: 'transparent',
  color: vars.color.textDisabled,
  border: 'none',
  cursor: 'pointer',
  transition: `all 150ms ease`,
  borderRight: `1px solid ${vars.color.border}`,
  ':hover': {
    color: vars.color.textSecondary,
    background: vars.color.bgHover,
  },
  selectors: {
    '&:last-child': { borderRight: 'none' },
  },
});

export const policyOptionActive = style({
  background: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
  fontWeight: 600,
});

export const controlsCardExternal = style({
});

export const externalBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '1px 6px',
  borderRadius: '4px',
  fontSize: '0.6rem',
  fontWeight: 600,
  fontFamily: vars.font.mono,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  backgroundColor: 'rgba(107, 114, 128, 0.15)',
  color: vars.color.textDisabled,
});

export const controlButtonAttach = style({
  color: vars.color.accent,
});

export const wardBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '18px',
  height: '18px',
  padding: '0 4px',
  borderRadius: '9px',
  fontSize: '0.6rem',
  fontWeight: 700,
  fontFamily: vars.font.mono,
  backgroundColor: 'rgba(245, 158, 11, 0.2)',
  color: '#f59e0b',
  marginLeft: 'auto',
});

export const taskSection = style({
  borderTop: `1px solid ${vars.color.border}`,
  paddingTop: vars.space.sm,
  marginTop: vars.space.xs,
});

export const taskTrigger = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  background: 'none',
  border: 'none',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  padding: '0',
  width: '100%',
  transition: `color ${vars.animation.fast} ease`,
  ':hover': { color: vars.color.accent },
  selectors: {
    '[data-expanded] &': { color: vars.color.textPrimary },
  },
});

export const taskChevron = style({
  display: 'flex',
  alignItems: 'center',
  transition: `transform ${vars.animation.fast} ease`,
  selectors: {
    '[data-expanded] &': { transform: 'rotate(90deg)' },
  },
});

export const taskContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  marginTop: vars.space.xs,
  paddingLeft: vars.space.md,
  overflow: 'hidden',
});

export const taskItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  padding: `2px 0`,
});

export const taskItemCompleted = style({
  color: vars.color.textDisabled,
});

export const taskIconDone = style({
  color: vars.color.success,
  flexShrink: 0,
});

export const taskIconProgress = style({
  color: vars.color.accent,
  flexShrink: 0,
  animation: 'spin 1s linear infinite',
});

export const taskIconPending = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const taskLabel = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const taskLabelDone = style({
  textDecoration: 'line-through',
});

export const taskCrew = style({
  fontSize: '0.6rem',
  color: vars.color.accent,
  flexShrink: 0,
});

export const taskDuration = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  flexShrink: 0,
  minWidth: '28px',
  textAlign: 'right',
});

export const taskTodo = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  flexShrink: 0,
  fontStyle: 'italic',
});

export const planBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
  animation: 'pulse 2s ease-in-out infinite',
});
