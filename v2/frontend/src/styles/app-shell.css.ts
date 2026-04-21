// PhantomOS v2 — App shell layout styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

// ── Keyframes ─────────────────────────────────────────────────────────────────

const powerOnSweep = keyframes({
  '0%': { top: '0%' },
  '100%': { top: '100%' },
});

const powerOnFade = keyframes({
  '0%': { opacity: 1 },
  '100%': { opacity: 0 },
});

// ── Shell ─────────────────────────────────────────────────────────────────────

export const appShell = style({
  height: '100vh',
  width: '100vw',
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgPrimary,
  fontFamily: vars.font.body,
  overflow: 'hidden',
});

// ── Header ────────────────────────────────────────────────────────────────────

export const header = style({
  height: '3.5rem',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  paddingLeft: vars.space.md,
  paddingRight: vars.space.md,
  borderBottom: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  gap: vars.space.sm,
});

// ── Top Tab Bar ───────────────────────────────────────────────────────────────

export const topTabBar = style({
  height: '32px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  borderBottom: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  paddingLeft: vars.space.sm,
  gap: '2px',
});

export const topTab = style({
  display: 'flex',
  alignItems: 'center',
  paddingLeft: vars.space.md,
  paddingRight: vars.space.md,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.body,
  color: vars.color.textSecondary,
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  userSelect: 'none',
  transition: `color ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  outline: 'none',

  ':hover': {
    color: vars.color.textPrimary,
    borderBottomColor: vars.color.accentMuted,
  },
});

export const topTabActive = style([
  topTab,
  {
    color: vars.color.accent,
    borderBottomColor: vars.color.accent,

    ':hover': {
      color: vars.color.accent,
      borderBottomColor: vars.color.accent,
    },
  },
]);

// ── Main Content ──────────────────────────────────────────────────────────────

export const mainContent = style({
  flex: 1,
  overflow: 'hidden',
  position: 'relative',
  contain: 'layout style',
});

// ── Three-column Layout ───────────────────────────────────────────────────────

export const threeColumnLayout = style({
  display: 'flex',
  flexDirection: 'row',
  height: '100%',
  overflow: 'hidden',
});

export const centerWorkspace = style({
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});

// ── Status Bar ────────────────────────────────────────────────────────────────

export const statusBar = style({
  height: '2.5rem',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  paddingLeft: vars.space.md,
  paddingRight: vars.space.md,
  borderTop: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  gap: vars.space.sm,
});

// ── Placeholder States ────────────────────────────────────────────────────────

export const shellReady = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  userSelect: 'none',
});

export const systemPlaceholder = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  userSelect: 'none',
  letterSpacing: '0.05em',
});

// ── Header sub-elements ───────────────────────────────────────────────────────

export const headerLogo = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.md,
  fontWeight: 700,
  color: vars.color.accent,
  letterSpacing: '0.08em',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: `0 ${vars.space.xs}`,
  outline: 'none',
  flexShrink: 0,
  textTransform: 'uppercase',
  ':hover': {
    color: vars.color.accentHover,
  },
});

export const headerCenter = style({
  flex: 1,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const sessionIndicator = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  letterSpacing: '0.04em',
});

export const sessionDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: vars.color.success,
  boxShadow: vars.shadow.successGlow,
  flexShrink: 0,
});

export const headerActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flexShrink: 0,
});

export const headerIconButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  outline: 'none',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

// ── Status Bar sub-elements ───────────────────────────────────────────────────

export const statusLeft = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flex: 1,
});

export const statusCenter = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flex: 1,
  justifyContent: 'center',
});

export const statusRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flex: 1,
  justifyContent: 'flex-end',
});

export const statusText = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
});

export const statusMuted = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
});

export const statusDivider = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.divider,
  userSelect: 'none',
});

export const statusDotConnected = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: vars.color.success ?? '#3AE8B0',
  boxShadow: vars.shadow.successGlow,
  flexShrink: 0,
});

export const statusDotDisconnected = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: vars.color.danger,
  flexShrink: 0,
});

// ── Boot Overlay ──────────────────────────────────────────────────────────────

export const bootOverlay = style({
  position: 'fixed',
  inset: 0,
  background: vars.color.bgPrimary,
  zIndex: 150,
  animation: `${powerOnFade} 500ms ease-out 1000ms forwards`,
  pointerEvents: 'none',
});

export const bootSweepLine = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: '2px',
  background: vars.color.accent,
  boxShadow: `0 0 20px ${vars.color.accentGlow}, 0 -10px 30px ${vars.color.accentMuted}, 0 10px 30px ${vars.color.accentMuted}`,
  animation: `${powerOnSweep} 800ms ease-in-out 200ms forwards`,
  top: '0%',
});
