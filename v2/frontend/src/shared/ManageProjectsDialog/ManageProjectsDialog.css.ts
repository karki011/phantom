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

export const projectList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  maxHeight: '480px',
  overflowY: 'auto',
  paddingRight: vars.space.xs,
});

export const projectItem = style({
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
      backgroundColor: vars.color.danger,
      borderColor: vars.color.danger,
    },
  },
});

export const checkboxIndicator = style({
  color: vars.color.textInverse,
  fontSize: '10px',
  lineHeight: 1,
  fontWeight: 700,
});

export const projectLabel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
  minWidth: 0,
});

export const projectName = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const projectPath = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const worktreeBadge = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  padding: `1px ${vars.space.xs}`,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  marginTop: '2px',
  alignSelf: 'flex-start',
});

export const dangerButton = style({
  backgroundColor: vars.color.danger,
  color: vars.color.textInverse,
  selectors: {
    '&:hover:not(:disabled)': {
      opacity: '0.9',
    },
    '&:disabled': {
      opacity: '0.4',
      cursor: 'not-allowed',
    },
  },
});
