// Author: Subash Karki

import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const slideDown = keyframes({
  from: { opacity: 0, transform: 'translateY(-8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
  background: 'transparent',
});

export const dropdown = style({
  position: 'fixed',
  top: '44px',
  right: '120px',
  width: '400px',
  maxHeight: '480px',
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  boxShadow: vars.shadow.lg,
  overflow: 'hidden',
  animation: `${slideDown} ${vars.animation.fast} ease-out`,
});

export const statusBanner = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  background: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const statusDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  flexShrink: 0,
  boxShadow: `0 0 6px ${vars.color.accentGlow}`,
});

export const statusLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  fontWeight: 500,
});

export const chatArea = style({
  flex: 1,
  overflowY: 'auto',
  padding: vars.space.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  maxHeight: '300px',
});

export const emptyChat = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '80px',
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textDisabled,
});

export const messageUser = style({
  alignSelf: 'flex-end',
  maxWidth: '80%',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.accentMuted,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: `${vars.radius.md} ${vars.radius.md} ${vars.radius.sm} ${vars.radius.md}`,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
});

export const messagePhantom = style({
  alignSelf: 'flex-start',
  maxWidth: '80%',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: `${vars.radius.md} ${vars.radius.md} ${vars.radius.md} ${vars.radius.sm}`,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
});

export const messageTimestamp = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  marginTop: '2px',
  textAlign: 'right',
});

export const quickActionsBar = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.md}`,
  borderTop: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const quickActionChip = style({
  padding: `2px ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast}, border-color ${vars.animation.fast}, color ${vars.animation.fast}`,
  selectors: {
    '&:hover': {
      background: vars.color.bgHover,
      borderColor: vars.color.accent,
      color: vars.color.textPrimary,
    },
  },
});

export const inputArea = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: vars.space.sm,
  borderTop: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const inputBox = style({
  flex: 1,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  outline: 'none',
  transition: `border-color ${vars.animation.fast}`,
  selectors: {
    '&:focus': {
      borderColor: vars.color.borderFocus,
    },
    '&::placeholder': {
      color: vars.color.textDisabled,
    },
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
});

const thinkingPulse = keyframes({
  '0%, 100%': { opacity: 0.3 },
  '50%': { opacity: 1 },
});

export const thinkingBubble = style({
  alignSelf: 'flex-start',
  display: 'flex',
  gap: '4px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: `${vars.radius.md} ${vars.radius.md} ${vars.radius.md} ${vars.radius.sm}`,
});

export const thinkingDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  animation: `${thinkingPulse} 1.4s ease-in-out infinite`,
  selectors: {
    '&:nth-child(2)': { animationDelay: '0.2s' },
    '&:nth-child(3)': { animationDelay: '0.4s' },
  },
});

export const sendButton = style({
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.accent,
  border: 'none',
  borderRadius: vars.radius.md,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textInverse,
  cursor: 'pointer',
  fontWeight: 600,
  transition: `background ${vars.animation.fast}, opacity ${vars.animation.fast}`,
  selectors: {
    '&:hover': {
      background: vars.color.accentHover,
    },
    '&:disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
});
