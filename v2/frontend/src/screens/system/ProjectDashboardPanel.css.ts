// PhantomOS v2 — Project Dashboard panel styles
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
  gap: vars.space.sm,
  width: '100%',
  height: '100%',
  overflowY: 'auto',
  animation: `${fadeIn} 400ms ease-out both`,
});

// ── Project card ───────────────────────────────────────────────────────────

export const projectCard = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

// ── Header row ─────────────────────────────────────────────────────────────

export const headerRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  minHeight: '20px',
});

export const colorDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const projectName = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const starIcon = style({
  color: vars.color.warning,
  flexShrink: 0,
});

export const worktreeBadge = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  padding: `0 ${vars.space.sm}`,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  lineHeight: '18px',
});

// ── Stats row ──────────────────────────────────────────────────────────────

export const statsRow = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: vars.space.xs,
});

export const statItem = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '1px',
});

export const statValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  fontWeight: 700,
});

export const statLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  lineHeight: 1,
});

// ── Worktree pills ─────────────────────────────────────────────────────────

export const worktreePills = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.xs,
});

export const worktreePill = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  padding: `0 ${vars.space.sm}`,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '160px',
  lineHeight: '18px',
});

export const defaultBranchPill = style({
  borderColor: vars.color.accentMuted,
  color: vars.color.accent,
});

// ── Empty state ────────────────────────────────────────────────────────────

export const emptyState = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  padding: vars.space.xl,
});
