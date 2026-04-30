// Phantom — Right sidebar styles (Vanilla Extract)
// Author: Subash Karki

import { globalStyle, style, keyframes } from '@vanilla-extract/css';
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

export const tabsRoot = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
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
  selectors: {
    '&:hover': {
      color: vars.color.textPrimary,
      borderBottomColor: vars.color.accentMuted,
    },
    '&[data-selected]': {
      color: vars.color.accent,
      borderBottomColor: vars.color.accent,
    },
    '&[data-selected]:hover': {
      color: vars.color.accent,
      borderBottomColor: vars.color.accent,
    },
  },
});

export const tabBadge = style({
  fontSize: vars.fontSize.xs,
  lineHeight: '16px',
  minWidth: '16px',
  padding: '0 4px',
  borderRadius: vars.radius.full,
  backgroundColor: 'rgba(255,255,255,0.08)',
  color: vars.color.textSecondary,
  textAlign: 'center',
  marginLeft: '4px',
});

export const tabBadgeChanges = style([tabBadge, {
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
}]);

export const tabPanel = style({
  flex: 1,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
});

// ── File search ──────────────────────────────────────────────────────────────

export const fileSearchWrapper = style({
  padding: vars.space.sm,
  borderBottom: `1px solid ${vars.color.divider}`,
  flexShrink: 0,
});

export const fileSearchInput = style({
  display: 'flex',
  alignItems: 'center',
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

export const fileSearchIcon = style({
  flexShrink: 0,
  color: vars.color.textDisabled,
  marginLeft: vars.space.sm,
});

globalStyle(`${fileSearchInput} input`, {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  outline: 'none',
});

globalStyle(`${fileSearchInput} input::placeholder`, {
  color: vars.color.textDisabled,
});

export const fileSearchClear = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: '20px',
  height: '20px',
  marginRight: '4px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const searchResultPath = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginLeft: '2px',
});

// ── File tree ─────────────────────────────────────────────────────────────────

export const fileTree = style({
  display: 'flex',
  flexDirection: 'column',
  padding: vars.space.sm,
  gap: '1px',
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
  scrollbarWidth: 'thin',
  scrollbarColor: `${vars.color.border} transparent`,
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

export const fileItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `4px ${vars.space.sm}`,
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
  background: 'transparent',
  border: 'none',
  outline: 'none',
  width: '100%',
  textAlign: 'left',
  appearance: 'none',
  WebkitAppearance: 'none',
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

export const fileChevron = style({
  width: '12px',
  height: '12px',
  flexShrink: 0,
  color: vars.color.textDisabled,
  transition: `transform ${vars.animation.fast} ease`,
  transform: 'rotate(0deg)',
  selectors: {
    '[data-expanded] &': {
      transform: 'rotate(90deg)',
    },
  },
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

export const fileItemIgnored = style({
  opacity: 0.35,
});

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
  transition: `border-color ${vars.animation.fast} ease`,
  selectors: {
    '&:focus-within': {
      borderColor: vars.color.borderFocus,
    },
  },
});

globalStyle(`${commitInput} textarea`, {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  padding: vars.space.sm,
  outline: 'none',
  resize: 'none',
  minHeight: '60px',
  boxSizing: 'border-box',
});

globalStyle(`${commitInput} textarea::placeholder`, {
  color: vars.color.textDisabled,
});

export const commitActions = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
});

export const commitButton = buttonRecipe({ variant: 'ghost', size: 'sm' });

export const aiButton = buttonRecipe({ variant: 'primary', size: 'sm' });

const aiPulse = keyframes({
  '0%, 100%': { opacity: 1, boxShadow: `0 0 8px ${vars.color.accentMuted}` },
  '50%': { opacity: 0.7, boxShadow: `0 0 20px ${vars.color.accentMuted}` },
});

export const aiButtonGenerating = style({
  animation: `${aiPulse} 1.5s ease-in-out infinite`,
});

// ── Changes header bar ────────────────────────────────────────────────────────

export const changesHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const changesHeaderButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '3px',
  padding: '3px 6px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const changesHeaderButtonActive = style([changesHeaderButton, {
  color: vars.color.accent,
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
}]);

export const branchLabel = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  maxWidth: '120px',
});

export const branchName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const changesHeaderBadge = style({
  fontSize: vars.fontSize.xs,
  padding: '0 4px',
  borderRadius: vars.radius.full,
  backgroundColor: 'rgba(255,255,255,0.08)',
  color: vars.color.textSecondary,
  lineHeight: '16px',
  minWidth: '16px',
  textAlign: 'center',
});

const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

export const spinning = style({
  animation: `${spin} 0.8s linear infinite`,
});

