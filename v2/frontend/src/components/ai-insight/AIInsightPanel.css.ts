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

const pulse = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.5 },
});

export const loading = style({
  animation: `${pulse} 1.5s ease-in-out infinite`,
});

// ── Strategy Badge ──────────────────────────────────────────────────────

export const strategyRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const strategyLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: 500,
});

export const strategyBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  fontFamily: vars.font.mono,
  background: vars.color.accentMuted,
  color: vars.color.accent,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
});

export const strategyDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  boxShadow: `0 0 6px ${vars.color.accent}`,
});

// ── Assessment Card ─────────────────────────────────────────────────────

export const assessmentGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.space.sm,
});

export const assessmentItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: vars.space.sm,
  background: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
});

export const assessmentLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const assessmentValue = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  fontFamily: vars.font.mono,
  textTransform: 'capitalize',
});

// ── Score Bar ───────────────────────────────────────────────────────────

export const scoreBarContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
});

export const scoreBarLabel = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const scoreBarTrack = style({
  height: '4px',
  borderRadius: vars.radius.full,
  background: vars.color.bgSecondary,
  overflow: 'hidden',
});

export const scoreBarFill = style({
  height: '100%',
  borderRadius: vars.radius.full,
  transition: `width ${vars.animation.normal} ease`,
});

// ── Context Coverage ────────────────────────────────────────────────────

export const contextRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
});

export const contextStat = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  flex: 1,
});

export const contextStatValue = style({
  fontSize: vars.fontSize.md,
  fontWeight: 700,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
});

export const contextStatLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const coverageRing = style({
  width: '44px',
  height: '44px',
  flexShrink: 0,
});

// ── Knowledge Stats ─────────────────────────────────────────────────────

export const knowledgeRow = style({
  display: 'flex',
  gap: vars.space.sm,
});

export const knowledgeStat = style({
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

export const knowledgeValue = style({
  fontSize: vars.fontSize.md,
  fontWeight: 700,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
});

export const knowledgeLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
});

// ── Recent Decisions ────────────────────────────────────────────────────

export const sectionLabel = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: vars.space.xs,
});

export const decisionList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const decisionRow = style({
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

export const decisionOutcome = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const decisionGoal = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: vars.color.textSecondary,
});

export const decisionStrategy = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const decisionTime = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const emptyState = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  padding: vars.space.md,
});

// ── Divider ─────────────────────────────────────────────────────────────

export const divider = style({
  height: '1px',
  background: vars.color.divider,
  margin: `${vars.space.xs} 0`,
});
