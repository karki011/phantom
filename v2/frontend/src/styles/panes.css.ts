// PhantomOS v2 — Pane system styles
// Author: Subash Karki

import { style, styleVariants, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

const skeletonPulse = keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.4 },
  '100%': { opacity: 1 },
});

export const skeletonPlaceholder = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.md,
  height: '100%',
  boxSizing: 'border-box',
});

export const skeletonLine = style({
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  selectors: {
    '[data-visible][data-animate] &': {
      animation: `${skeletonPulse} 1.8s ease-in-out infinite`,
    },
  },
});

export const skeletonHeader = style([
  {
    height: '16px',
    width: '40%',
    borderRadius: vars.radius.sm,
    background: vars.color.bgTertiary,
    marginBottom: vars.space.xs,
    selectors: {
      '[data-visible][data-animate] &': {
        animation: `${skeletonPulse} 1.8s ease-in-out infinite`,
      },
    },
  },
]);

export const skeletonBody = style([
  {
    flex: 1,
    borderRadius: vars.radius.sm,
    background: vars.color.bgTertiary,
    selectors: {
      '[data-visible][data-animate] &': {
        animation: `${skeletonPulse} 1.8s ease-in-out infinite 0.3s`,
      },
    },
  },
]);

// ---------------------------------------------------------------------------
// Workspace shell
// ---------------------------------------------------------------------------

export const workspace = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  position: 'relative',
});

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

export const tabBar = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  height: '32px',
  flexShrink: 0,
  backgroundColor: vars.color.bgSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  overflowX: 'auto',
  overflowY: 'hidden',
  gap: '1px',
  scrollbarWidth: 'none',
  '::-webkit-scrollbar': { display: 'none' },
});

export const tabList = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  flex: 1,
  gap: '1px',
});

export const tab = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  paddingInline: vars.space.sm,
  gap: vars.space.xs,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  cursor: 'pointer',
  minWidth: '80px',
  maxWidth: '200px',
  color: vars.color.textSecondary,
  backgroundColor: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  flexShrink: 0,
  userSelect: 'none',
  transition: `background-color ${vars.animation.fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
    '&[data-selected]': {
      backgroundColor: vars.color.bgTertiary,
      color: vars.color.textPrimary,
      borderBottom: `2px solid ${vars.color.accent}`,
    },
  },
});

export const tabLabel = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: vars.fontSize.xs,
});

export const tabClose = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '14px',
  height: '14px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: vars.color.textSecondary,
  opacity: 0,
  flexShrink: 0,
  padding: 0,
  transition: `opacity ${vars.animation.fast}, color ${vars.animation.fast}`,
  selectors: {
    [`${tab}:hover &`]: {
      opacity: 1,
    },
    '&:hover': {
      color: vars.color.danger,
    },
  },
});

export const tabAdd = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  margin: 'auto 2px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  flexShrink: 0,
  transition: `background-color ${vars.animation.fast}, color ${vars.animation.fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

// ---------------------------------------------------------------------------
// Tab content area
// ---------------------------------------------------------------------------

export const tabContent = style({
  flex: 1,
  overflow: 'hidden',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
});

// ---------------------------------------------------------------------------
// Layout split container
// ---------------------------------------------------------------------------

export const layoutSplitHorizontal = style({
  display: 'flex',
  flexDirection: 'row',
  height: '100%',
  width: '100%',
  overflow: 'hidden',
});

export const layoutSplitVertical = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  overflow: 'hidden',
});

// ---------------------------------------------------------------------------
// Pane container
// ---------------------------------------------------------------------------

export const paneContainer = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
  minWidth: '100px',
  minHeight: '80px',
  height: '100%',
  position: 'relative',
  outline: '1px solid transparent',
  transition: `outline-color ${vars.animation.fast}`,
});

export const paneContainerActive = style({
  outlineColor: vars.color.accentMuted,
});

export const paneHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  height: '24px',
  flexShrink: 0,
  backgroundColor: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
  paddingInline: vars.space.xs,
  gap: vars.space.xs,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  userSelect: 'none',
});

export const paneHeaderTitle = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const paneHeaderActions = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '2px',
});

export const paneHeaderButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: vars.color.textSecondary,
  padding: 0,
  transition: `background-color ${vars.animation.fast}, color ${vars.animation.fast}`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
});

export const paneContent = style({
  flex: 1,
  overflow: 'hidden',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
});

// ---------------------------------------------------------------------------
// Floating header overlay (hover-reveal, replaces the always-visible paneHeader)
// ---------------------------------------------------------------------------

export const paneHeaderFloat = style({
  position: 'absolute',
  top: vars.space.xs,
  right: vars.space.xs,
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  backgroundColor: `color-mix(in srgb, ${vars.color.bgSecondary} 85%, transparent)`,
  backdropFilter: 'blur(4px)',
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease`,
  pointerEvents: 'none',
});

globalStyle(`${paneContainer}:hover ${paneHeaderFloat}`, {
  opacity: 1,
  pointerEvents: 'auto',
});

// ---------------------------------------------------------------------------
// Resize handle
// ---------------------------------------------------------------------------

export const resizeHandleHorizontal = style({
  width: '4px',
  flexShrink: 0,
  cursor: 'col-resize',
  backgroundColor: vars.color.border,
  transition: `background-color ${vars.animation.fast}`,
  position: 'relative',
  zIndex: 10,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.accent,
    },
  },
});

export const resizeHandleVertical = style({
  height: '4px',
  flexShrink: 0,
  cursor: 'row-resize',
  backgroundColor: vars.color.border,
  transition: `background-color ${vars.animation.fast}`,
  position: 'relative',
  zIndex: 10,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.accent,
    },
  },
});

export const resizeHandleActive = style({
  backgroundColor: vars.color.accent,
});

// ── PaneContainer skeleton line size variants ─────────────────────────────────

export const skeletonLineShort = style({
  height: '12px',
  width: '70%',
});

export const skeletonLineShorter = style({
  height: '12px',
  width: '55%',
});
