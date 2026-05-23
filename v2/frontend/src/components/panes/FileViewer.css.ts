// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

// ── Shiki virtualized scroll area ──────────────────────────────────────────

export const scrollArea = style({
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  position: 'relative',
  backgroundColor: vars.color.editorBg,
});

// ── Line row ───────────────────────────────────────────────────────────────

export const lineRow = style({
  display: 'flex',
  alignItems: 'stretch',
  minHeight: 20,
  selectors: {
    '&:hover': {
      background: `color-mix(in srgb, ${vars.color.textPrimary} 3%, transparent)`,
    },
  },
});

// ── Gutter (line numbers) ──────────────────────────────────────────────────

export const gutter = style({
  width: 50,
  minWidth: 50,
  maxWidth: 50,
  textAlign: 'right',
  paddingRight: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: '13px',
  lineHeight: '20px',
  color: vars.color.textDisabled,
  userSelect: 'none',
  flexShrink: 0,
  boxSizing: 'border-box',
});

// ── Line content ───────────────────────────────────────────────────────────

export const lineContent = style({
  flex: 1,
  whiteSpace: 'pre',
  fontFamily: vars.font.mono,
  fontSize: '13px',
  lineHeight: '20px',
  color: vars.color.textPrimary,
  paddingLeft: vars.space.sm,
  overflow: 'hidden',
});

// ── Line wrapping variant (applied via data attribute) ─────────────────────

globalStyle(`${lineContent}[data-wrap="true"]`, {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
});
