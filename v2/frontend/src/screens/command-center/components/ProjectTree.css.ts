// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
});

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${vars.space.sm} ${vars.space.md}`,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': { background: vars.color.bgHover },
});

export const headerTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});

export const headerCount = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
});

export const list = style({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
});

export const projectItem = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  cursor: 'pointer',
  borderLeft: '3px solid transparent',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': { background: vars.color.bgHover },
});

export const projectItemSelected = style({
  background: vars.color.bgActive,
  borderLeftColor: vars.color.accent,
});

export const projectName = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const starIcon = style({
  color: vars.color.warning,
  fontSize: vars.fontSize.xs,
});

export const projectMeta = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  marginTop: '2px',
  paddingLeft: vars.space.sm,
});

export const expandedContent = style({
  paddingLeft: vars.space.lg,
  paddingBottom: vars.space.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const sectionLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textDisabled,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginTop: vars.space.xs,
});

export const worktreeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const worktreeRowSelected = style({
  background: vars.color.bgActive,
  color: vars.color.textPrimary,
});

export const worktreeStatusClean = style({ color: vars.color.success });
export const worktreeStatusDirty = style({ color: vars.color.warning });
export const worktreeStatusConflict = style({ color: vars.color.danger });

export const worktreeName = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const worktreeSessionCount = style({
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
  flexShrink: 0,
});
