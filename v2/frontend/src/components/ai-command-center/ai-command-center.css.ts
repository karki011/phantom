// Phantom — AI Command Center styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

// ── Layout ─────────────────────────────────────────────────────────────

export const layout = style({
  display: 'flex',
  flexDirection: 'column',
  height: 'calc(85vh - 120px)',
  overflow: 'hidden',
});

// ── Tab Bar ────────────────────────────────────────────────────────────

export const tabBar = style({
  display: 'flex',
  gap: '2px',
  borderBottom: `1px solid ${vars.color.border}`,
  paddingBottom: '0',
  flexShrink: 0,
});

export const tab = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.body,
  fontWeight: 500,
  color: vars.color.textSecondary,
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  outline: 'none',
  selectors: {
    '&:hover': {
      color: vars.color.textPrimary,
      borderBottomColor: vars.color.accentMuted,
    },
  },
});

export const tabActive = style({
  color: vars.color.accent,
  borderBottomColor: vars.color.accent,
  selectors: {
    '&:hover': {
      color: vars.color.accent,
      borderBottomColor: vars.color.accent,
    },
  },
});

export const tabIcon = style({
  fontSize: '14px',
  lineHeight: 1,
});

// ── Tab Content ────────────────────────────────────────────────────────

export const tabContent = style({
  flex: 1,
  overflowY: 'auto',
  padding: vars.space.lg,
});

// ── Overview Tab ───────────────────────────────────────────────────────

export const overviewGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: vars.space.lg,
});

export const overviewCard = style({
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

export const overviewCardHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const overviewCardIcon = style({
  color: vars.color.accent,
  display: 'flex',
  alignItems: 'center',
});

export const overviewCardTitle = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  letterSpacing: '0.02em',
});

export const overviewStatRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
});

export const overviewStat = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
});

export const overviewStatValue = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 700,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
});

export const overviewStatLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const gapAlertList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const gapAlertItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const gapAlertDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const gapAlertLabel = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const gapAlertRate = style({
  fontFamily: vars.font.mono,
  fontWeight: 600,
  flexShrink: 0,
});

export const emptyState = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  padding: vars.space.xl,
});

// ── Header Icon Pulse ──────────────────────────────────────────────────

const brainPulse = keyframes({
  '0%, 100%': { boxShadow: `0 0 0 0 color-mix(in srgb, ${vars.color.accent} 40%, transparent)` },
  '50%': { boxShadow: `0 0 0 4px color-mix(in srgb, ${vars.color.accent} 0%, transparent)` },
});

export const headerIconPulse = style({
  animation: `${brainPulse} 2s ease-in-out infinite`,
  borderRadius: vars.radius.sm,
});
