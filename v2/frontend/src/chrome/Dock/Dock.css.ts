// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const dock = style({
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  width: '100%',
  height: '64px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.sm,
  background: `color-mix(in srgb, ${vars.color.bgPrimary} 90%, transparent)`,
  backdropFilter: 'blur(16px)',
  borderTop: `1px solid ${vars.color.border}`,
  zIndex: 100,
  paddingLeft: vars.space.lg,
  paddingRight: vars.space.lg,
});

export const dockButton = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
  width: '64px',
  height: '52px',
  borderRadius: vars.radius.md,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  transition: `all ${vars.animation.fast}`,
  color: vars.color.textSecondary,
  fontSize: '18px',
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const dockButtonActive = style({
  background: vars.color.bgActive,
  color: vars.color.accent,
  boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
});

export const dockLabel = style({
  fontFamily: vars.font.mono,
  fontSize: '9px',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
});

export const dockIcon = style({
  fontSize: '20px',
  lineHeight: 1,
});
