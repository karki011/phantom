import { style, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

const glowPulse = keyframes({
  '0%, 100%': { textShadow: `0 0 20px ${vars.color.accentGlow}, 0 0 40px ${vars.color.accentGlow}` },
  '50%': { textShadow: `0 0 30px ${vars.color.accent}, 0 0 60px ${vars.color.accentGlow}` },
});

export const appContainer = style({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: vars.color.bgPrimary,
  fontFamily: vars.font.body,
});

export const title = style({
  fontFamily: vars.font.display,
  fontSize: '42px',
  fontWeight: 700,
  color: vars.color.accent,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  animation: `${glowPulse} 3s ease-in-out infinite`,
  cursor: 'pointer',
  userSelect: 'none',
});

export const subtitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  marginTop: vars.space.sm,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
});

export const statusBar = style({
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: '28px',
  background: vars.color.bgSecondary,
  borderTop: `1px solid ${vars.color.border}`,
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${vars.space.md}`,
  gap: vars.space.md,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const statusDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  display: 'inline-block',
});

export const statusDotOnline = style({
  backgroundColor: vars.color.success,
  boxShadow: vars.shadow.successGlow,
});

export const statusDotOffline = style({
  backgroundColor: vars.color.danger,
  boxShadow: vars.shadow.dangerGlow,
});

export const healthInfo = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});
