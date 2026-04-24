// PhantomOS v2 — Home and Welcome page styles
// Author: Subash Karki

import { style, keyframes, globalKeyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

globalKeyframes('spin', {
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

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
  alignItems: 'stretch',
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
  width: '100%',
  boxSizing: 'border-box',
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

export const statusRefreshButton = style({
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '3px 8px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
  ':disabled': {
    cursor: 'default',
    opacity: 0.5,
  },
});

export const statusRefreshLabel = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  letterSpacing: '0.04em',
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

export const statusDotDirty = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: '#f59e0b',
  flexShrink: 0,
  boxShadow: '0 0 6px rgba(245, 158, 11, 0.5)',
});

export const statusGitInfo = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  marginTop: '4px',
});

export const statusBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '2px 6px',
  borderRadius: '4px',
  backgroundColor: 'rgba(255,255,255,0.06)',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
});

export const statusBadgeWarn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '2px 6px',
  borderRadius: '4px',
  backgroundColor: 'rgba(245, 158, 11, 0.15)',
  color: '#f59e0b',
  fontSize: vars.fontSize.xs,
});

export const statusActionButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '2px 8px',
  borderRadius: '4px',
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  color: vars.color.accent,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: `color-mix(in srgb, ${vars.color.accent} 22%, transparent)`,
    borderColor: vars.color.accent,
  },
});

export const statusActionButtonWarn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '2px 8px',
  borderRadius: '4px',
  backgroundColor: 'rgba(245, 158, 11, 0.12)',
  color: '#f59e0b',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  border: '1px solid rgba(245, 158, 11, 0.25)',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: '#f59e0b',
  },
});

export const statusClean = style({
  color: vars.color.accent,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
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

// ── Activity Card ────────────────────────────────────────────────────────────

export const activityCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, ${vars.color.border})`,
  fontFamily: vars.font.mono,
  alignSelf: 'flex-start',
  maxWidth: '480px',
  flex: 1,
});

export const activityCardHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const activityCardTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 400,
});

export const activityCardIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
});

export const prCardCompact = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
    boxShadow: `0 0 8px color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

export const prCardRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const prCardTitle = style({
  fontSize: '0.78rem',
  fontWeight: 500,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const prCardNumber = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  flexShrink: 0,
  fontFamily: vars.font.mono,
});

export const prCardBranch = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const prStateDotSmall = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  flexShrink: 0,
});

export const prStateLabel = style({
  fontSize: '0.6rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  fontFamily: vars.font.mono,
});

export const activityEmpty = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
});

export const createPrButtonCompact = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  background: vars.color.accent,
  color: vars.color.textInverse,
  border: 'none',
  cursor: 'pointer',
  fontFamily: vars.font.body,
  fontSize: '0.73rem',
  fontWeight: 600,
  width: 'fit-content',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    opacity: '0.9',
    boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  },
});

export const cardRow = style({
  display: 'flex',
  gap: vars.space.lg,
  alignItems: 'stretch',
});

export const openPrCount = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.accent,
  lineHeight: 1,
});

export const openPrLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
});

export const activityDividerHome = style({
  width: '100%',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  opacity: 0.3,
  margin: `${vars.space.sm} 0`,
});

export const prListScroll = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  maxHeight: '220px',
  overflowY: 'auto',
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

export const prCardMeta = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  marginLeft: 'auto',
});

export const prCiIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  cursor: 'default',
});

export const ciTooltipList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
});

export const ciTooltipHeader = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '2px',
});

export const ciTooltipRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.65rem',
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
});

export const ciTooltipName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const ciTooltipStatus = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

export const ciTooltipWorkflow = style({
  fontSize: '0.6rem',
  fontWeight: 600,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginTop: '4px',
  paddingBottom: '2px',
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.border} 50%, transparent)`,
});

export const ciDescription = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontStyle: 'italic',
  paddingLeft: '16px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const ciFailureSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.danger} 6%, ${vars.color.bgPrimary})`,
  border: `1px solid color-mix(in srgb, ${vars.color.danger} 20%, ${vars.color.border})`,
});

export const ciFailureToggle = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  cursor: 'pointer',
  fontSize: '0.65rem',
  color: vars.color.danger,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  border: 'none',
  background: 'none',
  padding: 0,
  width: '100%',
  textAlign: 'left',
});

export const ciFailureChevron = style({
  transition: `transform ${vars.animation.fast} ease`,
  flexShrink: 0,
});

export const ciFailureChevronOpen = style({
  transform: 'rotate(90deg)',
});

export const ciFailureItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: `${vars.space.xs} 0`,
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.border} 30%, transparent)`,
  selectors: {
    '&:last-child': { borderBottom: 'none' },
  },
});

export const ciFailureItemHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.65rem',
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
});

export const ciAnnotation = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  paddingLeft: '16px',
  fontSize: '0.6rem',
  fontFamily: vars.font.mono,
});

export const ciAnnotationPath = style({
  color: vars.color.accent,
  cursor: 'pointer',
  ':hover': {
    textDecoration: 'underline',
  },
});

export const ciAnnotationMessage = style({
  color: vars.color.textSecondary,
  whiteSpace: 'pre-wrap',
  maxHeight: '60px',
  overflow: 'hidden',
});

const aiGlow = keyframes({
  '0%, 100%': {
    textShadow: `0 0 8px ${vars.color.accentGlow}`,
    opacity: 0.7,
  },
  '50%': {
    textShadow: `0 0 20px ${vars.color.accent}, 0 0 40px ${vars.color.accentGlow}`,
    opacity: 1,
  },
});

const dotCycle = keyframes({
  '0%': { content: '' },
  '25%': { content: '.' },
  '50%': { content: '..' },
  '75%': { content: '...' },
});

export const aiCreatingPr = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.accent} 6%, ${vars.color.bgPrimary})`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, ${vars.color.border})`,
  animation: `${aiGlow} 3s ease-in-out infinite`,
});

export const aiCreatingPrIcon = style({
  fontSize: vars.fontSize.md,
  filter: `drop-shadow(0 0 6px ${vars.color.accent})`,
});

export const aiCreatingPrText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  letterSpacing: '0.06em',
  fontWeight: 600,
});

export const aiCreatingPrDots = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  '::after': {
    content: '',
    animation: `${dotCycle} 1.5s steps(4, end) infinite`,
  },
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

