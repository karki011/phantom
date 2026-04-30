// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

const textGlow = keyframes({
  '0%, 100%': { textShadow: `0 0 10px ${vars.color.accentGlow}` },
  '50%': { textShadow: `0 0 25px ${vars.color.accent}, 0 0 50px ${vars.color.accentGlow}` },
});

const cursorBlink = keyframes({
  '0%, 49%': { opacity: 1 },
  '50%, 100%': { opacity: 0 },
});

export const bootMark = style({
  position: 'relative',
  zIndex: 1,
  marginBottom: vars.space.xl,
});

export const terminal = style({
  position: 'absolute',
  inset: 0,
  background: vars.color.terminalBg,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  lineHeight: 2,
  color: vars.color.terminalText,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
});

export const linesContainer = style({
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  maxWidth: '700px',
  width: '100%',
});

export const line = style({
  whiteSpace: 'pre-wrap',
  minHeight: '1.8em',
  textAlign: 'center',
});

export const lineNormal = style({
  color: vars.color.terminalText,
});

export const lineTitle = style({
  color: vars.color.accent,
  fontFamily: vars.font.display,
  fontWeight: 700,
  fontSize: vars.fontSize.xxl,
  letterSpacing: '0.2em',
  animation: `${textGlow} 3s ease-in-out infinite`,
  marginBottom: vars.space.md,
});

export const lineSubtitle = style({
  color: vars.color.accentMuted,
  fontSize: vars.fontSize.xs,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  marginBottom: vars.space.lg,
});

export const lineAccent = style({
  color: vars.color.accent,
  fontWeight: 600,
  fontSize: vars.fontSize.md,
});

export const lineSuccess = style({
  color: vars.color.success,
  fontWeight: 600,
  fontSize: vars.fontSize.md,
});

export const lineDim = style({
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
});

export const lineDramatic = style({
  color: vars.color.textPrimary,
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.lg,
  letterSpacing: '0.1em',
  marginTop: vars.space.md,
});

export const cursor = style({
  display: 'inline-block',
  width: '8px',
  height: '1.2em',
  marginLeft: '2px',
  background: vars.color.terminalCursor,
  animation: `${cursorBlink} 1s step-end infinite`,
  verticalAlign: 'text-bottom',
});

export const promptSymbol = style({
  color: vars.color.success,
  fontWeight: 600,
  marginRight: '8px',
  userSelect: 'none',
});

export const separator = style({
  width: '120px',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  margin: `${vars.space.sm} auto`,
});
