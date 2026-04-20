// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

// --- Layout ---

export const settingsLayout = style({
  display: 'flex',
  height: '100%',
  gap: 0,
});

export const sidebar = style({
  width: '220px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: `${vars.space.lg} ${vars.space.md}`,
  borderRight: `1px solid ${vars.color.divider}`,
  overflowY: 'auto',
});

export const sidebarItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: 'transparent',
  border: 'none',
  borderLeft: '2px solid transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  textAlign: 'left',
  width: '100%',
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  selectors: {
    '&[data-selected]': {
      background: vars.color.bgActive,
      color: vars.color.accent,
      borderLeftColor: vars.color.accent,
    },
  },
});

export const sidebarItemDanger = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: 'transparent',
  border: 'none',
  borderLeft: '2px solid transparent',
  color: vars.color.danger,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  textAlign: 'left',
  width: '100%',
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.danger} 10%, transparent)`,
    color: vars.color.danger,
  },
  selectors: {
    '&[data-selected]': {
      background: `color-mix(in srgb, ${vars.color.danger} 15%, transparent)`,
      color: vars.color.danger,
      borderLeftColor: vars.color.danger,
    },
  },
});

export const settingsContent = style({
  flex: 1,
  overflowY: 'auto',
  padding: vars.space.xl,
});

export const settingsSection = style({
  maxWidth: '560px',
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
});

// --- Theme Picker ---

export const themeGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.space.md,
});

export const themeCard = style({
  padding: vars.space.md,
  borderRadius: vars.radius.md,
  border: `2px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  ':hover': {
    borderColor: vars.color.accentMuted,
  },
  selectors: {
    '&[data-pressed]': {
      borderColor: vars.color.accent,
      boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
    },
  },
});

export const themePreview = style({
  height: '32px',
  borderRadius: vars.radius.sm,
  marginBottom: vars.space.xs,
});

export const themeName = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
});

export const themeType = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
});

// --- Font Style ---

export const fontGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.space.md,
});

export const fontCard = style({
  padding: vars.space.md,
  borderRadius: vars.radius.md,
  border: `2px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  textAlign: 'center',
  ':hover': {
    borderColor: vars.color.accentMuted,
  },
  selectors: {
    '&[data-pressed]': {
      borderColor: vars.color.accent,
      boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
    },
  },
});

export const fontSample = style({
  fontSize: vars.fontSize.lg,
  color: vars.color.textPrimary,
  marginBottom: vars.space.xs,
});

export const fontLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

// --- Operator Identity / Fields ---

export const fieldRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  padding: `${vars.space.md} 0`,
});

export const fieldLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
});

export const fieldHint = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const textInput = style({
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.md,
  outline: 'none',
  ':focus': {
    borderColor: vars.color.accent,
  },
});

// --- Gamification Switch (Kobalte) ---

export const switchRoot = style({
  display: 'inline-flex',
  alignItems: 'center',
});

export const switchInput = style({});

export const switchControl = style({
  position: 'relative',
  width: '44px',
  height: '24px',
  borderRadius: vars.radius.full,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  padding: 0,
  selectors: {
    '&[data-checked]': {
      background: vars.color.accent,
      borderColor: vars.color.accent,
    },
  },
});

export const switchThumb = style({
  position: 'absolute',
  top: '2px',
  left: '2px',
  width: '18px',
  height: '18px',
  borderRadius: vars.radius.full,
  background: vars.color.textPrimary,
  transition: `transform ${vars.animation.fast}`,
  selectors: {
    '&[data-checked]': {
      transform: 'translateX(20px)',
    },
  },
});

// --- Ward Level / Select Group ---

export const selectGroup = style({
  display: 'flex',
  gap: vars.space.sm,
});

export const selectOption = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  ':hover': {
    background: vars.color.bgHover,
  },
  selectors: {
    '&[data-pressed]': {
      background: vars.color.bgActive,
      color: vars.color.accent,
      borderColor: vars.color.accent,
    },
  },
});

// --- Reset / Danger Zone ---

export const sectionDescription = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  marginBottom: vars.space.xs,
});

export const dangerButton = style({
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.danger}`,
  background: 'transparent',
  color: vars.color.danger,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.danger} 15%, transparent)`,
  },
});
