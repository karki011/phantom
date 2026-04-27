// PhantomOS v2 — Task HUD overlay styles (boot/onboarding aesthetic)
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';


export const overlay = style({
  position: 'absolute',
  top: '50%',
  right: vars.space.md,
  transform: 'translateY(-50%)',
  zIndex: 10,
  pointerEvents: 'auto',
});

export const badge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: `${vars.space.xs} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: 'rgba(0, 0, 0, 0.85)',
  backdropFilter: 'blur(12px)',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 40%, transparent)`,
  boxShadow: `0 0 10px ${vars.color.accentGlow}`,
  color: vars.color.accent,
  fontFamily: vars.font.display,
  fontSize: '0.65rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 18px ${vars.color.accentGlow}`,
    color: vars.color.textPrimary,
  },
});

export const planDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: vars.color.accent,
  boxShadow: `0 0 6px ${vars.color.accent}`,
  animation: 'pulse 2s ease-in-out infinite',
});

export const expandedPanel = style({
  minWidth: '240px',
  maxWidth: '320px',
  borderRadius: vars.radius.lg,
  background: 'rgba(0, 0, 0, 0.88)',
  backdropFilter: 'blur(16px)',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 35%, transparent)`,
  boxShadow: `0 0 16px ${vars.color.accentGlow}, inset 0 1px 0 color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  overflow: 'hidden',
  position: 'relative',
});

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
  background: `linear-gradient(180deg, color-mix(in srgb, ${vars.color.accent} 8%, transparent) 0%, transparent 100%)`,
});

export const headerTrigger = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  background: 'none',
  border: 'none',
  color: vars.color.accent,
  fontFamily: vars.font.display,
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  padding: '0',
  transition: `color ${vars.animation.fast} ease`,
  ':hover': { color: vars.color.textPrimary },
});

export const minimizeButton = style({
  background: 'none',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  borderRadius: vars.radius.sm,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `1px ${vars.space.xs}`,
  lineHeight: 1,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    borderColor: vars.color.accent,
  },
});

export const planPill = style({
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '0.55rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
  color: vars.color.accent,
  boxShadow: `0 0 6px ${vars.color.accentGlow}`,
  animation: 'pulse 2s ease-in-out infinite',
});

export const taskList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  maxHeight: '280px',
  overflowY: 'auto',
  '::-webkit-scrollbar': { width: '3px' },
  '::-webkit-scrollbar-thumb': {
    background: `color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
    borderRadius: '2px',
  },
});

export const taskRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.68rem',
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  padding: `3px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 6%, transparent)`,
  },
});

export const taskRowDone = style({
  color: vars.color.textDisabled,
  opacity: 0.7,
});

export const iconDone = style({
  color: vars.color.success,
  flexShrink: 0,
  filter: `drop-shadow(0 0 3px ${vars.color.success})`,
});

export const iconActive = style({
  color: vars.color.accent,
  flexShrink: 0,
  filter: `drop-shadow(0 0 4px ${vars.color.accent})`,
  animation: 'spin 1s linear infinite',
});

export const iconPending = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
});

export const taskText = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const taskTextDone = style({
  textDecoration: 'line-through',
  opacity: 0.6,
});

export const tabsList = style({
  display: 'flex',
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
});

export const tabTrigger = style({
  flex: 1,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: vars.color.textDisabled,
  fontFamily: vars.font.display,
  fontSize: '0.6rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': { color: vars.color.textSecondary },
  selectors: {
    '&[data-selected]': {
      color: vars.color.accent,
      borderBottomColor: vars.color.accent,
      boxShadow: `0 2px 8px ${vars.color.accentGlow}`,
    },
  },
});

export const tabContent = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
});

export const planCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  fontSize: '0.68rem',
  fontFamily: vars.font.mono,
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  paddingBottom: vars.space.sm,
});

export const planAge = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  fontStyle: 'italic',
});

export const planTitle = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const planProgress = style({
  color: vars.color.textSecondary,
});

export const openButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 35%, transparent)`,
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  fontSize: '0.65rem',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
    boxShadow: `0 0 8px ${vars.color.accentGlow}`,
  },
});

export const planEmpty = style({
  color: vars.color.textDisabled,
  fontSize: '0.65rem',
  fontFamily: vars.font.mono,
  fontStyle: 'italic',
});
