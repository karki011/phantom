// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const slideIn = keyframes({
  from: { transform: 'translateX(110%)', opacity: 0 },
  to: { transform: 'translateX(0)', opacity: 1 },
});

const fadeOut = keyframes({
  from: { opacity: 1, transform: 'translateX(0)' },
  to: { opacity: 0, transform: 'translateX(110%)' },
});

export const toastList = style({
  position: 'fixed',
  bottom: vars.space.xl,
  right: vars.space.xl,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  width: '380px',
  listStyle: 'none',
  margin: 0,
  padding: 0,
  outline: 'none',
});

export const toast = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.lg,
  overflow: 'hidden',
  selectors: {
    '&[data-opened]': {
      animation: `${slideIn} 300ms cubic-bezier(0.16, 1, 0.3, 1)`,
    },
    '&[data-closed]': {
      animation: `${fadeOut} 200ms ease-in forwards`,
    },
    '&[data-swipe="move"]': {
      transform: 'translateX(var(--kb-toast-swipe-move-x))',
    },
    '&[data-swipe="cancel"]': {
      transform: 'translateX(0)',
      transition: 'transform 200ms ease-out',
    },
    '&[data-swipe="end"]': {
      animation: `${fadeOut} 200ms ease-in forwards`,
    },
  },
});

export const toastContent = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  padding: vars.space.md,
});

export const toastTitle = style({
  color: vars.color.textPrimary,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  fontFamily: vars.font.body,
  margin: 0,
});

export const toastDescription = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.body,
  marginTop: vars.space.xs,
});

export const toastClose = style({
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  borderRadius: vars.radius.sm,
  border: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  fontSize: vars.fontSize.md,
  lineHeight: 1,
  padding: 0,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

export const progressTrack = style({
  height: '3px',
  backgroundColor: vars.color.bgTertiary,
  width: '100%',
});

export const progressFill = style({
  height: '100%',
  backgroundColor: vars.color.accent,
  width: 'var(--kb-toast-progress-fill-width)',
  transition: 'width 100ms linear',
});

export const progressFillWarning = style({
  height: '100%',
  backgroundColor: vars.color.warning,
  width: 'var(--kb-toast-progress-fill-width)',
  transition: 'width 100ms linear',
});

export const toastTitleWarning = style({
  color: vars.color.warning,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  fontFamily: vars.font.body,
  margin: 0,
});
