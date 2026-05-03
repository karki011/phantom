// Phantom — AI Engine Playground pane styles
// Author: Subash Karki

import { style, globalStyle, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

// ── Layout ────────────────────────────────────────────────────────────────

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  overflow: 'hidden',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const headerTitle = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
});

export const headerBadge = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  background: vars.color.bgTertiary,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
});

// ── Input area ────────────────────────────────────────────────────────────

export const inputArea = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.md,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const inputRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const textarea = style({
  width: '100%',
  minHeight: '80px',
  maxHeight: '160px',
  padding: vars.space.sm,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.5,
  resize: 'vertical',
  outline: 'none',
  transition: `border-color ${vars.animation.fast} ease`,
  ':focus': {
    borderColor: vars.color.accent,
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const cwdDisplay = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const analyzeBtn = style({
  padding: `${vars.space.xs} ${vars.space.md}`,
  background: vars.color.accent,
  color: vars.color.textInverse,
  border: 'none',
  borderRadius: vars.radius.sm,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease, opacity ${vars.animation.fast} ease`,
  whiteSpace: 'nowrap',
  ':hover': {
    filter: 'brightness(1.1)',
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

// ── Results area ──────────────────────────────────────────────────────────

export const resultsArea = style({
  flex: 1,
  overflow: 'auto',
  padding: vars.space.md,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
});

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.md,
  height: '100%',
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.sm,
  textAlign: 'center',
  fontFamily: vars.font.mono,
});

export const emptyIcon = style({
  fontSize: '48px',
  opacity: 0.3,
});

// ── Card (reusable section) ───────────────────────────────────────────────

export const card = style({
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
});

export const cardHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.md}`,
  cursor: 'pointer',
  userSelect: 'none',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const cardTitle = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const cardBadge = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  background: vars.color.bgTertiary,
  padding: `1px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
});

export const cardBody = style({
  padding: `0 ${vars.space.md} ${vars.space.md}`,
  maxHeight: '500px',
  overflow: 'auto',
});

export const chevron = style({
  color: vars.color.textDisabled,
  transition: `transform ${vars.animation.fast} ease`,
  fontSize: '14px',
});

export const chevronOpen = style({
  transform: 'rotate(90deg)',
});

// ── Strategy card (hero) ──────────────────────────────────────────────────

export const strategyCard = style({
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  boxShadow: vars.shadow.glow,
});

export const strategyHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: vars.space.md,
});

export const strategyName = style({
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.accent,
  fontFamily: vars.font.mono,
});

export const confidenceBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgActive,
  borderRadius: vars.radius.sm,
  fontSize: vars.fontSize.md,
  fontWeight: 700,
  fontFamily: vars.font.mono,
  color: vars.color.accent,
});

export const pillRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  marginBottom: vars.space.md,
});

export const pill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `3px ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 500,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
});

export const pillLabel = style({
  color: vars.color.textDisabled,
  fontWeight: 400,
});

// ── Ambiguity gauge ───────────────────────────────────────────────────────

export const gaugeContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const gaugeLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  whiteSpace: 'nowrap',
  minWidth: '80px',
});

export const gaugeTrack = style({
  flex: 1,
  height: '6px',
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.full,
  overflow: 'hidden',
});

export const gaugeFill = style({
  height: '100%',
  borderRadius: vars.radius.full,
  transition: `width ${vars.animation.normal} ease`,
  background: vars.color.accent,
});

export const gaugeValue = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  minWidth: '36px',
  textAlign: 'right',
});

// ── Alternatives table ────────────────────────────────────────────────────

export const table = style({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});

globalStyle(`${table} th`, {
  textAlign: 'left',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderBottom: `1px solid ${vars.color.border}`,
  color: vars.color.textDisabled,
  fontWeight: 500,
  fontSize: vars.fontSize.xs,
});

globalStyle(`${table} td`, {
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderBottom: `1px solid ${vars.color.bgTertiary}`,
  color: vars.color.textSecondary,
  verticalAlign: 'top',
});

export const winnerRow = style({
  background: vars.color.bgActive,
});

globalStyle(`${winnerRow} td`, {
  color: vars.color.accent,
  fontWeight: 600,
});

export const scoreBar = style({
  display: 'inline-block',
  height: '4px',
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  marginLeft: vars.space.xs,
  verticalAlign: 'middle',
});

// ── File list ─────────────────────────────────────────────────────────────

export const fileList = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const fileItem = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

// ── Code block ────────────────────────────────────────────────────────────

export const codeBlock = style({
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: vars.space.sm,
  overflow: 'auto',
  maxHeight: '400px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

// ── Graph stats row ───────────────────────────────────────────────────────

export const statsRow = style({
  display: 'flex',
  gap: vars.space.md,
  flexWrap: 'wrap',
});

export const statBox = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  minWidth: '80px',
});

export const statValue = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 700,
  fontFamily: vars.font.mono,
  color: vars.color.accent,
});

export const statLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
});

// ── Loading state ─────────────────────────────────────────────────────────

const pulse = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 1 },
});

export const loadingIndicator = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  animation: `${pulse} 1.5s ease-in-out infinite`,
});

// ── Duration badge ────────────────────────────────────────────────────────

export const durationBadge = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  marginLeft: 'auto',
});
