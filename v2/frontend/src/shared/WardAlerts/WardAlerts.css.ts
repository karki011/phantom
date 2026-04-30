// Phantom — Ward alerts panel styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const alertsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: vars.space.sm,
  height: '100%',
  overflowY: 'auto',
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

export const alertsHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `0 ${vars.space.xs}`,
  marginBottom: vars.space.xs,
});

export const alertsTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
});

export const clearButton = style({
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.textSecondary,
    background: vars.color.bgHover,
  },
});

export const alertItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});

export const alertItemBlock = style({
  borderColor: `color-mix(in srgb, ${vars.color.danger} 40%, ${vars.color.border})`,
  background: `color-mix(in srgb, ${vars.color.danger} 4%, ${vars.color.bgPrimary})`,
});

export const alertItemWarn = style({
  borderColor: 'color-mix(in srgb, #f59e0b 40%, transparent)',
  background: 'color-mix(in srgb, #f59e0b 4%, transparent)',
});

export const alertItemConfirm = style({
  borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
  background: `color-mix(in srgb, ${vars.color.accent} 4%, ${vars.color.bgPrimary})`,
});

export const alertHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const alertLevel = style({
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontSize: '0.6rem',
});

export const levelBlock = style({ color: vars.color.danger });
export const levelWarn = style({ color: '#f59e0b' });
export const levelConfirm = style({ color: vars.color.accent });
export const levelLog = style({ color: vars.color.textDisabled });

export const alertRuleName = style({
  color: vars.color.textPrimary,
  fontWeight: 500,
});

export const alertTime = style({
  color: vars.color.textDisabled,
  marginLeft: 'auto',
  fontSize: '0.6rem',
});

export const alertMessage = style({
  color: vars.color.textSecondary,
  lineHeight: 1.4,
});

export const alertTool = style({
  color: vars.color.textDisabled,
  fontSize: '0.6rem',
});

export const emptyState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100px',
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});

export const approvalActions = style({
  display: 'flex',
  gap: vars.space.sm,
  marginTop: vars.space.md,
});

export const approveButton = style({
  flex: 1,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: 'none',
  background: vars.color.accent,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  cursor: 'pointer',
  ':hover': { opacity: '0.9' },
});

export const rejectButton = style({
  flex: 1,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.danger}`,
  background: 'transparent',
  color: vars.color.danger,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  cursor: 'pointer',
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.danger} 10%, transparent)`,
  },
});

export const approvalDetail = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.md,
  borderRadius: vars.radius.md,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
});

export const approvalLabel = style({
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: '0.6rem',
});

export const approvalValue = style({
  color: vars.color.textPrimary,
  wordBreak: 'break-all',
});

export const approvalStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});
