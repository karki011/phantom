// Phantom — Agents overlay styles (glass panel + accent glow)
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

// === Animations ===

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(-12px) scale(0.96)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

const glowPulse = keyframes({
  '0%, 100%': { boxShadow: `${vars.shadow.lg}, 0 0 30px color-mix(in srgb, ${vars.color.accent} 15%, transparent)` },
  '50%': { boxShadow: `${vars.shadow.lg}, 0 0 50px color-mix(in srgb, ${vars.color.accent} 25%, transparent)` },
});

const backdropFadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const breathe = keyframes({
  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
  '50%': { opacity: 0.7, transform: 'scale(0.85)' },
});

// === Layout ===

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  paddingTop: '72px',
  background: vars.color.bgOverlay,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  animation: `${backdropFadeIn} 120ms ease-out`,
});

export const container = style({
  width: '500px',
  maxWidth: 'calc(100vw - 48px)',
  maxHeight: '520px',
  display: 'flex',
  flexDirection: 'column',
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
  borderRadius: vars.radius.lg,
  boxShadow: `${vars.shadow.lg}, 0 0 40px color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  overflow: 'hidden',
  animation: `${fadeIn} 150ms cubic-bezier(0.16, 1, 0.3, 1), ${glowPulse} 4s ease-in-out infinite`,
});

// === Header ===

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.divider}`,
});

export const headerIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
});

export const headerTitle = style({
  flex: 1,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  color: vars.color.textPrimary,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
});

export const launchButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 500,
  color: vars.color.accent,
  background: `color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
    borderColor: vars.color.accent,
  },
});

export const escBadge = style({
  flexShrink: 0,
  padding: `2px ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  lineHeight: 1.4,
});

// === List ===

export const list = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.xs} 0`,
});

export const agentRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  cursor: 'pointer',
  borderLeft: '2px solid transparent',
  transition: `background ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
  },
  selectors: {
    '&:active': {
      background: vars.color.bgActive,
    },
  },
});

export const dot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.success,
  flexShrink: 0,
});

globalStyle(`${dot}[data-live-state="running"]`, {
  backgroundColor: vars.color.success,
  boxShadow: `0 0 4px ${vars.color.success}`,
  animation: `${breathe} 1.4s ease-in-out infinite`,
});

globalStyle(`${dot}[data-live-state="waiting"]`, {
  backgroundColor: vars.color.warning,
  boxShadow: `0 0 4px ${vars.color.warning}`,
  animation: 'none',
});

globalStyle(`${dot}[data-live-state="idle"]`, {
  backgroundColor: vars.color.textDisabled,
  boxShadow: 'none',
  animation: 'none',
});

globalStyle(`${dot}[data-live-state="error"]`, {
  backgroundColor: vars.color.danger,
  boxShadow: `0 0 4px ${vars.color.danger}`,
  animation: 'none',
});

export const branch = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.accent,
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const project = style({
  fontSize: '10px',
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  flexShrink: 1,
  minWidth: '40px',
  maxWidth: '35%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const status = style({
  fontSize: '10px',
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  flexShrink: 0,
  textTransform: 'capitalize',
});

// === Empty State ===

export const empty = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.space.xxl} ${vars.space.lg}`,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  textAlign: 'center',
  lineHeight: 1.6,
});

// === Footer ===

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.lg,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderTop: `1px solid ${vars.color.divider}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
});

export const footerKbd = style({
  padding: `1px ${vars.space.xs}`,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '3px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});

// === Scrollbar ===

globalStyle(`${list}::-webkit-scrollbar`, {
  width: '4px',
});

globalStyle(`${list}::-webkit-scrollbar-thumb`, {
  background: vars.color.border,
  borderRadius: '2px',
});

globalStyle(`${list}::-webkit-scrollbar-track`, {
  background: 'transparent',
});
