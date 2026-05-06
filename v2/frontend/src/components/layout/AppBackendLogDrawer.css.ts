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
  borderRadius: vars.radius.md,
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
