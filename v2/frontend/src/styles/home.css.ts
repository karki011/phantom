// PhantomOS v2 — Home and Welcome page styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from './theme.css';

export const homeContainer = style({
  display: 'flex',
  flexDirection: 'column',
  padding: `${vars.space.lg} ${vars.space.xl}`,
  gap: vars.space.lg,
  overflowY: 'auto',
  height: '100%',
  boxSizing: 'border-box',
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
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: vars.space.xs,
  fontWeight: 600,
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
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  flex: 1,
  minWidth: '120px',
  minHeight: '110px',
  transition: `all ${vars.animation.fast} ease`,
  color: vars.color.textSecondary,
  ':hover': {
    background: vars.color.bgHover,
    borderColor: vars.color.borderHover,
    color: vars.color.textPrimary,
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
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontStyle: 'italic',
});

export const statusGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: vars.space.md,
});

export const statusCard = style({
  padding: vars.space.lg,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
});

export const statusCell = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const statusLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  lineHeight: 1,
});

export const statusValue = style({
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
  fontWeight: 600,
  fontFamily: vars.font.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const hunterBanner = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.md,
  padding: vars.space.md,
  background: vars.color.bgSecondary,
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.accentMuted}`,
  boxShadow: vars.shadow.glow,
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
  textShadow: `0 0 12px ${vars.color.accent}`,
});

export const rankInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const rankTitle = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 500,
});

export const rankLevel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const plansCard = style({
  background: vars.color.bgTertiary,
  padding: vars.space.md,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
});

export const planItem = style({
  display: 'flex',
  flexDirection: 'row',
  gap: vars.space.xs,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  padding: `${vars.space.xs} 0`,
  color: vars.color.textSecondary,
});
