// PhantomOS v2 — Home and Welcome page styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

const borderGlow = keyframes({
  '0%, 100%': {
    boxShadow: `0 0 20px color-mix(in srgb, ${vars.color.accent} 10%, transparent), inset 0 0 20px color-mix(in srgb, ${vars.color.accent} 5%, transparent)`,
  },
  '50%': {
    boxShadow: `0 0 30px color-mix(in srgb, ${vars.color.accent} 20%, transparent), inset 0 0 30px color-mix(in srgb, ${vars.color.accent} 8%, transparent)`,
  },
});

export const homeContainer = style({
  display: 'flex',
  flexDirection: 'column',
  padding: vars.space.xxl,
  gap: vars.space.xl,
  overflowY: 'auto',
  height: '100%',
  boxSizing: 'border-box',
  background: vars.color.bgPrimary,
});

export const welcomeContainer = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: vars.space.lg,
});

export const welcomeTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  color: vars.color.textPrimary,
  fontWeight: 700,
  margin: 0,
});

export const welcomeSubtitle = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  maxWidth: '400px',
  textAlign: 'center',
  margin: 0,
  lineHeight: 1.6,
});

export const welcomeActions = style({
  display: 'flex',
  flexDirection: 'row',
  gap: vars.space.sm,
  flexWrap: 'wrap',
  justifyContent: 'center',
});

export const sectionTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: vars.space.sm,
  fontWeight: 400,
});

export const sectionSeparator = style({
  width: '100%',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  marginBottom: vars.space.xl,
  opacity: 0.4,
});

export const quickActions = style({
  display: 'flex',
  flexDirection: 'row',
  gap: vars.space.sm,
  flexWrap: 'wrap',
});

export const quickActionButton = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xl} ${vars.space.xl}`,
  borderRadius: vars.radius.lg,
  background: vars.color.bgTertiary,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, ${vars.color.border})`,
  cursor: 'pointer',
  flex: 1,
  minWidth: '120px',
  minHeight: '110px',
  transition: `all ${vars.animation.fast} ease`,
  color: vars.color.textSecondary,
  ':hover': {
    background: vars.color.bgHover,
    borderColor: `color-mix(in srgb, ${vars.color.accent} 45%, ${vars.color.border})`,
    color: vars.color.textPrimary,
    boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  },
  selectors: {
    '&[data-active]': {
      borderColor: vars.color.accent,
      boxShadow: `0 0 16px color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
    },
  },
});

export const quickActionIcon = style({
  width: '36px',
  height: '36px',
  color: vars.color.accent,
  flexShrink: 0,
});

export const quickActionLabel = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 500,
  whiteSpace: 'nowrap',
});

export const quickActionHint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

export const statusCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.lg,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, ${vars.color.border})`,
  fontFamily: vars.font.mono,
});

export const statusHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const statusIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
});

export const statusTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 400,
});

export const statusBranch = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const statusDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: vars.color.success,
  flexShrink: 0,
  boxShadow: vars.color.successGlow,
});

export const statusBranchName = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const statusMeta = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const hunterBanner = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.md,
  padding: vars.space.lg,
  background: vars.color.bgSecondary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, ${vars.color.border})`,
  animation: `${borderGlow} 4s ease-in-out infinite`,
});

export const rankBadge = style({
  fontSize: vars.fontSize.xl,
  fontWeight: 800,
  color: vars.color.accent,
  fontFamily: vars.font.display,
  width: '40px',
  height: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: vars.color.accentMuted,
  borderRadius: vars.radius.md,
  flexShrink: 0,
  textShadow: `0 0 16px ${vars.color.accent}, 0 0 30px ${vars.color.accentGlow}`,
  boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
});

export const rankInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const rankTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.md,
  color: vars.color.accent,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 700,
});

export const rankLevel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  letterSpacing: '0.08em',
});

