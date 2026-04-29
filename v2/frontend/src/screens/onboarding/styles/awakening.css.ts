// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

const glowPulse = keyframes({
  '0%': { opacity: 0.7 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.7 },
});

export const awakeningContainer = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xl,
  maxWidth: '560px',
  width: '100%',
  margin: '0 auto',
  padding: vars.space.xl,
  minHeight: '100vh',
});

export const markBlock = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: vars.space.sm,
});

export const summaryList = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.sm,
  width: '100%',
});

export const summaryLine = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  textAlign: 'center',
  opacity: 0,
  transform: 'translateY(8px)',
  transition: `all ${vars.animation.normal} ease-out`,
});

export const summaryLineVisible = style({
  opacity: 1,
  transform: 'translateY(0)',
});

export const summaryLineAccent = style({
  color: vars.color.accent,
});

export const authorityLine = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  color: vars.color.textDisabled,
  letterSpacing: '2px',
  textTransform: 'uppercase',
  textAlign: 'center',
  transition: `all ${vars.animation.slow} ease-out`,
});

export const authorityGranted = style({
  color: vars.color.accent,
  textShadow: `0 0 20px ${vars.color.accentGlow}, 0 0 40px ${vars.color.accentMuted}`,
});

export const hunterCard = style({
  width: '100%',
  padding: vars.space.xl,
  borderRadius: vars.radius.lg,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.accent}`,
  boxShadow: `0 0 20px color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  opacity: 0,
  transform: 'translateY(12px)',
  transition: `all ${vars.animation.normal} ease-out`,
});

export const hunterCardVisible = style({
  opacity: 1,
  transform: 'translateY(0)',
});

export const hunterName = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xxl,
  color: vars.color.accent,
  letterSpacing: '1px',
  textAlign: 'center',
  marginBottom: vars.space.md,
});

export const hunterStats = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.space.lg,
  textAlign: 'center',
});

export const hunterStat = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px',
});

export const hunterStatLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
});

export const hunterStatValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.lg,
  color: vars.color.textPrimary,
  fontWeight: '600',
});

export const hunterObjective = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  textAlign: 'center',
  marginTop: vars.space.md,
  paddingTop: vars.space.md,
  borderTop: `1px solid ${vars.color.divider}`,
});

export const continueRow = style({
  display: 'flex',
  justifyContent: 'center',
  marginTop: vars.space.xxl,
  paddingTop: vars.space.lg,
});

export const enterButton = style({
  fontSize: vars.fontSize.lg,
  letterSpacing: '3px',
  textTransform: 'uppercase',
  fontFamily: vars.font.display,
  padding: `${vars.space.md} ${vars.space.xxl}`,
  background: vars.color.accent,
  color: vars.color.textInverse,
  border: 'none',
  borderRadius: vars.radius.md,
  cursor: 'pointer',
  boxShadow: `0 0 20px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  animation: `${glowPulse} 2s ease-in-out infinite`,
  selectors: {
    '&:hover': {
      boxShadow: `0 0 35px color-mix(in srgb, ${vars.color.accent} 55%, transparent), 0 0 60px color-mix(in srgb, ${vars.color.accentGlow} 40%, transparent)`,
    },
  },
});
