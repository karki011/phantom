// Phantom — Sidebar styles (Vanilla Extract)
// Author: Subash Karki

import { globalStyle, style, styleVariants, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

export const sidebar = style({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: vars.color.bgSecondary,
  borderRight: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
  position: 'relative',
  flexShrink: 0,
  height: '100%',
  transition: `width ${vars.animation.fast} ease`,
});

export const sidebarCollapsed = style({
  width: '0 !important',
  overflow: 'hidden',
  borderRight: 'none',
});

export const searchWrapper = style({
  padding: vars.space.sm,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
  position: 'sticky',
  top: 0,
  backgroundColor: vars.color.bgSecondary,
  zIndex: 1,
});

export const searchInput = style({
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  transition: `border-color ${vars.animation.fast} ease`,
  selectors: {
    '&:focus-within': {
      borderColor: vars.color.borderFocus,
    },
  },
});

export const searchInputField = style({
  width: '100%',
  height:'40px',
  background: 'transparent',
  border: 'none',
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  outline: 'none',
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const projectList = style({
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  flex: 1,
});

export const projectSection = style({
  borderBottom: `1px solid ${vars.color.divider}`,
  paddingTop: vars.space.sm,
  paddingBottom: vars.space.md,
});

export const projectHeader = style({
  appearance: 'none',
  background: 'none',
  border: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  width: '100%',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  cursor: 'pointer',
  userSelect: 'none',
  borderRadius: vars.radius.sm,
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const projectIcon = style({
  color: vars.color.textSecondary,
  flexShrink: 0,
});

export const projectName = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 500,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const worktreeCount = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  padding: `1px 6px`,
  lineHeight: 1.4,
  flexShrink: 0,
});

const graphPulse = keyframes({
  '0%, 100%': { opacity: 0.3 },
  '50%': { opacity: 1 },
});

const graphIconBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  lineHeight: 0,
});

export const graphIconReady = style([graphIconBase, {
  color: vars.color.success,
}]);

export const graphIconIndexing = style([graphIconBase, {
  color: vars.color.warning,
  animation: `${graphPulse} 1.5s ease-in-out infinite`,
}]);

export const graphIconNone = style([graphIconBase, {
  color: vars.color.textDisabled,
  opacity: 0.3,
}]);

export const chevron = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
  transition: `transform ${vars.animation.fast} ease`,
  transform: 'rotate(0deg)',
  selectors: {
    '[data-expanded] &': {
      transform: 'rotate(90deg)',
    },
  },
});

export const worktreeList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  paddingLeft: vars.space.lg,
  marginLeft: vars.space.md,
  marginTop: vars.space.xs,
  borderLeft: `1px solid ${vars.color.divider}`,
});

export const worktreeItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.sm}`,
  cursor: 'pointer',
  borderRadius: vars.radius.sm,
  transition: `background ${vars.animation.fast} ease`,
  position: 'relative',
  ':hover': {
    backgroundColor: vars.color.bgHover,
  width: '100%',
  },
});

export const worktreeItemActive = style({
  backgroundColor: vars.color.bgActive,
  width: '100%',
});

export const worktreeIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
});

export const branchName = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// Compact dirty-file badge rendered after the branch name when the worktree
// has uncommitted changes. Hidden entirely when the working tree is clean
// (rendered conditionally in WorktreeItem). Format: `±N`.
export const dirtyBadge = style({
  fontSize: '10px',
  fontFamily: vars.font.mono,
  fontWeight: 600,
  color: vars.color.accent,
  backgroundColor: vars.color.accentMuted,
  padding: `0 ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  flexShrink: 0,
  lineHeight: '14px',
  letterSpacing: '0.02em',
  cursor: 'default',
});

export const sessionDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.success,
  flexShrink: 0,
  boxShadow: `0 0 4px ${vars.color.success}`,
});

// Live-state semantics for the session dot. The DB `status` stays narrow
// (`active|completed|paused`); this `data-live-state` attribute is derived
// in the collector and emitted on `session:update` events.
const liveStateBreathe = keyframes({
  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
  '50%': { opacity: 0.55, transform: 'scale(0.85)' },
});

globalStyle(`${sessionDot}[data-live-state="running"]`, {
  backgroundColor: vars.color.success,
  boxShadow: `0 0 4px ${vars.color.success}`,
  animation: `${liveStateBreathe} 1.4s ease-in-out infinite`,
});

globalStyle(`${sessionDot}[data-live-state="waiting"]`, {
  backgroundColor: vars.color.warning,
  boxShadow: `0 0 4px ${vars.color.warning}`,
  animation: 'none',
});

globalStyle(`${sessionDot}[data-live-state="idle"]`, {
  backgroundColor: vars.color.textDisabled,
  boxShadow: 'none',
  animation: 'none',
});

globalStyle(`${sessionDot}[data-live-state="error"]`, {
  backgroundColor: vars.color.danger,
  boxShadow: `0 0 4px ${vars.color.danger}`,
  animation: 'none',
});

export const inlineInput = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  marginLeft: vars.space.md,
});

export const inlineInputField = style({
  flex: 1,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.borderFocus}`,
  borderRadius: vars.radius.sm,
});

globalStyle(`${inlineInputField} input`, {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  outline: 'none',
});

globalStyle(`${inlineInputField} input::placeholder`, {
  color: vars.color.textDisabled,
});

export const actions = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderTop: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const actionButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  padding: `${vars.space.xs} ${vars.space.md}`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
    borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.borderFocus}`,
    outlineOffset: '1px',
  },
});

export const actionButtonCompact = style({
  padding: vars.space.sm,
  minWidth: '30px',
  minHeight: '30px',
});

export const projectAddButton = style({
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: vars.radius.sm,
  color: vars.color.textDisabled,
  padding: `2px ${vars.space.xs}`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  flexShrink: 0,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const starButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px',
  borderRadius: vars.radius.sm,
  color: vars.color.textDisabled,
  transition: `all ${vars.animation.fast} ease`,
  flexShrink: 0,
  selectors: {
    '&:hover': {
      color: vars.color.warning,
    },
  },
});

export const starButtonActive = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px',
  borderRadius: vars.radius.sm,
  color: vars.color.warning,
  transition: `all ${vars.animation.fast} ease`,
  flexShrink: 0,
  selectors: {
    '&:hover': {
      color: vars.color.textSecondary,
    },
  },
});

export const resizeHandle = style({
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  width: '4px',
  cursor: 'col-resize',
  backgroundColor: 'transparent',
  transition: `background ${vars.animation.fast} ease`,
  zIndex: 10,
  ':hover': {
    backgroundColor: vars.color.accent,
    opacity: 0.4,
  },
});

export const contextMenuContent = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.xs} 0`,
  boxShadow: vars.shadow.md,
  minWidth: '160px',
  zIndex: 100,
  outline: 'none',
});

export const contextMenuItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  outline: 'none',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
  ':focus-visible': {
    backgroundColor: vars.color.bgHover,
  },
});

export const contextMenuItemDanger = style({
  color: vars.color.danger,
  ':hover': {
    backgroundColor: vars.color.dangerMuted,
  },
});

export const contextMenuSeparator = style({
  height: '1px',
  backgroundColor: vars.color.divider,
  margin: `${vars.space.xs} 0`,
});

export const deleteWarningText = style({
  margin: 0,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  lineHeight: '1.6',
});

export const deleteWarningCount = style({
  color: vars.color.warning,
  fontWeight: 600,
});
