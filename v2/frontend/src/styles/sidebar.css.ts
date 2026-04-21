// PhantomOS v2 — Sidebar styles (Vanilla Extract)
// Author: Subash Karki

import { style, styleVariants } from '@vanilla-extract/css';
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
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  outline: 'none',
  transition: `border-color ${vars.animation.fast} ease`,
  ':focus': {
    borderColor: vars.color.borderFocus,
  },
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

export const chevron = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
  transition: `transform ${vars.animation.fast} ease`,
  transform: 'rotate(0deg)',
});

export const chevronExpanded = style({
  transform: 'rotate(90deg)',
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
  },
});

export const worktreeItemActive = style({
  backgroundColor: vars.color.bgActive,
  borderLeft: `2px solid ${vars.color.accent}`,
  paddingLeft: `calc(${vars.space.sm} - 2px)`,
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

export const sessionDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.success,
  flexShrink: 0,
  boxShadow: `0 0 4px ${vars.color.success}`,
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
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  outline: 'none',
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const actions = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: vars.space.sm,
  borderTop: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const actionButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: vars.radius.sm,
  color: vars.color.textSecondary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.borderFocus}`,
    outlineOffset: '1px',
  },
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
