// PhantomOS v2 — AnalyticsPanel session analytics styles
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

export const sectionTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: 0,
});

// ── Summary stats row ───────────────────────────────────────────────────────

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

// ── Chart section ───────────────────────────────────────────────────────────

export const chartSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

// ── Provider breakdown ──────────────────────────────────────────────────────

export const providerSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const providerBar = style({
  display: 'flex',
  height: '8px',
  borderRadius: vars.radius.full,
  overflow: 'hidden',
  backgroundColor: vars.color.bgTertiary,
});

export const providerSegment = style({
  height: '100%',
  transition: `width ${vars.animation.normal} ease-out`,
});

export const providerLegend = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.md,
});

export const legendItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const legendDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const legendLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const legendCount = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

// ── Empty / loading states ──────────────────────────────────────────────────

export const emptyState = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  padding: vars.space.xl,
});
