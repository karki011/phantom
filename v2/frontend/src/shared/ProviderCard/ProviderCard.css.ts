// PhantomOS v2 — ProviderCard styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.lg,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    borderColor: vars.color.borderHover,
  },
});

export const cardActive = style({
  borderColor: vars.color.accent,
  boxShadow: vars.shadow.glow,
});

export const cardHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.md,
});

export const providerIcon = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.md,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.125rem',
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const providerInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
  minWidth: 0,
});

export const providerName = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const providerSubtext = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const headerActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexShrink: 0,
});

export const badge = style({
  fontFamily: vars.font.mono,
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: '2px 6px',
  borderRadius: vars.radius.sm,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const badgeActive = style({
  background: vars.color.accentMuted,
  color: vars.color.accent,
});

export const badgeBuiltin = style({
  background: vars.color.infoMuted,
  color: vars.color.info,
});

export const badgeOverride = style({
  background: vars.color.warningMuted,
  color: vars.color.warning,
});

const pulseAnimation = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.5 },
});

export const statusDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const statusInstalled = style({
  background: vars.color.success,
  boxShadow: `0 0 6px ${vars.color.success}`,
});

export const statusNotInstalled = style({
  background: vars.color.danger,
});

export const statusUnknown = style({
  background: vars.color.textDisabled,
});

export const statusTesting = style({
  background: vars.color.warning,
  animation: `${pulseAnimation} 1.2s ease-in-out infinite`,
});

export const expandButton = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  padding: vars.space.xs,
  borderRadius: vars.radius.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

export const expandedContent = style({
  marginTop: vars.space.md,
  paddingTop: vars.space.md,
  borderTop: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
});

export const detailSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const detailLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
});

export const detailValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  background: vars.color.bgTertiary,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  wordBreak: 'break-all',
});

export const detailRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: vars.space.md,
});

export const actionRow = style({
  display: 'flex',
  gap: vars.space.sm,
  marginTop: vars.space.sm,
  flexWrap: 'wrap',
});

export const pricingGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr auto auto',
  gap: `${vars.space.xs} ${vars.space.md}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
});

export const pricingHeader = style({
  color: vars.color.textSecondary,
  fontWeight: 600,
  paddingBottom: vars.space.xs,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const pricingCell = style({
  color: vars.color.textPrimary,
  padding: `${vars.space.xs} 0`,
});

export const editField = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
});

export const editLabel = style({
  fontFamily: vars.font.mono,
  fontSize: '0.625rem',
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

export const editInput = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  outline: 'none',
  transition: `border-color ${vars.animation.fast} ease`,
  ':focus': {
    borderColor: vars.color.accent,
  },
});

export const testResultPanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  marginTop: vars.space.sm,
  padding: vars.space.md,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
});

export const testResultRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
});

export const clickablePath = style({
  cursor: 'pointer',
  borderRadius: vars.radius.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  margin: `0 -${vars.space.sm}`,
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const statusDotInline = style({
  display: 'inline-block',
  verticalAlign: 'middle',
  marginRight: '6px',
});

export const pathKey = style({
  fontSize: '0.6875rem',
  color: 'var(--textSecondary)',
});

export const folderIconInline = style({
  marginLeft: '6px',
  opacity: 0.5,
});

export const pricingInput = style({
  width: '80px',
});

export const dangerText = style({
  color: 'var(--danger, #ef4444)',
});
