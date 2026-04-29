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
  gap: vars.space.xxl,
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  boxSizing: 'border-box',
  background: vars.color.bgPrimary,
});

// ─── Welcome / Standby ceremony ─────────────────────────────────────────────
// Visual language matches BootScreen + ShutdownCeremony so empty-state feels
// like the system is *idle, awaiting orders* rather than blank.

const welcomeFadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const welcomeTextGlow = keyframes({
  '0%, 100%': { textShadow: `0 0 10px ${vars.color.accentGlow}` },
  '50%': { textShadow: `0 0 25px ${vars.color.accent}, 0 0 50px ${vars.color.accentGlow}` },
});

const welcomeCaret = keyframes({
  '0%, 49%': { opacity: 1 },
  '50%, 100%': { opacity: 0 },
});

const welcomeTileBreathe = keyframes({
  '0%, 100%': {
    boxShadow: `0 0 0 1px color-mix(in srgb, ${vars.color.accent} 18%, ${vars.color.border}), 0 0 18px color-mix(in srgb, ${vars.color.accent} 14%, transparent)`,
  },
  '50%': {
    boxShadow: `0 0 0 1px color-mix(in srgb, ${vars.color.accent} 35%, ${vars.color.border}), 0 0 28px color-mix(in srgb, ${vars.color.accent} 22%, transparent)`,
  },
});

export const welcomeContainer = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: vars.space.lg,
  background: vars.color.bgPrimary,
  overflow: 'hidden',
  padding: vars.space.xxl,
  boxSizing: 'border-box',
  animation: `${welcomeFadeIn} 600ms ease-out`,
});

export const welcomeStage = style({
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.sm,
  marginBottom: vars.space.lg,
});

export const welcomeTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xxl,
  fontWeight: 900,
  color: vars.color.accent,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  animation: `${welcomeTextGlow} 4s ease-in-out infinite`,
  margin: 0,
});

export const welcomeSubtitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  margin: 0,
});

export const welcomeActions = style({
  position: 'relative',
  zIndex: 1,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(160px, 200px))',
  gap: vars.space.md,
  '@media': {
    '(max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const welcomeTile = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: vars.space.xs,
  padding: `${vars.space.lg} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 80%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  transition: `transform ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  ':hover': {
    transform: 'translateY(-2px)',
    background: `color-mix(in srgb, ${vars.color.accent} 6%, ${vars.color.bgSecondary})`,
    borderColor: `color-mix(in srgb, ${vars.color.accent} 50%, ${vars.color.border})`,
    boxShadow: `0 0 24px color-mix(in srgb, ${vars.color.accent} 22%, transparent)`,
  },
  ':focus-visible': {
    outline: `1px solid ${vars.color.accent}`,
    outlineOffset: '2px',
  },
});

export const welcomeTilePrimary = style({
  borderColor: `color-mix(in srgb, ${vars.color.accent} 35%, ${vars.color.border})`,
  animation: `${welcomeTileBreathe} 4s ease-in-out infinite`,
});

export const welcomeTileIcon = style({
  color: vars.color.accent,
  filter: `drop-shadow(0 0 6px ${vars.color.accentGlow})`,
});

export const welcomeTileLabel = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.sm,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: vars.color.textPrimary,
});

export const welcomeTileHint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  letterSpacing: '0.04em',
  lineHeight: 1.5,
});

export const welcomeBriefing = style({
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  marginTop: vars.space.lg,
  width: '100%',
  maxWidth: '640px',
});

export const welcomeBriefingHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
});

export const welcomeBriefingRule = style({
  flex: 1,
  height: '1px',
  background: `linear-gradient(90deg, color-mix(in srgb, ${vars.color.accent} 35%, transparent), transparent)`,
});

export const welcomeBriefingSteps = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: `${vars.space.xs} ${vars.space.lg}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  '@media': {
    '(max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const welcomeBriefingStep = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  color: vars.color.textSecondary,
  letterSpacing: '0.04em',
  padding: `${vars.space.xs} 0`,
});

export const welcomeBriefingIndex = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  fontWeight: 700,
  flexShrink: 0,
  textShadow: `0 0 6px ${vars.color.accentGlow}`,
});

export const welcomeBriefingKbd = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 6px',
  marginLeft: vars.space.xs,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.accent} 8%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 22%, ${vars.color.border})`,
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  fontSize: '0.65rem',
  letterSpacing: '0.05em',
});

