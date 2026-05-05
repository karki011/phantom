// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const bubble = style({
  maxWidth: '100%',
  wordBreak: 'break-word',
  boxSizing: 'border-box',
});

// ── User turn ──────────────────────────────────────────────────────────
// Matches V1 ComposerPane.css.ts `userTurn` — a plain line with a "YOU"
// badge pseudo-element.
export const userBubble = style({
  fontSize: 'inherit',
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
  lineHeight: 1.6,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const userLabel = style({
  display: 'inline-block',
  marginBottom: vars.space.xs,
  padding: '1px 6px',
  borderRadius: vars.radius.sm,
  background: vars.color.accentMuted,
  color: vars.color.accent,
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.05em',
});

// ── Assistant turn ─────────────────────────────────────────────────────
// Container for all assistant content blocks.  V1 `assistantText` class.
export const assistantBubble = style({
  fontSize: 'inherit',
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
  lineHeight: 1.6,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const assistantLabel = style({
  display: 'inline-block',
  marginBottom: vars.space.xs,
  padding: '1px 6px',
  borderRadius: vars.radius.sm,
  background: vars.color.successMuted,
  color: vars.color.success,
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.05em',
});

// ── System bubble (errors, etc.) ───────────────────────────────────────
export const systemBubble = style({
  background: vars.color.dangerMuted,
  padding: '8px 12px',
  borderRadius: vars.radius.sm,
  alignSelf: 'center',
  fontSize: '13px',
});

// ── Streaming indicator (bouncing dots) ────────────────────────────────
// Shown when the assistant turn is streaming but no content has arrived
// yet.  Matches V1 pendingPulse / pendingDot.

const pendingDotPulse = keyframes({
  '0%, 80%, 100%': { opacity: 0.25, transform: 'scale(0.85)' },
  '40%': { opacity: 1, transform: 'scale(1)' },
});

export const pendingPulse = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontStyle: 'italic',
});

export const pendingDot = style({
  width: 5,
  height: 5,
  borderRadius: '50%',
  background: vars.color.accent,
  display: 'inline-block',
  animation: `${pendingDotPulse} 1.2s ease-in-out infinite`,
  selectors: {
    '&:nth-child(2)': { animationDelay: '0.15s' },
    '&:nth-child(3)': { animationDelay: '0.3s' },
  },
});
