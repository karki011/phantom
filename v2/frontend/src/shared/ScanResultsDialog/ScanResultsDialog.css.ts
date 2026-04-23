// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const loaderWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '160px',
});

export const selectionBar = style({
  display: 'flex',
  gap: vars.space.sm,
  alignItems: 'center',
});

export const repoList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  maxHeight: '480px',
  overflowY: 'auto',
  paddingRight: vars.space.xs,
});

export const repoItem = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgTertiary,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgHover,
    },
  },
});

export const checkboxRoot = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: vars.space.sm,
  width: '100%',
  cursor: 'pointer',
});

export const checkboxControl = style({
  width: '16px',
  height: '16px',
  minWidth: '16px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: '2px',
  transition: `all ${vars.animation.fast} ease`,
  selectors: {
    '[data-checked] &': {
      backgroundColor: vars.color.accent,
      borderColor: vars.color.accent,
    },
  },
});

export const checkboxIndicator = style({
  color: vars.color.textInverse,
  fontSize: vars.fontSize.xs,
  lineHeight: 1,
  fontWeight: 700,
});

export const repoLabel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
  minWidth: 0,
});

export const repoName = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const repoPath = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