export const welcomeStatus = style({
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  marginTop: vars.space.md,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  letterSpacing: '0.08em',
});

export const welcomeStatusCaret = style({
  display: 'inline-block',
  width: '7px',
  height: '12px',
  background: vars.color.accent,
  animation: `${welcomeCaret} 1s steps(1) infinite`,
  boxShadow: `0 0 8px ${vars.color.accentGlow}`,
});

export const sectionTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 400,
});

export const sectionSeparator = style({
  width: '100%',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  opacity: 0.4,
});

export const quickActionsCard = style({
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
  overflow: 'hidden',
});

export const quickActionsHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const quickActions = style({
  display: 'flex',
  flexDirection: 'row',
  gap: vars.space.sm,
  flexWrap: 'wrap',
  padding: vars.space.sm,
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
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
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
  gap: vars.space.md,
  padding: vars.space.xl,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
  fontFamily: vars.font.mono,
});

export const statusHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xs,
  flexWrap: 'wrap',
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
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '3px 8px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  marginLeft: 'auto',
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
  padding: vars.space.xl,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
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

// === Ward Summary Card ===

export const wardCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.lg,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
});

export const wardHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const wardHeaderLeft = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const wardHeaderIcon = style({
  color: vars.color.accent,
  display: 'flex',
  alignItems: 'center',
});

export const wardSectionLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
});

export const wardManageButton = style({
  background: 'none',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `2px ${vars.space.sm}`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
});

export const wardFallbackText = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const wardSummaryRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
});

export const wardRuleCount = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const wardBadgeBlock = style({
  fontSize: '10px',
  padding: `1px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.danger} 18%, transparent)`,
  color: vars.color.danger,
  border: `1px solid color-mix(in srgb, ${vars.color.danger} 35%, transparent)`,
});

export const wardBadgeWarn = style({
  fontSize: '10px',
  padding: `1px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.warning} 18%, transparent)`,
  color: vars.color.warning,
  border: `1px solid color-mix(in srgb, ${vars.color.warning} 35%, transparent)`,
});

export const wardBadgeConfirm = style({
  fontSize: '10px',
  padding: `1px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  color: vars.color.accent,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 35%, transparent)`,
});

export const wardDrawerOverlay = style({
  position: 'fixed',
  inset: '0',
  zIndex: 100,
  display: 'flex',
  alignItems: 'stretch',
});

export const wardDrawerBackdrop = style({
  flex: 1,
  background: 'rgba(0,0,0,0.45)',
});

export const wardDrawerPanel = style({
  width: '480px',
  maxWidth: '90vw',
  background: vars.color.bgSecondary,
  borderLeft: `1px solid ${vars.color.border}`,
  overflow: 'auto',
  boxShadow: `-8px 0 32px rgba(0,0,0,0.4)`,
  padding: vars.space.xl,
});

export const wardDrawerHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: vars.space.lg,
});

export const wardDrawerTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
});

export const wardDrawerCloseButton = style({
  background: 'none',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  fontSize: vars.fontSize.md,
  lineHeight: '1',
  padding: vars.space.xs,
});

// === Recent Sessions ===

export const recentSectionLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: vars.color.textDisabled,
  marginBottom: vars.space.sm,
});

export const recentSessionList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
});

export const sessionRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  background: vars.color.bgSecondary,
});

// Dynamic: use style="--provider-color: <value>" on the element
export const providerBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  fontSize: '0.6rem',
  fontWeight: '600',
  color: 'var(--provider-color)',
  letterSpacing: '0.04em',
  flexShrink: 0,
});

// Dynamic: use style="--provider-color: <value>" on the element
export const providerDot = style({
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  background: 'var(--provider-color)',
});

export const sessionTimeAgo = style({
  color: vars.color.textDisabled,
  minWidth: '52px',
  textAlign: 'right',
  flexShrink: 0,
});

