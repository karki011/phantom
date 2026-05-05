// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const gaugeContainer = style({
  position: 'relative',
  width: '100%',
  flexShrink: 0,
});

export const gauge = style({
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

export const gaugeFill = style({
  height: '100%',
  transition: 'width 300ms ease, background 300ms ease',
});

export const gaugeLabel = style({
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
    [`${gauge}:hover &`]: { opacity: 1 },
  },
});

export const warningBanner = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  fontSize: '11px',
  fontFamily: vars.font.mono,
  color: vars.color.warning,
  background: vars.color.warningMuted,
  borderBottom: `1px solid ${vars.color.border}`,
});

export const warningBannerCritical = style({
  color: vars.color.danger,
  background: vars.color.dangerMuted,
});
