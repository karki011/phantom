// PhantomOS v2 — Right sidebar styles (Vanilla Extract)
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from './theme.css';
import { buttonRecipe } from './recipes.css';

// ── Container ─────────────────────────────────────────────────────────────────

export const rightSidebar = style({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: vars.color.bgSecondary,
  borderLeft: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
  position: 'relative',
  flexShrink: 0,
  height: '100%',
  transition: `width ${vars.animation.fast} ease`,
});

// ── Tab list ─────────────────────────────────────────────────────────────────

export const tabList = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  height: '32px',
  flexShrink: 0,
  backgroundColor: vars.color.bgSecondary,
  borderBottom: `1px solid ${vars.color.border}`,
  paddingLeft: vars.space.xs,
  gap: '2px',
});

export const tab = style({
  display: 'flex',
  alignItems: 'center',
  paddingLeft: vars.space.sm,
  paddingRight: vars.space.sm,
  fontSize: vars.fontSize.xs,
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

export const tabActive = style([
  tab,
  {
    color: vars.color.accent,
    borderBottomColor: vars.color.accent,
    ':hover': {
      color: vars.color.accent,
      borderBottomColor: vars.color.accent,
    },
  },
]);

export const tabPanel = style({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
});

// ── File tree ─────────────────────────────────────────────────────────────────

export const fileTree = style({
  display: 'flex',
  flexDirection: 'column',
  padding: vars.space.xs,
});

export const fileItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  transition: `background ${vars.animation.fast} ease`,
  userSelect: 'none',
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const fileItemDir = style({
  fontWeight: 500,
});

export const fileItemSelected = style({
  backgroundColor: vars.color.bgActive,
});

export const fileIcon = style({
  width: '14px',
  height: '14px',
  flexShrink: 0,
  color: vars.color.textDisabled,
});

export const fileName = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// ── Git status badges ─────────────────────────────────────────────────────────

export const gitBadge = style({
  fontSize: vars.fontSize.xs,
  width: '16px',
  height: '16px',
  borderRadius: vars.radius.full,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  lineHeight: 1,
});

export const gitBadgeM = style([
  gitBadge,
  { color: vars.color.warning },
]);

export const gitBadgeA = style([
  gitBadge,
  { color: vars.color.success },
]);

export const gitBadgeD = style([
  gitBadge,
  { color: vars.color.danger },
]);

export const gitBadgeQ = style([
  gitBadge,
  { color: vars.color.textDisabled },
]);

// ── Changes view ──────────────────────────────────────────────────────────────

export const changesSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  marginBottom: vars.space.sm,
});

export const changesSectionHeader = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  fontWeight: 600,
  userSelect: 'none',
  flexShrink: 0,
});

export const changeItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  borderRadius: vars.radius.sm,
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const changeCheckbox = style({
  width: '13px',
  height: '13px',
  flexShrink: 0,
  accentColor: vars.color.accent,
  cursor: 'pointer',
});

export const changeFilePath = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// ── Commit area ───────────────────────────────────────────────────────────────

export const commitArea = style({
  padding: vars.space.sm,
  borderTop: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  flexShrink: 0,
});

export const commitInput = style({
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  padding: vars.space.sm,
  outline: 'none',
  resize: 'none',
  minHeight: '60px',
  transition: `border-color ${vars.animation.fast} ease`,
  ':focus': {
    borderColor: vars.color.borderFocus,
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const commitActions = style({
  display: 'flex',
  gap: vars.space.xs,
});

export const commitButton = buttonRecipe({ variant: 'primary', size: 'sm' });

export const aiButton = buttonRecipe({ variant: 'ghost', size: 'sm' });

// ── Activity view ─────────────────────────────────────────────────────────────

export const activityList = style({
  display: 'flex',
  flexDirection: 'column',
});

export const activityItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const commitHash = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
  cursor: 'pointer',
  ':hover': {
    textDecoration: 'underline',
  },
});

export const commitMsg = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const commitMeta = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const activityEmpty = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.xl,
  gap: vars.space.sm,
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});

export const loadButton = buttonRecipe({ variant: 'ghost', size: 'sm' });

// ── Resize handle (left edge) ─────────────────────────────────────────────────

export const resizeHandle = style({
  position: 'absolute',
  left: 0,
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

// ── Empty state ───────────────────────────────────────────────────────────────

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  padding: vars.space.lg,
  gap: vars.space.sm,
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  textAlign: 'center',
  userSelect: 'none',
});