export const sessionSeparatorDot = style({
  color: vars.color.textDisabled,
});

export const sessionDuration = style({
  color: vars.color.textSecondary,
  minWidth: '32px',
  flexShrink: 0,
});

export const sessionPrompt = style({
  color: vars.color.textSecondary,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sessionCost = style({
  color: vars.color.textSecondary,
  flexShrink: 0,
});

// Dynamic: use style="--status-color: <value>" on the element
export const sessionStatusBadge = style({
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  color: 'var(--status-color)',
  flexShrink: 0,
});

// Dynamic: use style="--status-color: <value>" on the element
export const sessionStatusDot = style({
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  background: 'var(--status-color)',
});

// === OpenPrCard / shared icon styles ===

export const iconExternalLink = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const ciTooltipRowTotal = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.65rem',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  marginTop: '2px',
});

export const ciTotalText = style({
  fontSize: '0.55rem',
});

// === FailedCheckItem ===

export const failureRunName = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const failureWorkflow = style({
  color: vars.color.textDisabled,
  fontSize: '0.55rem',
});

export const failureExternalLink = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const ciStepText = style({
  fontSize: '0.6rem',
  color: vars.color.textPrimary,
});

// === Icon color helpers (static, used in place of inline icon style props) ===

export const iconDanger = style({
  color: vars.color.danger,
  flexShrink: 0,
});

export const iconSuccess = style({
  color: vars.color.success,
  flexShrink: 0,
});

export const iconWarning = style({
  color: vars.color.warning,
  flexShrink: 0,
});

export const iconMuted = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const activeSessionsCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.xl,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
  fontFamily: vars.font.mono,
});

export const activeSessionsHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xs,
  flexWrap: 'wrap',
});

export const activeSessionsTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 400,
});

export const activeSessionsCount = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '18px',
  height: '18px',
  padding: '0 4px',
  borderRadius: '9px',
  fontSize: '0.6rem',
  fontWeight: 700,
  fontFamily: vars.font.mono,
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
});

export const activeSessionsScroll = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  maxHeight: '360px',
  overflowY: 'auto',
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

// === Inline Quick Actions (inside status card header) ===

export const quickActionsInline = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginLeft: 'auto',
  marginRight: vars.space.sm,
});

export const quickActionInlineButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 18%, ${vars.color.border})`,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  fontFamily: vars.font.mono,
  fontSize: '0.65rem',
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: `color-mix(in srgb, ${vars.color.accent} 45%, ${vars.color.border})`,
    background: `color-mix(in srgb, ${vars.color.accent} 8%, transparent)`,
    boxShadow: `0 0 8px color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

export const quickActionInlineIcon = style({
  width: '13px',
  height: '13px',
  flexShrink: 0,
  color: vars.color.accent,
});

export const quickActionInlineHint = style({
  fontSize: '0.5rem',
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginLeft: '2px',
});

// === Quick Launch Grid ===

const cardShimmer = keyframes({
  '0%': { backgroundPosition: '-200% 0' },
  '100%': { backgroundPosition: '200% 0' },
});

const subtlePulse = keyframes({
  '0%, 100%': { opacity: 0.6 },
  '50%': { opacity: 1 },
});

export const quickLaunchGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: vars.space.md,
});

export const quickLaunchCard = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xl} ${vars.space.md}`,
  borderRadius: vars.radius.lg,
  background: vars.color.bgTertiary,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 50%, transparent)`,
  cursor: 'pointer',
  transition: `all 200ms ease`,
  overflow: 'hidden',
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 6%, ${vars.color.bgTertiary})`,
    borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
    transform: 'translateY(-2px)',
    boxShadow: `0 4px 20px color-mix(in srgb, ${vars.color.accent} 15%, transparent), 0 0 0 1px color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  },
  '::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    background: `linear-gradient(135deg, color-mix(in srgb, ${vars.color.accent} 4%, transparent), transparent 60%)`,
    pointerEvents: 'none',
  },
});