// ── Section headers ───────────────────────────────────────────────────────────

export const sectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.sm}`,
  cursor: 'pointer',
  userSelect: 'none',
  border: 'none',
  background: 'transparent',
  width: '100%',
  textAlign: 'left',
  appearance: 'none',
});

export const sectionLabel = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  flex: 1,
});

export const sectionLabelStaged = style([sectionLabel, { color: '#22c55e' }]);
export const sectionLabelChanges = style([sectionLabel, { color: '#f59e0b' }]);

export const sectionActions = style({
  display: 'flex',
  gap: '2px',
  marginLeft: 'auto',
});

export const sectionActionButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '22px',
  height: '22px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

// ── File rows ─────────────────────────────────────────────────────────────────

export const fileRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `4px ${vars.space.sm} 4px ${vars.space.lg}`,
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

export const fileRowName = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const fileRowDir = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  maxWidth: '80px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const fileRowActions = style({
  display: 'flex',
  gap: '2px',
  opacity: 0.5,
  transition: `opacity ${vars.animation.fast} ease`,
  selectors: {
    [`${fileRow}:hover &`]: {
      opacity: 1,
    },
  },
});

export const fileActionButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const fileActionStage = style([fileActionButton, {
  color: '#22c55e',
  ':hover': { backgroundColor: 'rgba(34,197,94,0.15)' },
}]);

export const fileActionUnstage = style([fileActionButton, {
  color: '#ef4444',
  ':hover': { backgroundColor: 'rgba(239,68,68,0.15)' },
}]);

export const fileActionDiscard = style([fileActionButton, {
  color: '#ef4444',
  ':hover': { backgroundColor: 'rgba(239,68,68,0.15)' },
}]);

// ── File status icons ─────────────────────────────────────────────────────────

export const statusIconM = style({ color: '#f59e0b', flexShrink: 0 });
export const statusIconA = style({ color: '#22c55e', flexShrink: 0 });
export const statusIconD = style({ color: '#ef4444', flexShrink: 0 });
export const statusIconQ = style({ color: vars.color.textDisabled, flexShrink: 0 });

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

// ── Context menu ─────────────────────────────────────────────────────────────

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

// ── Commits section ───────────────────────────────────────────────────────────

export const commitsSection = style({
  padding: '10px 12px',
});

export const commitsSectionHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  marginBottom: '10px',
});

export const commitsToggle = style({
  marginLeft: 'auto',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '2px',
});

export const commitsToggleItem = style({
  fontSize: '0.58rem',
  fontWeight: 600,
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
});

export const commitsToggleItemActive = style([commitsToggleItem, {
  color: vars.color.accent,
}]);

export const commitsToggleItemInactive = style([commitsToggleItem, {
  color: vars.color.textDisabled,
}]);

export const commitsList = style({
  maxHeight: '280px',
  overflowY: 'auto',
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

export const commitRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 8px',
  borderRadius: '3px',
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const commitHash = style({
  fontFamily: vars.font.mono,
  fontSize: '0.65rem',
  color: vars.color.accent,
  flexShrink: 0,
});

export const commitMessage = style({
  fontSize: '0.7rem',
  color: vars.color.textPrimary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flex: 1,
  minWidth: 0,
});

export const commitTime = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

export const commitsSectionLabel = style({
  fontSize: '0.65rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: vars.color.textSecondary,
  flex: 1,
});

export const commitsToggleSeparator = style({
  fontSize: '0.58rem',
  color: vars.color.textDisabled,
  opacity: 0.4,
  userSelect: 'none',
});

export const commitsEmptyLabel = style({
  display: 'block',
  fontSize: '0.73rem',
  color: vars.color.textDisabled,
  padding: '4px 8px',
});

// ── PR Section ────────────────────────────────────────────────────────────────

export const prSection = style({
  padding: '10px 12px',
});

export const prSectionHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: vars.color.textDisabled,
  marginBottom: '10px',
});

export const prCard = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: '10px 12px',
});

export const prStateDot = style({
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
  display: 'inline-block',
});

export const prTitleRow = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '4px',
  cursor: 'pointer',
  marginBottom: '4px',
  color: vars.color.textPrimary,
  ':hover': {
    textDecoration: 'underline',
  },
});

export const prBranchInfo = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginTop: '2px',
});

export const createPrButton = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  width: '100%',
  padding: '5px 0',
  borderRadius: vars.radius.md,
  border: 'none',
  backgroundColor: vars.color.accent,
  color: vars.color.textInverse,
  fontSize: '0.73rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.accentHover,
  },
});

export const prCreatingRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.73rem',
  color: vars.color.textSecondary,
  padding: '4px 0',
});

// ── Empty state ───────────────────────────────────────────────────────────

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

// ── CI Section ────────────────────────────────────────────────────────────────

export const ciSection = style({
  padding: '10px 12px',
});

export const ciSectionHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  marginBottom: '10px',
  color: vars.color.textSecondary,
});

export const ciRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 8px',
  borderRadius: '3px',
  cursor: 'pointer',
  height: '30px',
  boxSizing: 'border-box',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const ciRowChild = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  borderRadius: '3px',
  cursor: 'pointer',
  height: '24px',
  boxSizing: 'border-box',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const ciGroupIndent = style({
  paddingLeft: '14px',
});

export const ciChevron = style({
  color: vars.color.textDisabled,
  flexShrink: 0,
  transition: 'transform 120ms ease',
});

export const ciChevronExpanded = style({
  transform: 'rotate(90deg)',
});

export const ciStatusLabel = style({
  fontSize: '0.58rem',
  color: vars.color.textDisabled,
  flexShrink: 0,
  whiteSpace: 'nowrap',
});

export const ciName = style({
  fontSize: '0.68rem',
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const ciNameChild = style({
  fontSize: '0.63rem',
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const ciSpinner = style({
  animation: `${spin} 1s linear infinite`,
});

// ── Activity divider ──────────────────────────────────────────────────────────

export const activityDivider = style({
  height: '1px',
  background: vars.color.divider,
  margin: '8px 12px',
});

// ── Activity skeleton ─────────────────────────────────────────────────────────

const skeletonPulseKf = keyframes({
  '0%': { opacity: 0.4 },
  '50%': { opacity: 1.0 },
  '100%': { opacity: 0.4 },
});

export const activitySkeleton = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  padding: '8px 12px',
});

export const skeletonBar = style({
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
});

export const skeletonPulse = style({
  animation: `${skeletonPulseKf} 1.5s ease infinite`,
});

// ── Activity tab dot indicator ────────────────────────────────────────────────

export const activityDot = style({
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
  flexShrink: 0,
  marginLeft: '4px',
});

const dotPulseKf = keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.3 },
  '100%': { opacity: 1 },
});

export const activityDotPulse = style({
  animation: `${dotPulseKf} 1.2s ease infinite`,
});

// ── CiSection additions ───────────────────────────────────────────────────────

export const ciSectionTitle = style({
  fontSize: '0.6rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'inherit',
  flex: 1,
});

export const ciNameBold = style({
  fontWeight: 500,
});

export const ciEmptyState = style({
  padding: '4px 8px',
});

// ── ChangesView additions ─────────────────────────────────────────────────────

export const statusIconR = style({
  color: vars.color.info,
  flexShrink: 0,
});

export const emptyStateHint = style({
  fontSize: '10px',
  opacity: 0.6,
});

export const fileListContainer = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
  minHeight: 0,
});

export const headerActions = style({
  marginLeft: 'auto',
  display: 'flex',
  gap: '2px',
});

export const scrollArea = style({
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
});

export const chevronIcon = style({
  flexShrink: 0,
  color: vars.color.textDisabled,
});

export const commitAreaPinned = style({
  marginTop: 'auto',
});

// ── PrSection additions ───────────────────────────────────────────────────────

export const prCreatingText = style({
  color: 'inherit',
  fontSize: '0.73rem',
});

export const prStateBadgeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '4px',
});

export const prStateLabel = style({
  fontSize: '0.65rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
});

export const prTitle = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '0.73rem',
});

export const prNumber = style({
  fontSize: '0.68rem',
  color: 'inherit',
  opacity: 0.5,
  flexShrink: 0,
});

export const prExternalLink = style({
  flexShrink: 0,
  opacity: 0.5,
});

export const prEmptyText = style({
  fontSize: '0.73rem',
  color: 'inherit',
  opacity: 0.4,
  marginBottom: '6px',
});

// ── RightSidebar activity dot colors ─────────────────────────────────────────

export const statusDotActive = style({
  backgroundColor: vars.color.success,
});

export const statusDotDefault = style({
  backgroundColor: vars.color.accent,
});

// ── FilesView rename input ────────────────────────────────────────────────────

export const renameInput = style({
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.borderFocus}`,
  color: 'inherit',
  fontSize: vars.fontSize.xs,
  padding: '1px 4px',
  borderRadius: vars.radius.sm,
  outline: 'none',
  flex: '1',
  minWidth: 0,
});

export const fileItemPadded = style({
  paddingLeft: vars.space.sm,
});

// ── GitActivityPanel layout ───────────────────────────────────────────────────

export const gitActivityPanel = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
});

export const gitActivityScroll = style({
  flex: 1,
  overflowY: 'auto',
});
