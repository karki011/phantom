// PhantomOS v2 — StatusStrip styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const strip = style({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  width: '100%',
  height: '40px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: `color-mix(in srgb, ${vars.color.bgPrimary} 85%, transparent)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderBottom: `1px solid ${vars.color.border}`,
  paddingLeft: vars.space.lg,
  paddingRight: vars.space.lg,
  zIndex: 100,
});

export const brand = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.sm,
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.sm,
  color: vars.color.accent,
  letterSpacing: '2px',
  textTransform: 'uppercase',
});

export const metrics = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xl,
});

export const metric = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.xs,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const metricValue = style({
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const metricLabel = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
});

export const dot = style({
  display: 'inline-block',
  width: '6px',
  height: '6px',
  borderRadius: vars.radius.full,
});

export const dotActive = style({
  background: vars.color.success,
  boxShadow: `0 0 6px ${vars.color.success}`,
});

export const dotIdle = style({
  background: vars.color.textDisabled,
});
