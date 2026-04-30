// PhantomOS v2 — Activity Journal styles
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
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

// ── Dropdown Menu (project filter) ──────────────────────────────────────────

export const dropdownTrigger = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: `4px ${vars.space.md}`,
  fontSize: '0.73rem',
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  outline: 'none',
  minWidth: '120px',
  transition: `border-color ${vars.animation.fast} ease`,
  selectors: {
    '&:hover': { borderColor: vars.color.borderHover },
    '&[data-expanded]': { borderColor: vars.color.accent },
  },
});

export const dropdownTriggerIcon = style({
  height: '12px',
  width: '12px',
  flexShrink: 0,
  color: vars.color.textDisabled,
  transition: `transform ${vars.animation.fast} ease`,
  selectors: {
    '&[data-expanded]': { transform: 'rotate(180deg)' },
  },
});

export const dropdownContent = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.xs} 0`,
  boxShadow: vars.shadow.md,
  zIndex: 500,
  maxHeight: '200px',
  overflowY: 'auto',
  outline: 'none',
  transformOrigin: 'var(--kb-menu-content-transform-origin)',
});

export const dropdownItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontFamily: vars.font.mono,
  fontSize: '0.73rem',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  outline: 'none',
  borderRadius: 0,
  userSelect: 'none',
  transition: `background ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,
  selectors: {
    '&[data-highlighted]': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.accent,
    },
  },
});

export const dropdownItemActive = style({
  color: vars.color.accent,
});

// === Inline Rendering ===

export const markdownLink = style({
  color: '#a855f7',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
  ':hover': {
    textDecoration: 'underline',
  },
});

export const bracketSpan = style({
  color: vars.color.accent,
  fontWeight: 600,
});

export const prHashSpan = style({
  color: '#a855f7',
  fontWeight: 600,
});

export const amountSpan = style({
  color: vars.color.xp,
  fontWeight: 600,
});

export const checkmarkSpan = style({
  color: vars.color.success,
  fontWeight: 600,
});

// === Section Header ===

export const sectionHeaderRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.md} 0 ${vars.space.xs}`,
});

export const sectionHeaderIcon = style({
  color: vars.color.accent,
  display: 'flex',
  alignItems: 'center',
});

export const sectionHeaderTitle = style({
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: vars.color.textSecondary,
  flex: 1,
});

export const sectionHeaderTimestamp = style({
  fontSize: '0.625rem',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
});

export const sectionHeaderLock = style({
  color: vars.color.textDisabled,
  opacity: 0.4,
});

// === Content Block ===

export const contentBlock = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: 'var(--block-bg)',
  border: '1px solid var(--block-border)',
});

export const narrativeBlock = style({
  marginTop: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.accent} 6%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
  fontSize: '0.85rem',
  lineHeight: 1.6,
  color: vars.color.textPrimary,
  whiteSpace: 'pre-wrap',
});

export const narrativeLabel = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: vars.color.accent,
  marginBottom: vars.space.xs,
});

export const narrativePending = style({
  marginTop: vars.space.sm,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.75rem',
  color: vars.color.textSecondary,
  fontStyle: 'italic',
  opacity: 0.85,
});

export const contentBlockHeading = style({
  fontSize: '0.8rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  marginBottom: vars.space.xs,
  lineHeight: 1.5,
});

export const bulletRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: vars.space.sm,
  padding: '3px 0',
});

export const bulletDot = style({
  color: vars.color.accent,
  fontSize: '0.7rem',
  marginTop: '2px',
  flexShrink: 0,
});

export const bulletText = style({
  fontSize: '0.78rem',
  color: vars.color.textSecondary,
  lineHeight: 1.5,
});

export const subBulletText = style({
  fontSize: '0.75rem',
  color: vars.color.textDisabled,
  lineHeight: 1.5,
  paddingLeft: `calc(${vars.space.sm} + 0.7rem + ${vars.space.sm})`,
  padding: '1px 0',
});

export const plainText = style({
  fontSize: '0.78rem',
  color: vars.color.textSecondary,
  lineHeight: 1.5,
  padding: '2px 0',
});

// === Work Log ===

export const workLogContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.accent} 6%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  maxHeight: '320px',
  overflowY: 'auto',
});

export const workLogRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  padding: `${vars.space.xs} 0`,
});

export const workLogTime = style({
  fontSize: '0.7rem',
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  minWidth: '40px',
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
});

export const workLogEvent = style({
  fontSize: '0.78rem',
  color: vars.color.textSecondary,
  lineHeight: 1.4,
});

// === Generate Button ===

export const generateButton = style({
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  textAlign: 'center',
  cursor: 'pointer',
  background: vars.color.accent,
  color: vars.color.textInverse,
  fontSize: '0.73rem',
  fontWeight: 600,
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  width: 'fit-content',
  fontFamily: 'inherit',
  transition: `all ${vars.animation.fast} ease`,
  selectors: {
    '&[data-generating="true"]': {
      cursor: 'default',
      background: vars.color.bgTertiary,
      color: vars.color.textDisabled,
    },
  },
});

export const generateButtonSpinner = style({
  animation: 'journal-spin 1s linear infinite',
});

// === Date Pagination ===

export const datePaginationContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const datePaginationIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
});

export const datePaginationLabel = style({
  fontSize: '0.88rem',
  fontWeight: 600,
  color: vars.color.textPrimary,
  flex: 1,
  fontFamily: vars.font.body,
});

export const navButton = style({
  cursor: 'pointer',
  padding: '3px 8px',
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  transition: `background ${vars.animation.fast} ease`,
  selectors: {
    '&[data-disabled="true"]': {
      opacity: 0.3,
    },
  },
});

export const todayButton = style({
  cursor: 'pointer',
  padding: '3px 10px',
  borderRadius: vars.radius.sm,
  fontSize: '0.68rem',
  fontWeight: 600,
  color: vars.color.accent,
  border: `1px solid ${vars.color.accent}`,
  background: 'transparent',
  fontFamily: 'inherit',
});

export const dropdownTriggerFlex = style({
  flex: 1,
  textAlign: 'left',
});

// === Journal Body ===

export const journalLoading = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.xl,
  color: vars.color.textDisabled,
});

export const journalSections = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
});

// Scroll container for the body of Morning Brief / Work Log / End of Day.
// Caps each section so a long brief or busy work log doesn't push the others
// off-screen, and gives a thin scrollbar inside the section.
export const sectionScroll = style({
  maxHeight: '280px',
  overflowY: 'auto',
  paddingRight: vars.space.xs,
  scrollbarWidth: 'thin',
  scrollbarColor: `${vars.color.border} transparent`,
});

export const emptyWorkLog = style({
  fontSize: '0.75rem',
  color: vars.color.textDisabled,
  fontStyle: 'italic',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.accent} 6%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
});

export const notesTextarea = style({
  width: '100%',
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: '0.78rem',
  borderRadius: vars.radius.md,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
  outline: 'none',
  fontFamily: 'inherit',
  resize: 'vertical',
  lineHeight: 1.6,
  boxSizing: 'border-box',
});
