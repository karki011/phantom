// Author: Subash Karki
import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const blink = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.3 },
});

export const statusDotRunning = style({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: vars.color.accent,
  animation: `${blink} 1s ease-in-out infinite`,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
});

export const statusDotSuccess = style({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: vars.color.success,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
});

export const statusDotError = style({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: vars.color.danger,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
});

export const thinkingCollapsed = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontStyle: 'italic',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderLeft: `2px solid ${vars.color.accent}`,
  cursor: 'pointer',
  ':hover': {
    color: vars.color.textSecondary,
  },
});

export const thinkingExpanded = style({
  fontStyle: 'italic',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderLeft: `2px solid ${vars.color.accent}`,
  whiteSpace: 'pre-wrap',
  cursor: 'pointer',
});

export const thinkingContent = style({
  marginTop: vars.space.xs,
  maxHeight: '200px',
  overflowY: 'auto',
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

/** Separator between tool name and summary in the chip. */
export const toolNameSep = style({
  color: vars.color.textDisabled,
  margin: `0 ${vars.space.xs}`,
});
