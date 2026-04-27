// PhantomOS v2 — Editor pane Vanilla Extract styles
// Author: Subash Karki

import { style, keyframes, globalStyle, globalKeyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

const scanLineIn = keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const glowPulse = keyframes({
  '0%': { opacity: 0.4 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.4 },
});

const shimmer = keyframes({
  '0%': { backgroundPosition: '-200% 0' },
  '100%': { backgroundPosition: '200% 0' },
});

// ---------------------------------------------------------------------------
// Editor wrapper — fills the entire pane
// ---------------------------------------------------------------------------

export const editorWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: vars.color.editorBg,
});

// ---------------------------------------------------------------------------
// File tab bar — glass panel above the editor
// ---------------------------------------------------------------------------

export const fileTabBar = style({
  display: 'flex',
  alignItems: 'center',
  height: 32,
  minHeight: 32,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 85%, transparent)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'none',
  flexShrink: 0,
});

globalStyle(`${fileTabBar}::-webkit-scrollbar`, { display: 'none' });

export const fileTab = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: '100%',
  padding: `0 ${vars.space.md}`,
  border: 'none',
  borderRight: `1px solid color-mix(in srgb, ${vars.color.border} 40%, transparent)`,
  background: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  animation: `${scanLineIn} 200ms ease both`,
  position: 'relative',

  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },

  selectors: {
    '&[data-active="true"]': {
      color: vars.color.textPrimary,
      background: vars.color.bgActive,
      borderBottom: `2px solid ${vars.color.accent}`,
      boxShadow: `inset 0 -1px 0 ${vars.color.accent}`,
    },
  },
});

export const fileTabLabel = style({
  maxWidth: 140,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const dirtyDot = style({
  width: 6,
  height: 6,
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.accent,
  boxShadow: `0 0 6px ${vars.color.accentMuted}`,
  flexShrink: 0,
  animation: `${glowPulse} 2s ease-in-out infinite`,
});

export const fileTabClose = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textDisabled,
  fontSize: '11px',
  lineHeight: 1,
  cursor: 'pointer',
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease, color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,

  ':hover': {
    color: vars.color.danger,
    background: vars.color.dangerMuted,
  },

  selectors: {
    [`${fileTab}:hover &`]: {
      opacity: 1,
    },
    [`${fileTab}[data-active="true"] &`]: {
      opacity: 1,
    },
  },
});

// ---------------------------------------------------------------------------
// Monaco container
// ---------------------------------------------------------------------------

export const editorContainer = style({
  flex: 1,
  overflow: 'hidden',
  position: 'relative',
});

// Override Monaco's scrollbar to match theme
globalStyle(`${editorContainer} .monaco-scrollable-element > .scrollbar > .slider`, {
  borderRadius: '4px',
});

// ---------------------------------------------------------------------------
// Status bar — bottom info strip
// ---------------------------------------------------------------------------

