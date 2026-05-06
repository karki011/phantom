// Author: Subash Karki
// Phantom — Worktree switcher overlay styles (Ctrl+Tab macOS app-switcher style, premium)

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

// === Animations ===

const backdropFadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const containerPop = keyframes({
  from: { opacity: 0, transform: 'scale(0.95) translateY(4px)' },
  to: { opacity: 1, transform: 'scale(1) translateY(0)' },
});

const cardEntrance = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

// === Backdrop ===

export const backdrop = style({
  position: 'fixed',
  inset: 0,
  zIndex: 10001,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  animation: `${backdropFadeIn} 100ms ease-out`,
});

// === Main container ===

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  maxWidth: '80vw',
  padding: `${vars.space.lg} ${vars.space.xl}`,
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 82%, transparent)`,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: '16px',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
  boxShadow: `${vars.shadow.lg}, 0 0 48px color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  animation: `${containerPop} 150ms cubic-bezier(0.16, 1, 0.3, 1)`,
});

// === Card row (horizontal scroll) ===

export const cardRow = style({
  display: 'flex',
  flexDirection: 'row',
  gap: vars.space.md,
  overflowX: 'auto',
  overflowY: 'visible',
  // Room for scale(1.05) card not to clip
  paddingBottom: '6px',
  paddingTop: '6px',
  scrollbarWidth: 'none',
});

globalStyle(`${cardRow}::-webkit-scrollbar`, {
  display: 'none',
});

// === Individual card ===

export const card = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '5px',
  padding: '12px 10px 10px',
  width: '120px',
  minWidth: '120px',
  height: '100px',
  borderRadius: vars.radius.md,
  cursor: 'pointer',
  border: '2px solid transparent',
  transition: 'border-color 150ms ease, background 150ms ease, transform 150ms ease, box-shadow 150ms ease',
  animation: `${cardEntrance} 200ms ease-out both`,
  flexShrink: 0,
  ':hover': {
    background: vars.color.bgHover,
    transform: 'translateY(-1px)',
  },
});

// Active = the currently open worktree — green glow border
export const cardActive = style({
  borderColor: `color-mix(in srgb, ${vars.color.success} 55%, transparent)`,
  boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.success} 20%, transparent)`,
});

// Selected = cursor position during Tab cycle — bright accent ring + scale up
export const cardSelected = style({
  borderColor: vars.color.accent,
  background: vars.color.bgActive,
  transform: 'scale(1.05)',
  boxShadow: `0 0 20px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
});

// === Glyph circle (48px) ===

export const glyphCircle = style({
  width: '48px',
  height: '48px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: vars.color.bgActive,
  color: vars.color.textPrimary,
  fontWeight: 700,
  fontSize: '16px',
  fontFamily: vars.font.body,
  flexShrink: 0,
  letterSpacing: '0.02em',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
});

// === Text labels ===

export const branchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  maxWidth: '108px',
  overflow: 'hidden',
});

export const branchIcon = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.accent,
  opacity: 0.85,
  flexShrink: 0,
  lineHeight: 1,
});

export const branchLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  textAlign: 'center',
});

export const projectLabel = style({
  fontFamily: vars.font.body,
  fontSize: '10px',
  color: vars.color.textSecondary,
  maxWidth: '108px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  lineHeight: 1.3,
});

export const pathLabel = style({
  fontFamily: vars.font.mono,
  fontSize: '9px',
  color: vars.color.textDisabled,
  maxWidth: '108px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  lineHeight: 1.2,
});

// === Status dot (top-right corner of card) ===

export const statusDot = style({
  position: 'absolute',
  top: '6px',
  right: '6px',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  border: `1.5px solid ${vars.color.bgTertiary}`,
});

export const statusDotTerminal = style({
  background: vars.color.success,
  boxShadow: `0 0 6px color-mix(in srgb, ${vars.color.success} 60%, transparent)`,
});

export const statusDotComposer = style({
  background: vars.color.info,
  boxShadow: `0 0 6px color-mix(in srgb, ${vars.color.info} 60%, transparent)`,
});

// === Footer keyboard hint ===

export const footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  paddingTop: vars.space.xs,
  borderTop: `1px solid ${vars.color.divider}`,
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  letterSpacing: '0.03em',
  userSelect: 'none',
});

export const footerKbd = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 5px',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '3px',
  fontSize: '9px',
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  lineHeight: 1.5,
});
