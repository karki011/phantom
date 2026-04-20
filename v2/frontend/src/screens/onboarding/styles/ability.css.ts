// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

export const abilityList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
  width: '100%',
  padding: `0 ${vars.space.md}`,
});

export const abilityCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: 'transparent',
  border: `1px solid transparent`,
  opacity: 0,
  transform: 'translateY(12px)',
  transition: `all ${vars.animation.normal} ease-out`,
  selectors: {
    '&:last-child': {
      marginBottom: vars.space.sm,
    },
  },
});

export const abilityCardVisible = style({
  opacity: 1,
  transform: 'translateY(0)',
});

export const abilityIcon = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xl,
  color: vars.color.accent,
  width: '40px',
  textAlign: 'center',
  flexShrink: 0,
});

export const abilityInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const abilityName = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.md,
  color: vars.color.textPrimary,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
});

export const abilityDesc = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
});
