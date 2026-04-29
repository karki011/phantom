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

// ── Traffic Light Inset ──────────────────────────────────────────────────────
// macOS TitleBarHiddenInset places the traffic light buttons inside the WebView.
// When NOT in fullscreen we add ~78px left padding so content clears the buttons.
// The `trafficLightInset` class is toggled dynamically via the fullscreen signal.

export const TRAFFIC_LIGHT_WIDTH = '78px';

export const trafficLightInset = style({});

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
  transition: `padding-left 200ms ease`,
  selectors: {
    [`${trafficLightInset} &`]: {
      paddingLeft: TRAFFIC_LIGHT_WIDTH,
    },
  },
  // Allow the header to be dragged to move the window (Wails title bar area)
  WebkitAppRegion: 'drag',
} as any);

// ── Window Drag Strip ─────────────────────────────────────────────────────────

// Wails v2 (macOS) does NOT honor `-webkit-app-region`. Its injected runtime
// reads a custom CSS variable: `--wails-draggable: drag` (see
// wails/v2/internal/frontend/runtime/desktop/main.js → `dragTest` calls
// getComputedStyle(target).getPropertyValue('--wails-draggable')).
// We set BOTH so the rule survives if Wails ever switches detection mechanism.
export const windowDragStrip = style({
  height: '44px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  background: vars.color.bgSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  paddingLeft: TRAFFIC_LIGHT_WIDTH,
  paddingRight: vars.space.sm,
  gap: vars.space.sm,
  vars: {
    '--wails-draggable': 'drag',
  },
  WebkitAppRegion: 'drag',
} as any);

export const windowDragStripActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  vars: {
    '--wails-draggable': 'no-drag',
  },
  WebkitAppRegion: 'no-drag',
} as any);

export const windowDragStripCenter = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  minWidth: 0,
  userSelect: 'none',
  vars: {
    '--wails-draggable': 'drag',
  },
} as any);

export const windowDragStripRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexShrink: 0,
  vars: {
    '--wails-draggable': 'no-drag',
  },
} as any);

export const navHistoryButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
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
  ':disabled': {
    color: vars.color.textDisabled,
    cursor: 'not-allowed',
    opacity: 0.4,
  },
});

// ── Top Tab Segmented Control (in WindowDragStrip) ───────────────────────────

export const topTabSegmented = style({
  display: 'inline-flex',
  alignItems: 'stretch',
  borderRadius: vars.radius.md,
  background: vars.color.bgPrimary,
  padding: '2px',
  gap: '2px',
  flexShrink: 0,
});

export const topTabSegment = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `0 ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  color: vars.color.textSecondary,
  background: 'transparent',
  border: 'none',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  outline: 'none',
  height: '22px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

export const topTabSegmentActive = style({
  color: vars.color.accent,
  background: vars.color.accentMuted,
  ':hover': {
    color: vars.color.accent,
    background: vars.color.accentMuted,
  },
});

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
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
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
  WebkitAppRegion: 'no-drag',
  ':hover': {
    color: vars.color.accentHover,
  },
} as any);

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
  whiteSpace: 'nowrap',
});

export const sessionDot = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  backgroundColor: vars.color.success,
  boxShadow: vars.shadow.successGlow,
  flexShrink: 0,
});

export const statDivider = style({
  color: vars.color.textDisabled,
  margin: `0 ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  userSelect: 'none',
  flexShrink: 0,
});

export const statItem = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  whiteSpace: 'nowrap',
});

export const headerActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  flexShrink: 0,
  WebkitAppRegion: 'no-drag',
} as any);

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

export const headerIconButtonDanger = style({
  color: vars.color.danger,
  ':hover': {
    color: vars.color.danger,
    background: vars.color.dangerMuted,
  },
});

// ── Status sub-elements (used by WindowDragStrip Hunter button) ──────────────

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