export const quickLaunchCardDisabled = style({
  cursor: 'default',
  opacity: 0.5,
  ':hover': {
    background: vars.color.bgTertiary,
    borderColor: `color-mix(in srgb, ${vars.color.border} 50%, transparent)`,
    transform: 'none',
    boxShadow: 'none',
  },
});

export const quickLaunchIcon = style({
  width: '32px',
  height: '32px',
  color: vars.color.accent,
  flexShrink: 0,
  filter: `drop-shadow(0 0 6px color-mix(in srgb, ${vars.color.accent} 30%, transparent))`,
});

export const quickLaunchLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  textAlign: 'center',
});

export const quickLaunchDesc = style({
  fontFamily: vars.font.mono,
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  textAlign: 'center',
  lineHeight: 1.4,
});

export const quickLaunchBadge = style({
  position: 'absolute',
  top: vars.space.sm,
  right: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: '0.5rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  padding: '2px 6px',
  borderRadius: vars.radius.full,
  background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  color: vars.color.accent,
  animation: `${subtlePulse} 3s ease-in-out infinite`,
});

export const quickLaunchShimmer = style({
  position: 'absolute',
  inset: 0,
  background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${vars.color.accent} 5%, transparent), transparent)`,
  backgroundSize: '200% 100%',
  animation: `${cardShimmer} 4s ease-in-out infinite`,
  pointerEvents: 'none',
  borderRadius: 'inherit',
});

// === Pinned Recipes ===

export const pinnedRecipesCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.lg,
  borderRadius: vars.radius.lg,
  background: vars.color.bgTertiary,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 50%, transparent)`,
});

export const pinnedRecipesHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
});

export const pinnedRecipesHeaderIcon = style({
  color: vars.color.accent,
  display: 'flex',
  alignItems: 'center',
});

export const pinnedRecipesList = style({
  display: 'flex',
  gap: vars.space.sm,
  flexWrap: 'wrap',
});

export const pinnedRecipeButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  transition: `all 200ms ease`,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.textPrimary,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 8%, ${vars.color.bgSecondary})`,
    borderColor: `color-mix(in srgb, ${vars.color.accent} 30%, ${vars.color.border})`,
    transform: 'translateY(-1px)',
    boxShadow: `0 2px 8px color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  },
});

export const pinnedRecipesEmpty = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  padding: `${vars.space.sm} 0`,
  lineHeight: 1.5,
});

// === Two-column dashboard grid ===

export const homeDashboardGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: vars.space.xxl,
  alignItems: 'start',
});

// === Recipes Card (All + Favorites tabs) ===

export const recipesCard = style({
  display: 'flex',
  flexDirection: 'column',
  padding: vars.space.xl,
  borderRadius: vars.radius.lg,
  background: vars.color.bgTertiary,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
  maxHeight: '420px',
  overflow: 'hidden',
});

export const recipesCardHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  marginBottom: vars.space.sm,
});

export const recipesCardTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
});

export const recipesCardCount = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const recipesTabBar = style({
  display: 'flex',
  gap: '2px',
  borderBottom: `1px solid ${vars.color.border}`,
  marginBottom: vars.space.sm,
  flexShrink: 0,
});

export const recipesTab = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: `${vars.space.xs} ${vars.space.md}`,
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textSecondary,
  },
});

export const recipesTabActive = style({
  color: vars.color.accent,
  borderBottomColor: vars.color.accent,
  ':hover': {
    color: vars.color.accent,
  },
});

export const recipesListScroll = style({
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  scrollbarWidth: 'thin',
  scrollbarColor: `${vars.color.border} transparent`,
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

export const recipeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `5px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  flexShrink: 0,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const recipeStarButton = style({
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: '14px',
  lineHeight: 1,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
});

export const recipeIcon = style({
  fontSize: '14px',
  flexShrink: 0,
  width: '18px',
  textAlign: 'center',
});

export const recipeLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const recipeCommand = style({
  fontFamily: vars.font.mono,
  fontSize: '0.65rem',
  color: vars.color.textDisabled,
  marginLeft: 'auto',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '180px',
});

export const recipeCategoryBadge = style({
  fontFamily: vars.font.mono,
  fontSize: '0.55rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  color: vars.color.accent,
  flexShrink: 0,
});

