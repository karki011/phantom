// Author: Subash Karki
import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const widgetBar = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: '10px',
  color: vars.color.textDisabled,
  overflow: 'hidden',
  flexShrink: 0,
});

export const widget = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  padding: `1px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  whiteSpace: 'nowrap',
  transition: `color ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textSecondary,
  },
});

export const widget_default = style({});

export const widget_warning = style({
  color: vars.color.warning,
});

export const widget_danger = style({
  color: vars.color.danger,
});

export const widget_success = style({
  color: vars.color.success,
});

export const widgetLabel = style({
  fontFamily: vars.font.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
