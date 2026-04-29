// PhantomOS v2 — Gamification styles (Vanilla Extract)
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

// ── Rank Colors ─────────────────────────────────────────────────────────────

export const RANK_COLORS: Record<string, {
  bg: string;
  border: string;
  text: string;
  glow?: string;
  gradient: string;
}> = {
  F: { bg: '#52525B20', border: '#52525B', text: '#71717A', gradient: 'linear-gradient(135deg, #52525B, #71717A)' },
  E: { bg: '#6B728030', border: '#6B7280', text: '#9CA3AF', gradient: 'linear-gradient(135deg, #6B7280, #9CA3AF)' },
  D: { bg: '#22C55E20', border: '#22C55E', text: '#4ADE80', gradient: 'linear-gradient(135deg, #22C55E, #4ADE80)' },
  C: { bg: '#3B82F620', border: '#3B82F6', text: '#60A5FA', gradient: 'linear-gradient(135deg, #3B82F6, #60A5FA)' },
  B: { bg: '#A855F720', border: '#A855F7', text: '#C084FC', gradient: 'linear-gradient(135deg, #A855F7, #C084FC)' },
  A: { bg: '#F9731620', border: '#F97316', text: '#FB923C', gradient: 'linear-gradient(135deg, #F97316, #FB923C)' },
  S: { bg: '#EF444420', border: '#EF4444', text: '#F87171', gradient: 'linear-gradient(135deg, #EF4444, #F87171)' },
  SS: { bg: '#F59E0B20', border: '#F59E0B', text: '#FBBF24', glow: '#F59E0B', gradient: 'linear-gradient(135deg, #F59E0B, #FBBF24)' },
  SSS: { bg: '#F59E0B30', border: '#F59E0B', text: '#FCD34D', glow: '#F59E0B', gradient: 'linear-gradient(135deg, #F59E0B, #FDE68A, #F59E0B)' },
};

export const STAT_COLORS: Record<string, string> = {
  STR: '#EF4444',
  INT: '#3B82F6',
  AGI: '#22C55E',
  VIT: '#F97316',
  PER: '#A855F7',
  SEN: '#06B6D4',
};

// ── Keyframes ───────────────────────────────────────────────────────────────

export const glowPulse = keyframes({
  '0%, 100%': { boxShadow: '0 0 8px rgba(245, 158, 11, 0.3), 0 0 16px rgba(245, 158, 11, 0.15)' },
  '50%': { boxShadow: '0 0 16px rgba(245, 158, 11, 0.6), 0 0 32px rgba(245, 158, 11, 0.3)' },
});

export const sssGlowPulse = keyframes({
  '0%, 100%': { boxShadow: '0 0 12px rgba(245, 158, 11, 0.4), 0 0 24px rgba(245, 158, 11, 0.2), 0 0 48px rgba(245, 158, 11, 0.1)' },
  '50%': { boxShadow: '0 0 24px rgba(245, 158, 11, 0.7), 0 0 48px rgba(245, 158, 11, 0.4), 0 0 72px rgba(245, 158, 11, 0.2)' },
});

export const shimmer = keyframes({
  '0%': { transform: 'translateX(-100%)' },
  '100%': { transform: 'translateX(100%)' },
});

export const xpFloat = keyframes({
  '0%': { opacity: 1, transform: 'translateY(0) scale(1)' },
  '70%': { opacity: 0.8, transform: 'translateY(-30px) scale(1.1)' },
  '100%': { opacity: 0, transform: 'translateY(-50px) scale(0.9)' },
});

export const levelUpFlash = keyframes({
  '0%': { opacity: 0, transform: 'scale(0.5)' },
  '20%': { opacity: 1, transform: 'scale(1.2)' },
  '40%': { opacity: 1, transform: 'scale(1)' },
  '100%': { opacity: 0, transform: 'scale(1.05)' },
});

export const rankUpScale = keyframes({
  '0%': { opacity: 0, transform: 'scale(0.3) rotate(-10deg)' },
  '30%': { opacity: 1, transform: 'scale(1.3) rotate(5deg)' },
  '50%': { transform: 'scale(1) rotate(0deg)' },
  '100%': { opacity: 0, transform: 'scale(1.1)' },
});

export const particleBurst = keyframes({
  '0%': { opacity: 1, transform: 'scale(0)' },
  '50%': { opacity: 0.6, transform: 'scale(1)' },
  '100%': { opacity: 0, transform: 'scale(1.5)' },
});

export const statBarFill = keyframes({
  from: { width: '0%' },
});