export const statusBar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 22,
  minHeight: 22,
  padding: `0 ${vars.space.md}`,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 90%, transparent)`,
  borderTop: `1px solid color-mix(in srgb, ${vars.color.accent} 8%, transparent)`,
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  flexShrink: 0,
  userSelect: 'none',
});

export const statusBarLeft = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
});

export const statusBarRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
});

export const statusBarItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: `color ${vars.animation.fast} ease`,

  ':hover': {
    color: vars.color.textSecondary,
  },
});

// ---------------------------------------------------------------------------
// Loading state — skeleton shimmer
// ---------------------------------------------------------------------------

export const loadingOverlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.md,
  background: vars.color.editorBg,
  zIndex: 10,
});

export const loadingText = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textDisabled,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  animation: `${glowPulse} 1.5s ease-in-out infinite`,
});

export const loadingBar = style({
  width: 120,
  height: 2,
  borderRadius: vars.radius.full,
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  backgroundSize: '200% 100%',
  animation: `${shimmer} 1.5s ease-in-out infinite`,
});

// ---------------------------------------------------------------------------
// Empty state — no files open
// ---------------------------------------------------------------------------

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: vars.space.md,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  userSelect: 'none',
  animation: `${scanLineIn} 300ms ease both`,
});

export const emptyStateHint = style({
  fontSize: vars.fontSize.xs,
  opacity: 0.6,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const emptyStateKbd = style({
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '1px 6px',
  fontSize: '10px',
  fontWeight: 600,
});

// ---------------------------------------------------------------------------
// Diff toolbar — glass bar above diff editor with Accept / Reject / Toggle
// ---------------------------------------------------------------------------

export const diffToolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 36,
  minHeight: 36,
  padding: `0 ${vars.space.md}`,
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  flexShrink: 0,
  gap: vars.space.md,
  animation: `${scanLineIn} 200ms ease both`,
});

export const diffToolbarLeft = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const diffToolbarCenter = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const diffToolbarRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

const diffButtonBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: 24,
  padding: `0 ${vars.space.md}`,
  border: 'none',
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  whiteSpace: 'nowrap',
});

export const diffAcceptButton = style([diffButtonBase, {
  background: vars.color.success,
  color: vars.color.textInverse,
  boxShadow: `0 0 8px ${vars.color.successMuted}`,

  ':hover': {
    boxShadow: vars.shadow.successGlow,
    transform: 'translateY(-1px)',
  },

  ':active': {
    transform: 'translateY(0)',
  },
}]);

export const diffRejectButton = style([diffButtonBase, {
  background: vars.color.danger,
  color: vars.color.textInverse,
  boxShadow: `0 0 8px ${vars.color.dangerMuted}`,

  ':hover': {
    boxShadow: vars.shadow.dangerGlow,
    transform: 'translateY(-1px)',
  },

  ':active': {
    transform: 'translateY(0)',
  },
}]);

export const diffToggleButton = style([diffButtonBase, {
  background: `color-mix(in srgb, ${vars.color.bgActive} 60%, transparent)`,
  color: vars.color.textSecondary,
  border: `1px solid ${vars.color.border}`,

  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgActive,
    borderColor: vars.color.borderHover,
  },
}]);

export const diffCloseButton = style([diffButtonBase, {
  background: 'transparent',
  color: vars.color.textDisabled,
  padding: `0 ${vars.space.sm}`,
  minWidth: 24,

  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
}]);

// ---------------------------------------------------------------------------
// Diff file labels — shown above each side in standalone DiffPane
// ---------------------------------------------------------------------------

export const diffFileLabels = style({
  display: 'flex',
  alignItems: 'center',
  height: 26,
  minHeight: 26,
  flexShrink: 0,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.border} 40%, transparent)`,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 60%, transparent)`,
});

export const diffFileLabel = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${vars.space.md}`,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const diffFileLabelOriginal = style([diffFileLabel, {
  borderRight: `1px solid color-mix(in srgb, ${vars.color.border} 40%, transparent)`,
  color: vars.color.danger,
}]);

export const diffFileLabelModified = style([diffFileLabel, {
  color: vars.color.success,
}]);

export const diffFileLabelTag = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 6px',
  borderRadius: vars.radius.sm,
  fontSize: '9px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginRight: vars.space.sm,
});

export const diffFileLabelTagOriginal = style([diffFileLabelTag, {
  background: vars.color.dangerMuted,
  color: vars.color.danger,
}]);

export const diffFileLabelTagModified = style([diffFileLabelTag, {
  background: vars.color.successMuted,
  color: vars.color.success,
}]);

// ---------------------------------------------------------------------------
// Diff review button — appears in editor status bar when file is dirty
// ---------------------------------------------------------------------------

export const diffReviewButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: 16,
  padding: '0 6px',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.accentMuted} 40%, transparent)`,
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,

  ':hover': {
    background: vars.color.accentMuted,
    borderColor: vars.color.accent,
    boxShadow: `0 0 6px ${vars.color.accentMuted}`,
  },
});

// ---------------------------------------------------------------------------
// Git Blame Decorations
// Author: Subash Karki
// ---------------------------------------------------------------------------

globalKeyframes('phantom-blame-fade-in', {
  from: { opacity: '0' },
  to: { opacity: '1' },
});

/** Level 1: Current line inline blame (faded text after line content) */
globalStyle('.phantom-blame-inline', {
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontStyle: 'italic',
  letterSpacing: '0.02em',
  pointerEvents: 'none',
  userSelect: 'none',
  opacity: 0.5,
});

/** Level 2: Full-file blame gutter text */
globalStyle('.phantom-blame-gutter', {
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: '0.8em',
  paddingRight: vars.space.lg,
  whiteSpace: 'pre',
  userSelect: 'none',
});

/** Alternating blame group backgrounds for visual separation */
globalStyle('.phantom-blame-line-even', {
  background: `color-mix(in srgb, ${vars.color.textPrimary} 2%, transparent)`,
});

globalStyle('.phantom-blame-line-odd', {
  background: `color-mix(in srgb, ${vars.color.textPrimary} 5%, transparent)`,
});

// ── DiffPane static styles ────────────────────────────────────────────────────

export const diffFileLink = style({
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
});

export const diffEditorWrap = style({
  position: 'relative',
  flex: 1,
  overflow: 'hidden',
});

export const diffEditorFill = style({
  width: '100%',
  height: '100%',
});

// ── EditorPane status bar accent text ─────────────────────────────────────────

export const statusBarItemAccent = style({
  color: vars.color.accent,
});

