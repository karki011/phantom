// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../../styles/theme.css';

export const featureList = style({
  display: 'flex',
  flexDirection: 'column',
});

export const titleRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const recommendedBadge = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  lineHeight: 1,
  color: vars.color.accent,
  background: vars.color.accentMuted,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: vars.radius.sm,
  padding: '2px 6px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

export const actionRow = style({
  display: 'flex',
  justifyContent: 'center',
  gap: vars.space.md,
  paddingTop: vars.space.md,
});
