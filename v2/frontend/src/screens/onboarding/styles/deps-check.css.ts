// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

const spin = keyframes({
  to: { transform: 'rotate(360deg)' },
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
  gap: vars.space.md,
  padding: `${vars.space.md} ${vars.space.lg}`,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  transition: `border-color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
});

export const rowOk = style({
  borderColor: `color-mix(in srgb, ${vars.color.success} 35%, ${vars.color.border})`,
});

export const rowMissing = style({
  borderColor: `color-mix(in srgb, ${vars.color.danger} 35%, ${vars.color.border})`,
});

export const statusIcon = style({
  width: '22px',
  height: '22px',
  borderRadius: vars.radius.full,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  fontWeight: 700,
  flexShrink: 0,
});

export const statusOk = style({
  background: vars.color.successMuted,
  color: vars.color.success,
  border: `1px solid ${vars.color.success}`,
});

export const statusMissing = style({
  background: vars.color.dangerMuted,
  color: vars.color.danger,
  border: `1px solid ${vars.color.danger}`,
});

export const statusChecking = style({
  background: vars.color.bgPrimary,
  color: vars.color.textSecondary,
  border: `1px solid ${vars.color.border}`,
  animation: `${spin} 800ms linear infinite`,
});

export const info = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  minWidth: 0,
});

export const name = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

export const version = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontWeight: 400,
});

export const path = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const hint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.warning,
});

export const error = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.danger,
});

export const requiredBadge = style({
  fontFamily: vars.font.mono,
  fontSize: '0.625rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: vars.color.danger,
  border: `1px solid ${vars.color.danger}`,
  borderRadius: vars.radius.sm,
  padding: `0 ${vars.space.xs}`,
});

export const skippedBadge = style({
  fontFamily: vars.font.mono,
  fontSize: '0.625rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: vars.color.textDisabled,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: `0 ${vars.space.xs}`,
});

export const recommendedBadge = style({
  fontFamily: vars.font.mono,
  fontSize: '0.625rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: vars.color.accent,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.sm,
  padding: `0 ${vars.space.xs}`,
});

export const groupHeader = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  paddingTop: vars.space.sm,
  paddingLeft: vars.space.xs,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const actions = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: vars.space.xs,
});

export const actionRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const skipLink = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const summary = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textAlign: 'center',
  letterSpacing: '0.05em',
});

export const rowActiveDefault = style({
  borderColor: `color-mix(in srgb, ${vars.color.accent} 55%, ${vars.color.border})`,
  boxShadow: `0 0 0 1px color-mix(in srgb, ${vars.color.accent} 35%, transparent)`,
});

export const starButton = style({
  background: 'transparent',
  border: 'none',
  padding: vars.space.xs,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: vars.color.textSecondary,
  borderRadius: vars.radius.sm,
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    background: vars.color.bgPrimary,
  },
  ':disabled': {
    cursor: 'default',
    opacity: 0.5,
  },
  selectors: {
    '&[data-active="true"]': {
      color: vars.color.accent,
    },
  },
});

export const defaultProviderLine = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textAlign: 'center',
  letterSpacing: '0.05em',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
});

export const defaultProviderLineName = style({
  color: vars.color.accent,
  fontWeight: 600,
});

export const summaryWarn = style({
  color: vars.color.warning,
});

export const summaryOk = style({
  color: vars.color.success,
});

export const summaryBlocked = style({
  color: vars.color.danger,
});

/* ───────────── InstallGuide disclosure ───────────── */

export const guideContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  marginTop: vars.space.xs,
});

export const guideToggle = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  alignSelf: 'flex-start',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const guideToggleIcon = style({
  display: 'inline-block',
  transition: `transform ${vars.animation.fast} ease`,
  fontSize: '0.75rem',
});

export const guideToggleIconOpen = style({
  transform: 'rotate(90deg)',
});

export const guideBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: vars.space.sm,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
});

export const guideCommand = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
});

export const guideCommandText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
});

export const guideCopyBtn = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flexShrink: 0,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: vars.color.borderFocus,
  },
});

export const guideCopyLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
});

export const guideDocsLink = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  padding: `${vars.space.xs} 0 0 0`,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  alignSelf: 'flex-start',
  textDecoration: 'none',
  ':hover': {
    color: vars.color.accentHover,
    textDecoration: 'underline',
  },
});