export const achievementSlideIn = keyframes({
  '0%': { opacity: 0, transform: 'translateX(60px)' },
  '100%': { opacity: 1, transform: 'translateX(0)' },
});

export const checkBounce = keyframes({
  '0%': { transform: 'scale(0)' },
  '50%': { transform: 'scale(1.3)' },
  '100%': { transform: 'scale(1)' },
});

export const fadeInUp = keyframes({
  from: { opacity: 0, transform: 'translateY(12px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

// ── RankBadge ───────────────────────────────────────────────────────────────

export const rankBadge = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const rankCircle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  border: '2px solid',
  transition: `all ${vars.animation.normal} ease`,
});

export const rankCircleSm = style({
  width: '24px',
  height: '24px',
});

export const rankCircleMd = style({
  width: '56px',
  height: '56px',
});

export const rankCircleLg = style({
  width: '88px',
  height: '88px',
});

export const rankLetter = style({
  fontFamily: vars.font.display,
  fontWeight: 900,
  lineHeight: 1,
});

export const rankTitle = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  textAlign: 'center',
});

// ── XP Progress Bar ─────────────────────────────────────────────────────────

export const xpBarContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  width: '100%',
});

export const xpBarHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const xpBarLabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.body,
});

export const xpBarPercentage = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.display,
  fontWeight: 600,
  color: vars.color.xp,
});

export const xpBarTrack = style({
  position: 'relative',
  height: '8px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
  border: `1px solid ${vars.color.border}`,
});

export const xpBarFill = style({
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  borderRadius: vars.radius.full,
  transition: `width 600ms cubic-bezier(0.4, 0, 0.2, 1)`,
});

export const xpBarShimmer = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  borderRadius: vars.radius.full,
  '::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    width: '50%',
    height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
    animation: `${shimmer} 2s infinite`,
  },
});

export const xpBarMini = style({
  height: '4px',
  border: 'none',
});

// ── Stat Bar ────────────────────────────────────────────────────────────────

export const statBarRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const statAbbr = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  color: vars.color.textSecondary,
  width: '2.5rem',
  textAlign: 'right',
  flexShrink: 0,
});

export const statBarTrack = style({
  position: 'relative',
  flex: 1,
  height: '6px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
});

export const statBarFillStyle = style({
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  borderRadius: vars.radius.full,
  transition: `width 800ms ease-out`,
});

export const statValue = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textPrimary,
  width: '2rem',
  textAlign: 'right',
  flexShrink: 0,
});

// ── Category Colors (exported as plain object for runtime use) ──────────────

export const CATEGORY_COLORS: Record<string, string> = {
  combat: '#EF4444',
  mastery: '#A855F7',
  exploration: '#22C55E',
  dedication: '#3B82F6',
  streak: '#F97316',
  milestone: '#F59E0B',
  speed: '#06B6D4',
  default: '#9CA3AF',
};

// ── Achievement Card (Premium) ──────────────────────────────────────────────

export const achievementCardEntrance = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const achievementCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: `${vars.space.lg} ${vars.space.md}`,
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  borderLeft: '2px solid transparent',
  border: `1px solid ${vars.color.border}`,
  position: 'relative',
  transition: `all ${vars.animation.normal} ease`,
  cursor: 'default',
  animation: `${achievementCardEntrance} 400ms ease-out both`,
  ':hover': {
    transform: 'translateY(-2px)',
    boxShadow: vars.shadow.md,
  },
});

export const achievementCardUnlocked = style({
  borderLeftWidth: '2px',
  borderLeftStyle: 'solid',
  // borderLeftColor set inline via categoryColor
  ':hover': {
    boxShadow: vars.shadow.md,
  },
});

export const achievementCardLocked = style({
  opacity: 0.45,
  borderLeftColor: 'transparent',
  background: vars.color.bgPrimary,
  filter: 'grayscale(0.85)',
  ':hover': {
    opacity: 0.7,
    filter: 'grayscale(0.6)',
  },
});

export const achievementLockOverlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: vars.radius.md,
  pointerEvents: 'none',
  zIndex: 1,
});

export const achievementLockSvg = style({
  color: vars.color.textDisabled,
  opacity: 0.85,
  width: '32px',
  height: '32px',
});

export const achievementIconArea = style({
  fontSize: '1.75rem',
  lineHeight: 1,
  flexShrink: 0,
});

export const achievementCardBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
  minWidth: 0,
});

export const achievementName = style({
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
});

export const achievementDesc = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  lineHeight: 1.4,
});

export const achievementMeta = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  marginTop: '2px',
});

