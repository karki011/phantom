// Author: Subash Karki
// Phantom — ComposerDiffCard styling (inline Monaco DiffEditor for edit cards)

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

const pendingGlow = keyframes({
  '0%': { borderColor: vars.color.border },
  '50%': { borderColor: vars.color.accent },
  '100%': { borderColor: vars.color.border },
});

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export const diffCardContainer = style({
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
  background: vars.color.bgSecondary,
  marginBottom: vars.space.xs,
});

export const diffCardPending = style({
  animation: `${pendingGlow} 2s ease-in-out infinite`,
});

export const diffCardDecidedAccepted = style({
  opacity: 0.6,
  borderColor: vars.color.successMuted,
});

export const diffCardDecidedDiscarded = style({
  opacity: 0.4,
  borderColor: vars.color.dangerMuted,
});

// ---------------------------------------------------------------------------
// Header bar
// ---------------------------------------------------------------------------

export const diffCardHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  borderBottom: `1px solid ${vars.color.border}`,
  minHeight: '32px',
});

export const diffCardFileIcon = style({
  color: vars.color.accent,
  flexShrink: 0,
});

export const diffCardFilePath = style({
  flex: 1,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  ':hover': {
    textDecoration: 'underline',
  },
});

export const diffCardStats = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  flexShrink: 0,
  display: 'flex',
  gap: '4px',
});

export const diffStatsAdded = style({ color: vars.color.success });
export const diffStatsRemoved = style({ color: vars.color.danger });

// ---------------------------------------------------------------------------
// Action buttons
// ---------------------------------------------------------------------------

const buttonBase = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  padding: '2px 8px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  lineHeight: '20px',
  transition: 'all 150ms ease',
  flexShrink: 0,
  ':hover': {
    borderColor: vars.color.borderHover,
    color: vars.color.textPrimary,
    background: `color-mix(in srgb, ${vars.color.textPrimary} 5%, transparent)`,
  },
});

export const diffCardAcceptBtn = style([buttonBase, {
  borderColor: vars.color.successMuted,
  color: vars.color.success,
  background: `color-mix(in srgb, ${vars.color.success} 10%, transparent)`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.success} 20%, transparent)`,
    borderColor: vars.color.success,
    color: vars.color.success,
  },
}]);

export const diffCardDiscardBtn = style([buttonBase, {
  borderColor: vars.color.dangerMuted,
  color: vars.color.danger,
  background: `color-mix(in srgb, ${vars.color.danger} 8%, transparent)`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.danger} 18%, transparent)`,
    borderColor: vars.color.danger,
    color: vars.color.danger,
  },
}]);

export const diffCardToggleBtn = style([buttonBase, {}]);

export const diffCardExpandBtn = style([buttonBase, {
  padding: '2px 6px',
}]);

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

export const appliedBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.success,
  flexShrink: 0,
});

export const discardedBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.danger,
  flexShrink: 0,
});

// ---------------------------------------------------------------------------
// Monaco DiffEditor container
// ---------------------------------------------------------------------------

export const diffCardEditor = style({
  position: 'relative',
  minHeight: '60px',
  maxHeight: '400px',
  overflow: 'hidden',
});

export const diffCardEditorCollapsed = style({
  height: 0,
  minHeight: 0,
  maxHeight: 0,
  overflow: 'hidden',
});

export const diffCardLoading = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '60px',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});
