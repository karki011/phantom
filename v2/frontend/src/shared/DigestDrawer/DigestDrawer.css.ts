// Phantom — AI Digest drawer styles
// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const scrollBody = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: vars.space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.md,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 80%, transparent)`,
  border: `1px solid ${vars.color.border}`,
});

export const sectionTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  margin: 0,
});

export const statRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: vars.space.sm,
});

export const statValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
  fontWeight: 700,
});

export const statLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const strategyChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, ${vars.color.border})`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
});

export const chipRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.xs,
});

export const fileItem = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  padding: `${vars.space.xs} 0`,
  borderBottom: `1px solid ${vars.color.divider}`,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  selectors: {
    '&:last-child': {
      borderBottom: 'none',
    },
  },
});

export const summaryText = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap',
  margin: 0,
});

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.md,
  padding: vars.space.xxl,
  color: vars.color.textDisabled,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  textAlign: 'center',
});

export const loadingPulse = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  opacity: 0.5,
});

export const skeleton = style({
  height: '14px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgSecondary,
  animation: 'pulse 1.5s ease-in-out infinite',
});

export const topStrategyHighlight = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.accent,
  fontWeight: 600,
});

export const costBarContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const costBarRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const costBarLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  flexShrink: 0,
  width: '140px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const costBarTrack = style({
  flex: 1,
  height: '4px',
  borderRadius: vars.radius.sm,
  background: vars.color.border,
  overflow: 'hidden',
});

export const costBarFill = style({
  height: '100%',
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.accent} 80%, transparent)`,
  transition: 'width 300ms ease',
});

export const costBarValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  flexShrink: 0,
  width: '48px',
  textAlign: 'right',
});

export const costVersionNote = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  marginTop: vars.space.xs,
  letterSpacing: '0.04em',
});

export const winRateChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.success} 12%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.success} 30%, ${vars.color.border})`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.success,
});

export const dateNav = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
});

export const dateNavButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
    '&:disabled': {
      opacity: 0.3,
      cursor: 'default',
    },
  },
});

export const dateLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 600,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  transition: 'all 150ms ease',
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
      color: vars.color.accent,
    },
  },
});

export const refreshButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  alignSelf: 'flex-start',
  selectors: {
    '&:hover': {
      color: vars.color.textPrimary,
      background: vars.color.bgHover,
      borderColor: vars.color.borderHover,
    },
  },
});