export const xpBadge = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  padding: `1px ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.xpMuted,
  color: vars.color.xp,
  marginLeft: 'auto',
});

export const categoryBadge = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  padding: `1px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  border: '1px solid',
  backgroundColor: 'transparent',
  // color and border-color set inline
});

export const achievementDate = style({
  fontSize: '0.625rem',
  color: vars.color.textDisabled,
  marginTop: '2px',
});

// ── Quest Card ──────────────────────────────────────────────────────────────

export const questCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.md,
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  transition: `all ${vars.animation.normal} ease`,
});

export const questCardComplete = style({
  borderColor: vars.color.success,
  boxShadow: `0 0 8px ${vars.color.successMuted}`,
});

export const questHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const questLabel = style({
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.textPrimary,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const questCheckmark = style({
  color: vars.color.success,
  animation: `${checkBounce} 400ms ease-out`,
});

export const questProgressTrack = style({
  height: '6px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
});

export const questProgressFill = style({
  height: '100%',
  borderRadius: vars.radius.full,
  transition: `width 400ms ease-out`,
});

export const questFooter = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const questProgress = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const questType = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

// ── Activity Heatmap ────────────────────────────────────────────────────────

export const heatmapContainer = style({
  padding: vars.space.md,
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
});

export const heatmapHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  marginBottom: vars.space.md,
});

export const heatmapTitle = style({
  fontSize: vars.fontSize.md,
  fontWeight: 700,
  color: vars.color.textPrimary,
  fontFamily: vars.font.display,
});

export const heatmapSvgWrap = style({
  position: 'relative',
  overflowX: 'auto',
});

export const heatmapTooltip = style({
  position: 'absolute',
  transform: 'translate(-50%, -100%)',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  pointerEvents: 'none',
  zIndex: 10,
  whiteSpace: 'nowrap',
  boxShadow: vars.shadow.md,
});

export const heatmapTooltipDate = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const heatmapTooltipDetail = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

// ── Lifetime Stat Card ──────────────────────────────────────────────────────

export const lifetimeCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: vars.space.md,
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  transition: `all ${vars.animation.normal} ease`,
  ':hover': {
    borderColor: vars.color.accent,
    boxShadow: vars.shadow.glow,
  },
});

export const lifetimeIconRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const lifetimeIcon = style({
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: vars.radius.md,
});

export const lifetimeLabel = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
});

export const lifetimeValue = style({
  fontFamily: vars.font.display,
  fontSize: '1.375rem',
  fontWeight: 700,
  color: vars.color.textPrimary,
  lineHeight: 1.2,
});

export const lifetimeSublabel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

// ── Celebration Overlays ────────────────────────────────────────────────────

export const celebrationOverlay = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  pointerEvents: 'none',
  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 100%)',
});

export const levelUpText = style({
  fontFamily: vars.font.display,
  fontSize: '3rem',
  fontWeight: 900,
  color: vars.color.xp,
  textShadow: `0 0 20px ${vars.color.xpMuted}, 0 0 40px ${vars.color.xpMuted}`,
  animation: `${levelUpFlash} 2.5s ease-out forwards`,
  letterSpacing: '0.1em',
});

export const levelUpNumber = style({
  fontFamily: vars.font.display,
  fontSize: '5rem',
  fontWeight: 900,
  color: vars.color.textPrimary,
  textShadow: `0 0 30px ${vars.color.xpMuted}`,
  animation: `${levelUpFlash} 2.5s ease-out 0.3s forwards`,
  opacity: 0,
});

export const rankUpText = style({
  fontFamily: vars.font.display,
  fontSize: '2.5rem',
  fontWeight: 900,
  letterSpacing: '0.15em',
  animation: `${levelUpFlash} 3.5s ease-out forwards`,
});

export const rankUpBadge = style({
  animation: `${rankUpScale} 3.5s ease-out 0.5s forwards`,
  opacity: 0,
});

export const particleRing = style({
  position: 'absolute',
  width: '200px',
  height: '200px',
  borderRadius: '50%',
  border: '2px solid',
  animation: `${particleBurst} 1.5s ease-out forwards`,
  pointerEvents: 'none',
});

// ── XP Float ────────────────────────────────────────────────────────────────

export const xpFloatContainer = style({
  position: 'fixed',
  bottom: '60px',
  right: '20px',
  zIndex: 9998,
  pointerEvents: 'none',
});

export const xpFloatText = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.lg,
  fontWeight: 700,
  color: vars.color.xp,
  textShadow: `0 0 8px ${vars.color.xpMuted}`,
  animation: `${xpFloat} 1.5s ease-out forwards`,
});

