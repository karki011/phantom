// Phantom — Server log drawer body
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  padding: vars.space.md,
  boxSizing: 'border-box',
});

export const hint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  margin: `0 0 ${vars.space.sm}`,
  flexShrink: 0,
});

// ── Search / filter bar ────────────────────────────────────────────────────

export const searchBar = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderBottom: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  borderRadius: `${vars.radius.md} ${vars.radius.md} 0 0`,
  border: `1px solid ${vars.color.border}`,
  borderBottomWidth: 0,
  flexShrink: 0,
});

export const searchInputWrapper = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  flex: 1,
});

export const searchInput = style({
  flex: 1,
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${vars.color.border}`,
  borderRadius: '6px',
  padding: '4px 28px 4px 8px',
  fontFamily: vars.font.mono,
  fontSize: '11px',
  color: vars.color.textPrimary,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  ':focus': {
    borderColor: vars.color.accent,
    background: 'rgba(255,255,255,0.08)',
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const clearButton = style({
  position: 'absolute',
  right: '6px',
  width: '18px',
  height: '18px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: 0,
  borderRadius: '3px',
  ':hover': {
    color: vars.color.textPrimary,
  },
});

export const filterPills = style({
  display: 'flex',
  flexDirection: 'row',
  gap: '4px',
  flexShrink: 0,
});

export const pill = style({
  padding: '2px 7px',
  borderRadius: '10px',
  fontFamily: vars.font.mono,
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  border: `1px solid ${vars.color.border}`,
  background: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  lineHeight: 1.4,
  ':hover': {
    color: vars.color.textSecondary,
    borderColor: vars.color.textDisabled,
  },
});

export const pillActive = style({
  background: vars.color.accent,
  color: '#fff',
  borderColor: vars.color.accent,
});

export const pillActiveError = style({
  background: vars.color.danger,
  color: '#fff',
  borderColor: vars.color.danger,
});

export const pillActiveWarn = style({
  background: vars.color.warning,
  color: '#000',
  borderColor: vars.color.warning,
});

export const pillActiveInfo = style({
  background: vars.color.info,
  color: '#fff',
  borderColor: vars.color.info,
});

export const pillActiveDebug = style({
  background: vars.color.textDisabled,
  color: vars.color.bgSecondary,
  borderColor: vars.color.textDisabled,
});

export const matchCount = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  marginLeft: 'auto',
  flexShrink: 0,
  userSelect: 'none',
});

// ── Log content ────────────────────────────────────────────────────────────

export const logContainer = style({
  margin: 0,
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: `${vars.space.xs} 0`,
  fontFamily: vars.font.mono,
  fontSize: '11px',
  lineHeight: 1.55,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: `0 0 ${vars.radius.md} ${vars.radius.md}`,
  scrollbarWidth: 'thin',
  scrollbarColor: `${vars.color.border} transparent`,
});

export const logLine = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '6px',
  padding: '1px 10px',
  wordBreak: 'break-word',
  selectors: {
    '&:nth-child(even)': {
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
    },
  },
});

export const logEmpty = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: '11px',
});

export const logTimestamp = style({
  flexShrink: 0,
  color: vars.color.textDisabled,
  fontSize: '10px',
  minWidth: '56px',
  userSelect: 'none',
});

export const logLevelError = style({
  flexShrink: 0,
  minWidth: '38px',
  textAlign: 'center',
  fontSize: '10px',
  fontWeight: 700,
  color: vars.color.danger,
  letterSpacing: '0.03em',
});

export const logLevelWarn = style({
  flexShrink: 0,
  minWidth: '38px',
  textAlign: 'center',
  fontSize: '10px',
  fontWeight: 700,
  color: vars.color.warning,
  letterSpacing: '0.03em',
});

export const logLevelInfo = style({
  flexShrink: 0,
  minWidth: '38px',
  textAlign: 'center',
  fontSize: '10px',
  fontWeight: 700,
  color: vars.color.info,
  letterSpacing: '0.03em',
});

export const logLevelDebug = style({
  flexShrink: 0,
  minWidth: '38px',
  textAlign: 'center',
  fontSize: '10px',
  fontWeight: 700,
  color: vars.color.textDisabled,
  letterSpacing: '0.03em',
});

export const logLevelDefault = style({
  flexShrink: 0,
  minWidth: '38px',
  textAlign: 'center',
  fontSize: '10px',
  color: vars.color.textDisabled,
});

export const logMessage = style({
  flex: 1,
  color: vars.color.textSecondary,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

export const logMessageError = style({
  flex: 1,
  color: vars.color.danger,
  opacity: 0.9,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

export const logMessageWarn = style({
  flex: 1,
  color: vars.color.warning,
  opacity: 0.9,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});
