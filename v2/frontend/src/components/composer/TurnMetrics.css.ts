// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

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
  marginTop: vars.space.xs,
});

export const metricsDot = style({
  color: vars.color.textDisabled,
});

export const costLabel = style({
  color: vars.color.accent,
  fontWeight: 600,
});
