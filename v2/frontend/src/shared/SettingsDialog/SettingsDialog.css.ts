// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const settingsLayout = style({
  display: 'flex',
  flexDirection: 'row',
  height: '600px',
  overflow: 'hidden',
});

export const settingsSidebar = style({
  width: '180px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: vars.space.sm,
  borderRight: `1px solid ${vars.color.border}`,
  fontSize: vars.fontSize.sm,
});

export const settingsContent = style({
  flex: 1,
  overflowY: 'auto',
  padding: vars.space.lg,
  fontSize: vars.fontSize.sm,
});

export const sidebarItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  background: 'transparent',
  border: 'none',
  borderRadius: vars.radius.md,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  textAlign: 'left',
  width: '100%',
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

export const sidebarItemActive = style({
  background: vars.color.bgActive,
  color: vars.color.accent,
  borderLeft: `2px solid ${vars.color.accent}`,
  paddingLeft: `calc(${vars.space.md} - 2px)`,
});

export const settingRow = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${vars.space.md} 0`,
});

export const settingLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
});

export const settingDescription = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  marginTop: vars.space.xs,
});

export const themeGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: vars.space.md,
});

export const themeSwatch = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  padding: vars.space.sm,
  borderRadius: vars.radius.md,
  transition: `all ${vars.animation.fast} ease`,
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
    },
  },
});

globalStyle(`${themeSwatch}:hover > div:first-child`, {
  borderColor: vars.color.borderHover,
  boxShadow: `0 0 0 2px ${vars.color.bgHover}`,
});

export const themeSwatchActive = style({
  background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  outline: `1px solid color-mix(in srgb, ${vars.color.accent} 55%, transparent)`,
  outlineOffset: '-1px',
});

globalStyle(`${themeSwatchActive} > div:first-child`, {
  borderColor: vars.color.accent,
  boxShadow: `0 0 0 2px ${vars.color.accent}, 0 0 12px ${vars.color.accentGlow}`,
});

globalStyle(`${themeSwatchActive} > span`, {
  color: vars.color.accent,
  fontWeight: 600,
});

export const themeSwatchCheck = style({
  position: 'absolute',
  top: '4px',
  right: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '14px',
  height: '14px',
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  color: vars.color.textInverse,
});

export const themeSelectedLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

globalStyle(`${themeSelectedLabel} > strong`, {
  color: vars.color.accent,
  fontWeight: 600,
});

export const themeSwatchLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textAlign: 'center',
});

export const segmentedControl = style({
  display: 'flex',
  flexDirection: 'row',
});

globalStyle(`${segmentedControl} > button:first-child`, {
  borderRadius: `${vars.radius.md} 0 0 ${vars.radius.md}`,
});

globalStyle(`${segmentedControl} > button:last-child`, {
  borderRadius: `0 ${vars.radius.md} ${vars.radius.md} 0`,
});

globalStyle(`${segmentedControl} > button:not(:first-child)`, {
  marginLeft: '-1px',
});

export const segmentedButton = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

export const segmentedButtonActive = style({
  background: vars.color.accent,
  color: vars.color.textInverse,
  borderColor: vars.color.accent,
  selectors: {
    '&:hover': {
      background: vars.color.accentHover,
      color: vars.color.textInverse,
    },
  },
});

export const toggleRow = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${vars.space.md} 0`,
});

export const sectionRoot = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xl,
});

export const settingGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.xl,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
});

export const settingGroupHeader = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 400,
});

export const themeSwatchCircle = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.full,
  border: `2px solid ${vars.color.border}`,
  transition: `all ${vars.animation.fast} ease`,
});

export const shortcutList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const shortcutRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `6px 0`,
});

export const shortcutKeys = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: '2px 8px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
});

export const shortcutDescription = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
});

export const aboutBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const switchRoot = style({
  display: 'inline-flex',
  alignItems: 'center',
});

export const switchControl = style({
  width: '36px',
  height: '20px',
  borderRadius: vars.radius.full,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  padding: '2px',
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  selectors: {
    '[data-checked] &': {
      background: vars.color.accent,
      borderColor: vars.color.accent,
    },
  },
});

export const switchThumb = style({
  display: 'block',
  width: '14px',
  height: '14px',
  borderRadius: vars.radius.full,
  background: vars.color.textPrimary,
  transition: `transform ${vars.animation.fast} ease`,
  selectors: {
    '[data-checked] &': {
      transform: 'translateX(16px)',
    },
  },
});

// === System Section ===

export const inlineIconLabel = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const aboutTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.lg,
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const aboutAuthor = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

// === Providers Section ===

export const detectBanner = style({
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
});

export const detectBannerTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const detectBannerLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
});

export const detectProviderList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const detectProviderRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
});

export const detectProviderVersion = style({
  color: vars.color.textSecondary,
});

export const detectButtonRow = style({
  display: 'flex',
  gap: vars.space.sm,
});

export const providerHeaderRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const providerHeaderButtons = style({
  display: 'flex',
  gap: vars.space.sm,
});

export const providerListContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
});

export const skeletonCard = style({
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: vars.space.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  animation: 'pulse 1.5s ease-in-out infinite',
});

export const skeletonRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
});

export const skeletonAvatar = style({
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.md,
  background: vars.color.bgHover,
});

export const skeletonTextContainer = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const skeletonName = style({
  width: '140px',
  height: '14px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgHover,
});

export const skeletonDesc = style({
  width: '200px',
  height: '10px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgHover,
});

export const skeletonToggle = style({
  width: '36px',
  height: '20px',
  borderRadius: vars.radius.full,
  background: vars.color.bgHover,
});

export const providerEmptyState = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  padding: vars.space.xl,
  textAlign: 'center',
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
});

export const defaultProviderRow = style({
  display: 'flex',
  gap: vars.space.sm,
  marginTop: vars.space.sm,
  flexWrap: 'wrap',
});

export const providerSelectorButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  border: `2px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 400,
  transition: 'all 150ms ease',
  selectors: {
    '&[data-active="true"]': {
      border: `2px solid ${vars.color.accent}`,
      background: vars.color.accentMuted,
      color: vars.color.accent,
      fontWeight: 600,
    },
  },
});

export const providerSelectorDot = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: vars.color.textDisabled,
  flexShrink: 0,
  selectors: {
    '[data-active="true"] &': {
      background: vars.color.accent,
    },
  },
});

export const providerSelectorVersion = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  opacity: 0.7,
});

// === Slider ===

export const sliderContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  flex: 1,
  maxWidth: '260px',
});

export const sliderInput = style({
  width: '100%',
  maxWidth: '300px',
  height: '4px',
  appearance: 'none',
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.full,
  outline: 'none',
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
});

globalStyle(`${sliderInput}::-webkit-slider-thumb`, {
  appearance: 'none',
  width: '14px',
  height: '14px',
  borderRadius: '50%',
  background: vars.color.accent,
  border: 'none',
  cursor: 'pointer',
  transition: `box-shadow ${vars.animation.fast} ease`,
});

globalStyle(`${sliderInput}::-webkit-slider-thumb:hover`, {
  boxShadow: `0 0 6px ${vars.color.accentGlow}`,
});

globalStyle(`${sliderInput}::-moz-range-thumb`, {
  width: '14px',
  height: '14px',
  borderRadius: '50%',
  background: vars.color.accent,
  border: 'none',
  cursor: 'pointer',
});

export const sliderValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  minWidth: '40px',
  textAlign: 'right',
});
