// Author: Subash Karki
// Port of V1 ComposerPane.css.ts toolBlock + ComposerToolStatus.css.ts styles

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

// ── Spinner for running status ────────────────────────────────────────
const spin = keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '100%': { transform: 'rotate(360deg)' },
});

// ── Tool block (chip container) ───────────────────────────────────────
export const toolBlock = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
});

// ── Status dots ───────────────────────────────────────────────────────
export const statusDotRunning = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  height: 12,
  borderRadius: '50%',
  border: `1.5px solid ${vars.color.accent}`,
  borderTopColor: 'transparent',
  animation: `${spin} 0.8s linear infinite`,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
  flexShrink: 0,
});

export const statusDotSuccess = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  height: 12,
  color: vars.color.success,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
  flexShrink: 0,
});

export const statusDotError = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  height: 12,
  color: vars.color.danger,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
  flexShrink: 0,
});

// ── Status labels ─────────────────────────────────────────────────────
export const statusLabelRunning = style({
  fontSize: '10px',
  fontWeight: 500,
  color: vars.color.accent,
  marginLeft: 'auto',
  flexShrink: 0,
  paddingLeft: vars.space.xs,
});

export const statusLabelError = style({
  fontSize: '10px',
  fontWeight: 500,
  color: vars.color.danger,
  marginLeft: 'auto',
  flexShrink: 0,
  paddingLeft: vars.space.xs,
});

// ── Tool summary / name ───────────────────────────────────────────────
export const toolNameSep = style({
  color: vars.color.textDisabled,
  margin: `0 ${vars.space.xs}`,
  flexShrink: 0,
});

export const toolSummaryLabel = style({
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '65%',
  flexShrink: 1,
});

export const toolBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '9px',
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  background: vars.color.accentMuted,
  color: vars.color.accent,
  marginLeft: vars.space.xs,
  flexShrink: 0,
});

// ── Expand-all toggle row ─────────────────────────────────────────────
export const expandToggleRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} 0`,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const expandToggleBtn = style({
  background: 'none',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  padding: `1px ${vars.space.sm}`,
  cursor: 'pointer',
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const expandToggleCount = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

// ── Group header ──────────────────────────────────────────────────────
export const toolGroupHeader = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  ':hover': {
    borderColor: vars.color.borderHover,
  },
});

export const toolGroupPreview = style({
  color: vars.color.textDisabled,
  fontSize: '0.85em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '60%',
});
