// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

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

export const viewerWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: vars.color.editorBg,
});

export const codeContainer = style({
  flex: 1,
  overflow: 'auto',
  position: 'relative',
});

export const codeTable = style({
  minWidth: '100%',
  borderCollapse: 'collapse',
  fontFamily: vars.font.mono,
  fontSize: '13px',
  lineHeight: '20px',
});

export const codeLine = style({
  selectors: {
    '&:hover': {
      background: `color-mix(in srgb, ${vars.color.textPrimary} 3%, transparent)`,
    },
  },
});

export const lineNumber = style({
  width: '48px',
  minWidth: '48px',
  maxWidth: '48px',
  textAlign: 'right',
  paddingRight: vars.space.sm,
  color: vars.color.textDisabled,
  userSelect: 'none',
  verticalAlign: 'top',
  overflow: 'hidden',
});

export const lineContent = style({
  whiteSpace: 'pre',
  paddingLeft: vars.space.sm,
});

// Diff tab bar
export const diffTabBar = style({
  display: 'flex',
  alignItems: 'center',
  height: 32,
  minHeight: 32,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 85%, transparent)`,
  backdropFilter: 'blur(12px)',
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'none',
  flexShrink: 0,
});

export const diffTab = style({
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
    },
  },
});

export const diffTabLabel = style({
  maxWidth: 160,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const diffTabClose = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: vars.radius.sm,
  background: 'transparent',
  color: vars.color.textDisabled,
  fontSize: '11px',
  lineHeight: 1,
  cursor: 'pointer',
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.danger,
    background: vars.color.dangerMuted,
  },
  selectors: {
    [`${diffTab}:hover &`]: { opacity: 1 },
    [`${diffTab}[data-active="true"] &`]: { opacity: 1 },
  },
});


export const diffHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.md}`,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 85%, transparent)`,
  backdropFilter: 'blur(12px)',
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  flexShrink: 0,
});

export const diffFilePath = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const diffStats = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});

export const diffStatAdd = style({
  color: vars.color.success,
});

export const diffStatRemove = style({
  color: vars.color.danger,
});

// Edit textarea
export const editTextarea = style({
  width: '100%',
  height: '100%',
  resize: 'none',
  border: 'none',
  outline: 'none',
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontFamily: vars.font.mono,
  fontSize: '13px',
  lineHeight: '20px',
  color: vars.color.textPrimary,
  background: vars.color.editorBg,
  tabSize: 2,
  whiteSpace: 'pre',
  overflowWrap: 'normal',
  boxSizing: 'border-box',
});

// Dirty dot indicator on file tabs
export const dirtyDot = style({
  width: 6,
  height: 6,
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.accent,
  boxShadow: `0 0 6px ${vars.color.accentMuted}`,
  flexShrink: 0,
});

// Mode switch button (Files ↔ Diffs)
export const modeSwitchBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: '100%',
  padding: `0 ${vars.space.md}`,
  border: 'none',
  borderLeft: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
  background: 'transparent',
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  marginLeft: 'auto',
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 8%, transparent)`,
  },
});

// Status bar buttons
export const editToggleBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: 16,
  padding: '0 6px',
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
  borderRadius: vars.radius.sm,
  background: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: '9px',
  fontWeight: 600,
  cursor: 'pointer',
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

export const saveBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: 16,
  padding: '0 6px',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  borderRadius: vars.radius.sm,
  background: `color-mix(in srgb, ${vars.color.accentMuted} 40%, transparent)`,
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  fontSize: '9px',
  fontWeight: 600,
  cursor: 'pointer',
  ':hover': {
    background: vars.color.accentMuted,
    borderColor: vars.color.accent,
  },
});

export const statusBarItemAccent = style({
  color: vars.color.accent,
});

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
});

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

// CM6 container — fills the codeContainer flex parent
export const cmFillContainer = style({
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});

// Wrap toggle button in the status bar
export const wrapToggleBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 16,
  padding: 0,
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
  borderRadius: vars.radius.sm,
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
  selectors: {
    '&[data-active="true"]': {
      color: vars.color.accent,
      borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, transparent)`,
      background: `color-mix(in srgb, ${vars.color.accentMuted} 30%, transparent)`,
    },
  },
});

// ── Markdown preview toggle ──────────────────────────────────────────────────

export const previewToggleGroup = style({
  display: 'inline-flex',
  alignItems: 'center',
  marginLeft: 'auto',
  marginRight: vars.space.sm,
  height: 24,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
});

export const previewToggleBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: '100%',
  padding: `0 ${vars.space.sm}`,
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: '11px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
  selectors: {
    '&[data-active="true"]': {
      color: vars.color.accent,
      background: `color-mix(in srgb, ${vars.color.accentMuted} 40%, transparent)`,
    },
    '& + &': {
      borderLeft: `1px solid ${vars.color.border}`,
    },
  },
});