// ── Hunter Profile View ─────────────────────────────────────────────────────

export const profileContainer = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: vars.space.md,
  padding: vars.space.md,
  overflow: 'auto',
  animation: `${fadeInUp} 400ms ease-out both`,
});

export const profileHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
});

export const profileHeaderIcon = style({
  color: vars.color.accent,
  filter: `drop-shadow(0 0 12px ${vars.color.accentGlow})`,
  flexShrink: 0,
});

export const profileHeaderTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.lg,
  color: vars.color.textPrimary,
  fontWeight: 700,
});

export const profileGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: vars.space.md,
  '@media': {
    '(max-width: 800px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const profilePanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  alignItems: 'center',
});

export const profileAvatar = style({
  width: '100px',
  height: '100px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  border: `2px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textDisabled,
});

export const profileName = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
  },
});

export const profileNameInput = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xl,
  fontWeight: 700,
  color: vars.color.textPrimary,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.borderFocus}`,
  borderRadius: vars.radius.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  textAlign: 'center',
  outline: 'none',
});

export const profileTitle = style({
  fontSize: vars.fontSize.md,
  color: vars.color.textSecondary,
});

export const profileLevel = style({
  fontFamily: vars.font.display,
  fontSize: '1.125rem',
  fontWeight: 700,
  color: vars.color.xp,
});

export const statsPanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
});

export const statsSectionLabel = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.sm,
  fontWeight: 700,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

// ── Lifetime Stats Grid ─────────────────────────────────────────────────────

export const lifetimeGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: vars.space.sm,
});

// ── Achievements Grid ───────────────────────────────────────────────────────

export const achievementsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  animation: `${fadeInUp} 400ms ease-out both`,
});

export const achievementsGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '20px',
});

export const achievementsProgressSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const achievementsProgressText = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textSecondary,
  fontFamily: vars.font.display,
});

export const achievementsProgressBar = style({
  height: '4px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
});

export const achievementsProgressFill = style({
  height: '100%',
  borderRadius: vars.radius.full,
  background: `linear-gradient(90deg, ${vars.color.xp}, ${vars.color.warning})`,
  transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
});

// ── Filter Pills ────────────────────────────────────────────────────────────

export const filterPillList = style({
  display: 'flex',
  gap: vars.space.xs,
  overflowX: 'auto',
  paddingBottom: '2px',
  scrollbarWidth: 'none',
});

globalStyle(`${filterPillList}::-webkit-scrollbar`, {
  display: 'none',
});

export const filterPill = style({
  padding: `3px ${vars.space.md}`,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  color: vars.color.textSecondary,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: vars.color.borderHover,
  },
});

export const filterPillActive = style({
  color: vars.color.textPrimary,
  backgroundColor: vars.color.accentMuted,
  borderColor: vars.color.accent,
});

export const achievementsCount = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
});

// ── Quests Panel ────────────────────────────────────────────────────────────

export const questsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  marginTop: vars.space.lg,
});

export const questsHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const questsSectionLabel = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.textSecondary,
});

export const questsCompletionText = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
});

export const questsEmpty = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: vars.space.xl,
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.md,
  textAlign: 'center',
  backgroundColor: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
});

// ── Tab Navigation ──────────────────────────────────────────────────────────

export const tabList = style({
  display: 'flex',
  gap: '2px',
  borderBottom: `1px solid ${vars.color.border}`,
  paddingBottom: '0',
});

export const tabTrigger = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.textSecondary,
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    backgroundColor: vars.color.bgHover,
  },
});

export const tabTriggerActive = style({
  color: vars.color.accent,
  borderBottomColor: vars.color.accent,
});

export const tabContent = style({
  paddingTop: vars.space.md,
});

// ── Status bar gamification ─────────────────────────────────────────────────

export const statusHunterSection = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  padding: 0,
  borderRadius: vars.radius.sm,
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const statusLevelText = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  fontFamily: vars.font.display,
});

export const statusMiniXpTrack = style({
  width: '40px',
  height: '3px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.bgTertiary,
  overflow: 'hidden',
});

export const statusMiniXpFill = style({
  height: '100%',
  borderRadius: vars.radius.full,
  transition: `width 600ms ease`,
});

// ── Achievement Toast ───────────────────────────────────────────────────────

export const achievementToast = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  animation: `${achievementSlideIn} 400ms ease-out`,
});

export const achievementToastIcon = style({
  fontSize: '1.5rem',
});

export const achievementToastContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const achievementToastTitle = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.xp,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

export const achievementToastName = style({
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.textPrimary,
});
