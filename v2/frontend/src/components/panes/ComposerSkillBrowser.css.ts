// Author: Subash Karki
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  width: 280,
  flex: '0 0 280px',
  borderLeft: `1px solid ${vars.color.divider}`,
  background: vars.color.bgSecondary,
  overflow: 'hidden',
});

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  color: vars.color.textPrimary,
  fontSize: vars.fontSize.xs,
});

export const panelTitle = style({
  fontWeight: 600,
  flex: 1,
});

export const panelCount = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
});

export const panelClose = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: '2px',
  fontSize: vars.fontSize.xs,
  ':hover': { color: vars.color.textPrimary },
});

export const searchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  color: vars.color.textDisabled,
});

export const searchInput = style({
  flex: 1,
  background: 'transparent',
  border: 'none',
  color: vars.color.textPrimary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.body,
  outline: 'none',
  '::placeholder': { color: vars.color.textDisabled },
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

export const skillCard = style({
  padding: vars.space.sm,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const skillName = style({
  fontFamily: vars.font.mono,
  fontWeight: 600,
  fontSize: vars.fontSize.xs,
  color: vars.color.accent,
});

export const skillDesc = style({
  fontSize: '10px',
  color: vars.color.textSecondary,
  lineHeight: '1.4',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export const skillInvoke = style({
  alignSelf: 'flex-start',
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  padding: '2px 8px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: '10px',
  fontFamily: vars.font.mono,
  ':hover': {
    borderColor: vars.color.accent,
    color: vars.color.accent,
  },
});
