// Author: Subash Karki
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  width: 320,
  flex: '0 0 320px',
  borderLeft: `1px solid ${vars.color.divider}`,
  background: vars.color.bgSecondary,
  overflow: 'hidden',
});

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
});

export const panelTitle = style({
  fontWeight: 600,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
});

export const panelSize = style({
  flex: 1,
  fontSize: '10px',
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  textAlign: 'right',
});

export const panelClose = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: '2px',
  fontSize: vars.fontSize.xs,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

export const panelBody = style({
  flex: 1,
  overflowY: 'auto',
  padding: vars.space.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const panelEmpty = style({
  padding: vars.space.lg,
  textAlign: 'center',
  fontStyle: 'italic',
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
});

export const memoryItem = style({
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
});

export const memoryItemHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const memoryItemName = style({
  flex: 1,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const memoryItemLevel = style({
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: vars.color.textDisabled,
});

export const memoryItemSize = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
});

export const memoryItemContent = style({
  padding: vars.space.sm,
  background: vars.color.bgTertiary,
  fontSize: '10px',
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 200,
  overflowY: 'auto',
  borderTop: `1px solid ${vars.color.border}`,
  margin: 0,
});
