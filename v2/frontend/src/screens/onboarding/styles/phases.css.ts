// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

// Form
export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const label = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
});

export const input = style({
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.md,
  padding: `${vars.space.md} ${vars.space.lg}`,
  outline: 'none',
  transition: `border-color ${vars.animation.fast} ease`,
  width: '100%',
  ':focus': {
    borderColor: vars.color.borderFocus,
    boxShadow: `0 0 0 2px ${vars.color.accentMuted}`,
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

// Project card
export const projectCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
});

export const projectIcon = style({
  width: '36px',
  height: '36px',
  borderRadius: vars.radius.sm,
  background: vars.color.accentMuted,
  border: `1px solid ${vars.color.accent}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.accent,
  fontWeight: 700,
  flexShrink: 0,
});

export const projectInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  minWidth: 0,
});

export const projectName = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const projectMeta = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

// Toggle row (layout wrapper — kept for NeuralLinkPhase row structure)
export const toggleRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.lg,
  padding: `${vars.space.lg} 0`,
  borderBottom: `1px solid ${vars.color.divider}`,
});

export const toggleLabel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const toggleTitle = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
  fontWeight: 500,
});

export const toggleDesc = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  lineHeight: 1.4,
});

// Kobalte Switch styles
export const switchRoot = style({
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
});

export const switchInput = style({
  // Kobalte visually hides this — left intentionally empty for focus style overrides if needed
});

export const switchControl = style({
  position: 'relative',
  width: '48px',
  height: '26px',
  borderRadius: vars.radius.full,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  padding: 0,
  selectors: {
    '&[data-checked]': {
      background: vars.color.accentMuted,
      borderColor: vars.color.accent,
    },
  },
});

export const switchThumb = style({
  position: 'absolute',
  top: '2px',
  left: '2px',
  width: '20px',
  height: '20px',
  borderRadius: vars.radius.full,
  background: vars.color.textDisabled,
  transition: `transform ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  selectors: {
    '&[data-checked]': {
      transform: 'translateX(22px)',
      background: vars.color.accent,
    },
  },
});

// Theme grid
export const themeGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.space.md,
});

export const themeCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: 0,
  background: 'transparent',
  border: `2px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  cursor: 'pointer',
  transition: `border-color ${vars.animation.fast} ease, box-shadow ${vars.animation.fast} ease`,
  textAlign: 'left',
  overflow: 'hidden',
  ':hover': {
    borderColor: vars.color.borderHover,
  },
  selectors: {
    '&[data-pressed]': {
      borderColor: vars.color.accent,
      boxShadow: `0 0 16px color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
    },
  },
});

export const themePreview = style({
  height: '80px',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'flex-start',
  padding: vars.space.sm,
  gap: vars.space.sm,
  position: 'relative',
});

export const themePreviewAccent = style({
  width: '10px',
  height: '10px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const themeCardBody = style({
  padding: `${vars.space.sm} ${vars.space.md} ${vars.space.md}`,
});

export const themeName = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 500,
});

export const themeDesc = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  lineHeight: 1.4,
});

// Font style grid
export const fontGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.space.md,
});

export const fontCard = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: vars.space.md,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  cursor: 'pointer',
  transition: `border-color ${vars.animation.fast} ease`,
  textAlign: 'center',
  ':hover': {
    borderColor: vars.color.borderHover,
  },
  selectors: {
    '&[data-pressed]': {
      borderColor: vars.color.accent,
      background: vars.color.accentMuted,
    },
  },
});

export const fontName = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const fontSample = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

// Ward level ToggleGroup
export const selectGroup = style({
  display: 'flex',
  gap: vars.space.md,
  width: '100%',
});

export const selectOption = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  background: vars.color.bgPrimary,
  border: `2px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  color: vars.color.textPrimary,
  padding: `${vars.space.lg} ${vars.space.md}`,
  cursor: 'pointer',
  textAlign: 'center',
  transition: `border-color ${vars.animation.fast} ease, background ${vars.animation.fast} ease, box-shadow ${vars.animation.fast} ease`,
  ':hover': {
    borderColor: vars.color.borderHover,
    background: vars.color.bgHover,
  },
  selectors: {
    '&[data-pressed]': {
      background: vars.color.bgActive,
      borderColor: vars.color.accent,
      boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
    },
  },
});

export const successText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.success,
  textAlign: 'center',
});
