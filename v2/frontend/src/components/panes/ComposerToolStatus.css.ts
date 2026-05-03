// Author: Subash Karki
import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const spin = keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '100%': { transform: 'rotate(360deg)' },
});

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

/** Status label text next to the status icon. */
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

export const thinkingCollapsed = style({
  display: 'flex',
  flexDirection: 'column',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  borderRadius: vars.radius.sm,
  background: vars.color.bgSecondary,
  overflow: 'hidden',
  cursor: 'pointer',
  ':hover': {
    background: vars.color.bgTertiary,
  },
});

export const thinkingExpanded = style({
  display: 'flex',
  flexDirection: 'column',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  borderRadius: vars.radius.sm,
  background: vars.color.bgSecondary,
  overflow: 'hidden',
  cursor: 'pointer',
});

export const thinkingHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  minWidth: 0,
  userSelect: 'none',
});

export const thinkingLabel = style({
  fontWeight: 500,
  fontStyle: 'italic',
  flexShrink: 0,
});

export const thinkingPreview = style({
  color: vars.color.textDisabled,
  fontSize: '0.85em',
  fontStyle: 'italic',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
  opacity: 0.7,
});

export const thinkingLineCount = style({
  color: vars.color.textDisabled,
  fontSize: '0.75em',
  flexShrink: 0,
  opacity: 0.6,
});

export const thinkingContent = style({
  margin: `0 ${vars.space.sm} ${vars.space.sm}`,
  padding: `${vars.space.sm} 10px`,
  borderRadius: vars.radius.sm,
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  fontFamily: vars.font.mono,
  fontSize: '11px',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '300px',
  overflowY: 'auto',
  fontStyle: 'normal',
  color: vars.color.textSecondary,
});

// ── Rich tool summary styles ──────────────────────────────────────────────

/** Muted, truncated, monospace label showing what the tool is doing. */
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

/** Small pill badge for background agents etc. */
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

/** Flex row with toggle button + count, shown above tool calls when 2+. */
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
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
});

/** Group collapse header row. */
export const toolGroupHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const toolGroupPreview = style({
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
});

export const toolGroupChildren = style({
  paddingLeft: vars.space.md,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

/** Muted token estimate label shown at the bottom of expanded tool calls. */
export const tokenEstimate = style({
  display: 'flex',
  justifyContent: 'flex-end',
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  marginTop: '4px',
  opacity: 0.7,
  userSelect: 'none',
});

/** Separator between tool name and summary in the chip. */
export const toolNameSep = style({
  color: vars.color.textDisabled,
  margin: `0 ${vars.space.xs}`,
});
