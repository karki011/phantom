// PhantomOS v2 — Session controls styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const controlsCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  padding: vars.space.lg,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, ${vars.color.border})`,
  fontFamily: vars.font.mono,
});

export const controlsHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const controlsTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 400,
});

export const controlsIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
});

export const controlsRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  flexWrap: 'wrap',
});

export const sessionName = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const sessionModel = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
});

export const statusBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
});

export const statusActive = style({
  backgroundColor: `color-mix(in srgb, ${vars.color.success} 15%, transparent)`,
  color: vars.color.success,
});

export const statusPaused = style({
  backgroundColor: 'rgba(245, 158, 11, 0.15)',
  color: '#f59e0b',
});

export const controlButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  borderRadius: vars.radius.sm,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  fontWeight: 500,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `all 150ms ease`,
  ':hover': {
    borderColor: vars.color.accent,
    color: vars.color.accent,
    background: `color-mix(in srgb, ${vars.color.accent} 8%, ${vars.color.bgSecondary})`,
  },
});

export const controlButtonDanger = style({
  ':hover': {
    borderColor: vars.color.danger,
    color: vars.color.danger,
    background: `color-mix(in srgb, ${vars.color.danger} 8%, ${vars.color.bgSecondary})`,
  },
});

export const policyGroup = style({
  display: 'inline-flex',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
});

export const policyOption = style({
  padding: '3px 8px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  background: 'transparent',
  color: vars.color.textDisabled,
  border: 'none',
  cursor: 'pointer',
  transition: `all 150ms ease`,
  borderRight: `1px solid ${vars.color.border}`,
  ':hover': {
    color: vars.color.textSecondary,
    background: vars.color.bgHover,
  },
  selectors: {
    '&:last-child': { borderRight: 'none' },
  },
});

export const policyOptionActive = style({
  background: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  color: vars.color.accent,
  fontWeight: 600,
});

export const controlsCardExternal = style({
  border: `1px solid color-mix(in srgb, ${vars.color.textDisabled} 25%, ${vars.color.border})`,
});

export const externalBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: '1px 6px',
  borderRadius: '4px',
  fontSize: '0.6rem',
  fontWeight: 600,
  fontFamily: vars.font.mono,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  backgroundColor: 'rgba(107, 114, 128, 0.15)',
  color: vars.color.textDisabled,
});

export const controlButtonAttach = style({
  borderColor: vars.color.accent,
  color: vars.color.accent,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 15%, ${vars.color.bgSecondary})`,
  },
});

export const wardBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '18px',
  height: '18px',
  padding: '0 4px',
  borderRadius: '9px',
  fontSize: '0.6rem',
  fontWeight: 700,
  fontFamily: vars.font.mono,
  backgroundColor: 'rgba(245, 158, 11, 0.2)',
  color: '#f59e0b',
  marginLeft: 'auto',
});
