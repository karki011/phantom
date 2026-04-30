// Phantom — Evolution Panel styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 60%, transparent)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
});

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  marginBottom: vars.space.xs,
});

export const panelIcon = style({
  color: vars.color.accent,
  display: 'flex',
  alignItems: 'center',
});

export const panelTitle = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  letterSpacing: '0.02em',
});

export const refreshButton = style({
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: vars.space.xs,
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    background: vars.color.bgHover,
  },
});

// ── Health Ring ─────────────────────────────────────────────────────────

export const healthRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
});

export const healthRing = style({
  width: '52px',
  height: '52px',
  flexShrink: 0,
});

export const healthStats = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
});

export const healthStatRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const healthStatLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const healthStatValue = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
});

// ── Gap Alerts ──────────────────────────────────────────────────────────

export const gapList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const gapItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  fontSize: vars.fontSize.xs,
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const gapDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const gapLabel = style({
  flex: 1,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const gapRate = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  flexShrink: 0,
});

// ── Patterns Count ──────────────────────────────────────────────────────

export const patternRow = style({
  display: 'flex',
  gap: vars.space.sm,
});

export const patternStat = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  padding: `${vars.space.sm} ${vars.space.xs}`,
  background: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
});

export const patternValue = style({
  fontSize: vars.fontSize.md,
  fontWeight: 700,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
});

export const patternLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
});

// ── Sparkline ───────────────────────────────────────────────────────────

export const sparklineRow = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const sparklineItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} 0`,
});

export const sparklineLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  width: '80px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

export const sparklineSvg = style({
  flex: 1,
  height: '20px',
});

export const sparklineRate = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  color: vars.color.textPrimary,
  width: '36px',
  textAlign: 'right',
  flexShrink: 0,
});

// ── Section Label ───────────────────────────────────────────────────────

export const sectionLabel = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: vars.space.xs,
});

// ── Divider ─────────────────────────────────────────────────────────────

export const divider = style({
  height: '1px',
  background: vars.color.divider,
  margin: `${vars.space.xs} 0`,
});

// ── Empty State ─────────────────────────────────────────────────────────

export const emptyState = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  padding: vars.space.md,
});
