// Author: Subash Karki
import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const slideIn = keyframes({
  from: { transform: 'translateX(100%)', opacity: 0 },
  to: { transform: 'translateX(0)', opacity: 1 },
});

const spin = keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '100%': { transform: 'rotate(360deg)' },
});

// ── Panel container ─────────────────────────────────────────────────────

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  width: 280,
  flex: '0 0 280px',
  borderLeft: `1px solid ${vars.color.divider}`,
  background: vars.color.bgSecondary,
  overflow: 'hidden',
  animation: `${slideIn} 250ms ease-out`,
});

export const panelFading = style({
  opacity: 0.5,
  transition: 'opacity 2s ease',
});

// ── Header ──────────────────────────────────────────────────────────────

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
});

export const panelTitle = style({
  fontWeight: 600,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const panelCount = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  fontWeight: 600,
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  background: vars.color.accentMuted,
  color: vars.color.accent,
  lineHeight: 1,
});

export const panelActions = style({
  flex: 1,
  display: 'flex',
  justifyContent: 'flex-end',
  gap: vars.space.xs,
});

export const panelBtn = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: '2px',
  fontSize: vars.fontSize.xs,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

export const panelBtnActive = style({
  color: vars.color.accent,
  ':hover': {
    color: vars.color.accentHover,
  },
});

// ── Body / card list ────────────────────────────────────────────────────

export const panelBody = style({
  flex: 1,
  overflowY: 'auto',
  padding: vars.space.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const panelEmpty = style({
  padding: vars.space.lg,
  textAlign: 'center',
  fontStyle: 'italic',
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
});

// ── Agent card ──────────────────────────────────────────────────────────

export const agentCard = style({
  display: 'flex',
  flexDirection: 'column',
  padding: vars.space.sm,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  cursor: 'pointer',
  transition: `background 150ms ease, border-color 150ms ease`,
  ':hover': {
    background: vars.color.bgHover,
    borderColor: vars.color.borderHover,
  },
});

export const agentCardRunning = style({
  borderColor: vars.color.accent,
});

export const agentCardFailed = style({
  borderColor: vars.color.danger,
});

export const agentCardRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  minWidth: 0,
});

export const agentDescription = style({
  flex: 1,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
});

export const agentElapsed = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  flexShrink: 0,
});

// ── Status indicators ───────────────────────────────────────────────────

export const statusSpinner = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  height: 12,
  borderRadius: '50%',
  border: `1.5px solid ${vars.color.accent}`,
  borderTopColor: 'transparent',
  animation: `${spin} 0.8s linear infinite`,
  flexShrink: 0,
});

export const statusDone = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  height: 12,
  color: vars.color.success,
  flexShrink: 0,
});

export const statusFailed = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  height: 12,
  color: vars.color.danger,
  flexShrink: 0,
});

// ── Metadata row (model badge, tokens) ──────────────────────────────────

export const agentMeta = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  marginTop: '3px',
});

export const agentBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '9px',
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  background: vars.color.accentMuted,
  color: vars.color.accent,
  flexShrink: 0,
});

export const agentTokens = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  marginLeft: 'auto',
  flexShrink: 0,
});

// ── Expanded result ─────────────────────────────────────────────────────

export const agentResult = style({
  marginTop: vars.space.xs,
  padding: vars.space.sm,
  background: 'rgba(255, 255, 255, 0.03)',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  fontSize: '10px',
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 200,
  overflowY: 'auto',
  lineHeight: 1.5,
});

export const agentResultError = style({
  borderLeftColor: vars.color.danger,
  borderLeftWidth: 2,
  color: vars.color.danger,
});

// ── Toolbar toggle button badge ─────────────────────────────────────────

export const toggleBadge = style({
  position: 'absolute',
  top: -3,
  right: -3,
  minWidth: 14,
  height: 14,
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  color: vars.color.textInverse,
  fontSize: '9px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 3px',
  lineHeight: 1,
});
