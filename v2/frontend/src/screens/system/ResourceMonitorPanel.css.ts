// PhantomOS v2 — ResourceMonitorPanel styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const panelContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  width: '100%',
  height: '100%',
  animation: `${fadeIn} 400ms ease-out both`,
});

export const panelTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: 0,
});

export const sectionTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: 0,
});

// ── Process Overview stat cards ────────────────────────────────────────────

export const statsRow = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: vars.space.sm,
});

export const statCard = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  alignItems: 'center',
  textAlign: 'center',
});

export const statValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 700,
});

export const statLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

// ── Section container ──────────────────────────────────────────────────────

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

// ── Session rows ───────────────────────────────────────────────────────────

export const sessionRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  minHeight: '36px',
});

export const providerDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const sessionProvider = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  flexShrink: 0,
});

export const sessionModel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const statusDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const sessionCwd = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
});

export const contextBarOuter = style({
  width: '48px',
  height: '4px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.bgSecondary,
  flexShrink: 0,
  overflow: 'hidden',
});

export const contextBarInner = style({
  height: '100%',
  borderRadius: vars.radius.full,
  transition: `width ${vars.animation.normal} ease-out`,
});

export const sessionTokens = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

export const sessionDuration = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

// ── Terminal rows ──────────────────────────────────────────────────────────

export const terminalRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  minHeight: '32px',
});

export const terminalIcon = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const terminalId = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  maxWidth: '80px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

export const terminalCwd = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
});

export const terminalSize = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

// ── Empty state ────────────────────────────────────────────────────────────

export const emptyState = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  padding: vars.space.md,
});

// ── Action buttons ─────────────────────────────────────────────────────────

export const actionButtonRow = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  marginLeft: 'auto',
  flexShrink: 0,
});

export const actionButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: '22px',
  padding: `0 ${vars.space.sm}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: vars.color.textSecondary,
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  outline: 'none',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
    borderColor: vars.color.accentMuted,
  },
  ':disabled': {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
});

export const actionButtonDanger = style({
  color: vars.color.danger,
  borderColor: vars.color.danger,
  ':hover': {
    color: vars.color.bgPrimary,
    background: vars.color.danger,
    borderColor: vars.color.danger,
  },
});

// kept for backwards-compat (terminal row uses this too)
export const killButton = actionButton;
