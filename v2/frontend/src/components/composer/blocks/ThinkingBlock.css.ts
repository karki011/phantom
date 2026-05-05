// Author: Subash Karki
// Port of V1 ComposerToolStatus.css.ts thinking styles

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

// ── Collapsed state — subtle bg, hover to expand ──────────────────────
export const collapsed = style({
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

// ── Expanded state — same but no hover shift ──────────────────────────
export const expanded = style({
  display: 'flex',
  flexDirection: 'column',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  borderRadius: vars.radius.sm,
  background: vars.color.bgSecondary,
  overflow: 'hidden',
  cursor: 'pointer',
});

// ── Header row — icon, chevron, label, preview ────────────────────────
export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  minWidth: 0,
  userSelect: 'none',
});

export const label = style({
  fontWeight: 500,
  fontStyle: 'italic',
  flexShrink: 0,
});

export const preview = style({
  color: vars.color.textDisabled,
  fontSize: '0.85em',
  fontStyle: 'italic',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
  opacity: 0.7,
});

export const lineCount = style({
  color: vars.color.textDisabled,
  fontSize: '0.75em',
  flexShrink: 0,
  opacity: 0.6,
});

// ── Thinking content (expanded pre block) ─────────────────────────────
export const content = style({
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
