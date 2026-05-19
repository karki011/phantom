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
  gap: '2px',
  minWidth: '280px',
  maxWidth: '420px',
  padding: `${vars.space.sm} ${vars.space.xs}`,
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 92%, transparent)`,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: '10px',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
  boxShadow: `${vars.shadow.lg}, 0 0 32px color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  animation: `${containerPop} 100ms cubic-bezier(0.16, 1, 0.3, 1)`,
});

// === Row-based items ===

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 10px',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'background 80ms ease',
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const rowSelected = style({
  background: vars.color.bgActive,
  boxShadow: `inset 0 0 0 1px ${vars.color.accent}`,
});

export const rowActive = style({
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${vars.color.success} 50%, transparent)`,
});

export const rowGlyph = style({
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: vars.color.bgActive,
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '11px',
  fontFamily: vars.font.body,
  flexShrink: 0,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
});

export const rowBranch = style({
  fontFamily: vars.font.mono,
  fontSize: '13px',
  fontWeight: 600,
  color: '#ffffff',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const rowProject = style({
  fontFamily: vars.font.body,
  fontSize: '11px',
  color: 'rgba(255, 255, 255, 0.5)',
  flexShrink: 0,
  whiteSpace: 'nowrap',
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
  fontSize: '12px',
  color: 'rgba(255, 255, 255, 0.45)',
  letterSpacing: '0.03em',
  userSelect: 'none',
});

export const footerKbd = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 6px',
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: '4px',
  fontSize: '11px',
  fontFamily: vars.font.mono,
  color: 'rgba(255, 255, 255, 0.6)',
  lineHeight: 1.5,
});
