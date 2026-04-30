// Phantom — System Cockpit layout styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const cockpitContainer = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: vars.space.md,
  padding: vars.space.md,
  overflow: 'hidden',
  animation: `${fadeIn} 400ms ease-out both`,
});

export const cockpitGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: '1fr 1fr',
  gap: vars.space.md,
  width: '100%',
  flex: 1,
  minHeight: 0,
});

export const gridCell = style({
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  backgroundColor: vars.color.bgSecondary,
  overflowY: 'auto',
  minHeight: 0,
});

export const cockpitHeader = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const cockpitHeaderRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: vars.space.md,
});

export const cockpitIcon = style({
  color: vars.color.accent,
  filter: `drop-shadow(0 0 12px ${vars.color.accentGlow})`,
  flexShrink: 0,
});

export const cockpitTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.lg,
  color: vars.color.textPrimary,
  fontWeight: 700,
  margin: 0,
});

export const cockpitBadge = style({
  color: vars.color.accent,
  backgroundColor: vars.color.accentMuted,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  letterSpacing: '0.05em',
  fontWeight: 600,
  textTransform: 'uppercase',
});

export const cockpitSubtitle = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  lineHeight: 1.5,
  margin: 0,
});

