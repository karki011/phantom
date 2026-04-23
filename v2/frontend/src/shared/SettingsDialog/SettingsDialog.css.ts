// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const settingsLayout = style({
  display: 'flex',
  flexDirection: 'row',
  height: '480px',
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

globalStyle(`${themeSwatch} > span:first-child`, {
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.full,
  border: `2px solid ${vars.color.border}`,
  transition: `all ${vars.animation.fast} ease`,
});

globalStyle(`${themeSwatch}:hover > span:first-child`, {
  borderColor: vars.color.borderHover,
  boxShadow: `0 0 0 2px ${vars.color.bgHover}`,
});

export const themeSwatchActive = style({});

globalStyle(`${themeSwatchActive} > span:first-child`, {
  borderColor: vars.color.accent,
  boxShadow: `0 0 8px ${vars.color.accentGlow}`,
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
  gap: vars.space.sm,
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
