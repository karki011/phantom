// Author: Subash Karki
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const metricsSeparator = style({
  color: vars.color.textDisabled,
  margin: `0 ${vars.space.xs}`,
});

export const metricsGroup = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const metricsDot = style({
  color: vars.color.textDisabled,
});

export const sessionTotal = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontFamily: vars.font.mono,
  color: vars.color.accent,
  fontWeight: 600,
});

export const contextGauge = style({
  position: 'relative',
  height: 3,
  background: vars.color.bgTertiary,
  overflow: 'hidden',
  cursor: 'default',
  vars: {
    '--gauge-color-accent': vars.color.accent,
    '--gauge-color-warning': vars.color.warning,
    '--gauge-color-danger': vars.color.danger,
  },
});

export const contextGaugeFill = style({
  height: '100%',
  transition: 'width 300ms ease, background 300ms ease',
});

export const contextGaugeLabel = style({
  position: 'absolute',
  right: vars.space.sm,
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: '9px',
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  opacity: 0,
  transition: 'opacity 150ms ease',
  selectors: {
    [`${contextGauge}:hover &`]: { opacity: 1 },
  },
});

export const turnMetrics = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
});

export const turnLinesAdded = style({
  color: vars.color.success,
});

export const turnLinesRemoved = style({
  color: vars.color.danger,
});
