// PhantomOS v2 — Activity Journal styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

// ── Animations ───────────────────────────────────────────────────────────────

const resumePulse = keyframes({
  '0%, 100%': {
    boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  },
  '50%': {
    boxShadow: `0 0 24px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  },
});

// ── Layout ───────────────────────────────────────────────────────────────────

export const journalContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xl,
  padding: vars.space.xxl,
  overflowY: 'auto',
  height: '100%',
  boxSizing: 'border-box',
  background: vars.color.bgPrimary,
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

// ── Calendar Navigation ─────────────────────────────────────────────────────

export const calendarContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, ${vars.color.border})`,
});

export const calendarHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const calendarTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
  fontWeight: 600,
  letterSpacing: '0.04em',
});

export const calendarNavButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

export const calendarGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '2px',
  width: '100%',
});

export const calendarWeekday = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textAlign: 'center',
  padding: `${vars.space.xs} 0`,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
});

export const calendarDay = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  height: '32px',
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const calendarDayEmpty = style({
  height: '32px',
});

export const calendarDayToday = style({
  borderColor: `color-mix(in srgb, ${vars.color.accent} 50%, transparent)`,
  color: vars.color.accent,
  fontWeight: 600,
});

export const calendarDaySelected = style({
  background: vars.color.accentMuted,
  borderColor: vars.color.accent,
  color: vars.color.textPrimary,
  fontWeight: 700,
});

export const calendarDayDimmed = style({
  color: vars.color.textDisabled,
  cursor: 'default',
  ':hover': {
    background: 'transparent',
    color: vars.color.textDisabled,
  },
});

export const calendarDayDot = style({
  position: 'absolute',
  bottom: '3px',
  width: '4px',
  height: '4px',
  borderRadius: vars.radius.full,
  background: vars.color.accent,
});

// ── Day Header ───────────────────────────────────────────────────────────────

export const dayHeader = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const dayHeaderTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.lg,
  color: vars.color.textPrimary,
  fontWeight: 700,
  letterSpacing: '0.04em',
});

export const dayHeaderStats = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
});

export const dayHeaderPrs = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
  marginTop: vars.space.xs,
});

// ── Session Card ─────────────────────────────────────────────────────────────

export const sessionCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  background: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
    boxShadow: `0 0 8px color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

export const sessionCardHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  cursor: 'pointer',
});

export const sessionCardHeaderLeft = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  flex: 1,
  minWidth: 0,
});

export const sessionCardMeta = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
});

export const sessionCardPrompt = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sessionCardFiles = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
});

export const sessionCardDiff = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  display: 'inline-flex',
  gap: '3px',
});

export const diffAdded = style({
  color: vars.color.success,
});

export const diffRemoved = style({
  color: vars.color.danger,
});

export const sessionCardFooter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
});

export const chevronIcon = style({
  color: vars.color.textDisabled,
  transition: `transform ${vars.animation.fast} ease`,
  flexShrink: 0,
});

export const chevronOpen = style({
  transform: 'rotate(90deg)',
});

// ── Session Expanded Details ────────────────────────────────────────────────

export const sessionDetails = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  paddingTop: vars.space.md,
  borderTop: `1px solid ${vars.color.divider}`,
});

export const detailSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const detailLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
});

export const detailValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const fileList = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.xs,
});

export const fileChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const toolBreakdownRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const toolBreakdownBar = style({
  height: '3px',
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  transition: `width ${vars.animation.normal} ease`,
});

// ── Resume Bar ───────────────────────────────────────────────────────────────

export const resumeBar = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  background: vars.color.bgSecondary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 35%, ${vars.color.border})`,
  animation: `${resumePulse} 4s ease-in-out infinite`,
});

export const resumeBarHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const resumeBarIcon = style({
  color: vars.color.accent,
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const resumeBarTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 600,
});

export const resumeBarPrompt = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const resumeBarMeta = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
});

export const resumeBarOutcome = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const resumeBarActions = style({
  display: 'flex',
  gap: vars.space.sm,
  marginTop: vars.space.xs,
});

export const resumeBarButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  background: vars.color.accent,
  color: vars.color.textInverse,
  border: 'none',
  cursor: 'pointer',
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    opacity: '0.9',
    boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  },
});

export const resumeBarButtonSecondary = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  color: vars.color.accent,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
  cursor: 'pointer',
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: `color-mix(in srgb, ${vars.color.accent} 22%, transparent)`,
    borderColor: vars.color.accent,
  },
});

// ── PR Badge ─────────────────────────────────────────────────────────────────

export const prBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  selectors: {
    '&[data-status="open"]': {
      background: vars.color.accentMuted,
      color: vars.color.accent,
      border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
    },
    '&[data-status="merged"]': {
      background: vars.color.successMuted,
      color: vars.color.success,
      border: `1px solid color-mix(in srgb, ${vars.color.success} 30%, transparent)`,
    },
    '&[data-status="closed"]': {
      background: vars.color.dangerMuted,
      color: vars.color.danger,
      border: `1px solid color-mix(in srgb, ${vars.color.danger} 30%, transparent)`,
    },
  },
});

// ── Stat Row & Chips ─────────────────────────────────────────────────────────

export const statRow = style({
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  alignItems: 'center',
});

export const statChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.md,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

// ── Timeline Event ───────────────────────────────────────────────────────────

export const timelineEvent = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: vars.space.md,
  paddingLeft: vars.space.lg,
  borderLeft: `2px solid color-mix(in srgb, ${vars.color.accent} 30%, ${vars.color.border})`,
  position: 'relative',
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      left: '-5px',
      top: vars.space.xs,
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: vars.color.accent,
      boxShadow: `0 0 6px color-mix(in srgb, ${vars.color.accent} 40%, transparent)`,
    },
  },
});

// ── Status Badges ───────────────────────────────────────────────────────────

export const statusBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const statusDone = style({
  background: vars.color.successMuted,
  color: vars.color.success,
});

export const statusActive = style({
  background: vars.color.accentMuted,
  color: vars.color.accent,
});

export const statusInterrupted = style({
  background: vars.color.warningMuted,
  color: vars.color.warning,
});

// ── Empty State ─────────────────────────────────────────────────────────────

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.md,
  padding: vars.space.xxl,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  textAlign: 'center',
});

export const emptyStateIcon = style({
  color: vars.color.textDisabled,
  opacity: 0.4,
});

// ── Section Divider ─────────────────────────────────────────────────────────

export const sectionDivider = style({
  width: '100%',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  opacity: 0.3,
});

// ── Dot Separator ───────────────────────────────────────────────────────────

export const dot = style({
  color: vars.color.textDisabled,
  userSelect: 'none',
});

// ── Session List ────────────────────────────────────────────────────────────

export const sessionList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
});

// ── Weekly Footer ────────────────────────────────────────────────────────────

export const weeklyFooter = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  padding: `${vars.space.md} ${vars.space.xl}`,
  background: vars.color.bgSecondary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, ${vars.color.border})`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});
