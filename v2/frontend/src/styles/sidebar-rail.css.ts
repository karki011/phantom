// Phantom — Identity Rail styles (collapsed sidebar mode)
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from './theme.css';

const RAIL_WIDTH = '44px';

const railBase = {
  width: RAIL_WIDTH,
  flexShrink: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  backgroundColor: vars.color.bgSecondary,
  paddingTop: vars.space.sm,
  paddingBottom: vars.space.sm,
  gap: vars.space.xs,
  overflow: 'hidden',
  position: 'relative' as const,
};

export const leftRail = style({
  ...railBase,
  borderRight: `1px solid ${vars.color.border}`,
});

export const rightRail = style({
  ...railBase,
  borderLeft: `1px solid ${vars.color.border}`,
});

// ── Top section: identity (project glyph + branch chip) ─────────────────────

export const identityGroup = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  width: '100%',
});

export const projectGlyphButton = style({
  appearance: 'none',
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.md,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: `background ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
    borderColor: vars.color.borderHover,
  },
});

export const branchChipButton = style({
  appearance: 'none',
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textSecondary,
  width: '34px',
  padding: '2px 0',
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  textAlign: 'center',
  transition: `color ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    borderColor: vars.color.accent,
    backgroundColor: vars.color.bgHover,
  },
});

// ── Project glyph stack (favorite projects on left rail) ───────────────────

export const projectStack = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  width: '100%',
  // Allow scrolling if 10 starred glyphs don't fit on a short window.
  // Hide native scrollbar chrome for a clean rail.
  overflowY: 'auto',
  scrollbarWidth: 'none',
  selectors: {
    '&::-webkit-scrollbar': {
      display: 'none',
    },
  },
});

// Base glyph circle — used both as button (inactive, opens popover) and
// as a non-interactive marker (active, no-op).
export const projectGlyphCircle = style({
  position: 'relative',
  appearance: 'none',
  border: `1px solid color-mix(in srgb, ${vars.color.border} 60%, transparent)`,
  background: 'transparent',
  color: vars.color.textSecondary,
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.md,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: `background ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    backgroundColor: vars.color.bgHover,
    borderColor: vars.color.borderHover,
  },
});

export const projectGlyphActive = style({
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
  borderWidth: '1.5px',
  borderColor: vars.color.accent,
  color: vars.color.textPrimary,
  cursor: 'default',
  selectors: {
    '&:hover': {
      backgroundColor: `color-mix(in srgb, ${vars.color.accent} 18%, transparent)`,
      borderColor: vars.color.accent,
      color: vars.color.textPrimary,
    },
  },
});

// Small green dot bottom-right indicating an active session
export const projectGlyphLive = style({
  position: 'absolute',
  bottom: '-1px',
  right: '-1px',
  width: '8px',
  height: '8px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.success,
  border: `1.5px solid ${vars.color.bgSecondary}`,
});

// ── Rail chevron (expand toggle) ────────────────────────────────────────────

export const railChevron = style({
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  width: '24px',
  height: '24px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: `background ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    backgroundColor: vars.color.bgHover,
  },
});

// ── Divider ──────────────────────────────────────────────────────────────────

export const divider = style({
  width: '24px',
  height: '1px',
  backgroundColor: `color-mix(in srgb, ${vars.color.border} 30%, transparent)`,
  flexShrink: 0,
  margin: `${vars.space.xs} 0`,
});

// ── Tab/action icon buttons ─────────────────────────────────────────────────

export const iconButton = style({
  position: 'relative',
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  width: '32px',
  height: '32px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: `background ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    backgroundColor: vars.color.bgHover,
  },
});

export const iconButtonActive = style({
  color: vars.color.accent,
  borderLeft: `2px solid ${vars.color.accent}`,
  borderTopLeftRadius: 0,
  borderBottomLeftRadius: 0,
  selectors: {
    '&:hover': {
      color: vars.color.accent,
    },
  },
});

// ── Badge bubble (top-right corner of icon) ─────────────────────────────────

export const iconBadge = style({
  position: 'absolute',
  top: '-2px',
  right: '-2px',
  minWidth: '14px',
  height: '14px',
  padding: '0 3px',
  borderRadius: vars.radius.full,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  border: `1px solid ${vars.color.border}`,
  fontSize: '0.55rem',
  fontWeight: 700,
  lineHeight: '12px',
  textAlign: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const iconBadgeAccent = style({
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 18%, ${vars.color.bgTertiary})`,
  color: vars.color.accent,
  borderColor: vars.color.accent,
});

// ── Activity dot (replaces badge for live PR/CI status) ─────────────────────

export const activityDotWrapper = style({
  position: 'absolute',
  top: '4px',
  right: '4px',
});

// ── Bottom-aligned action group (left rail) ─────────────────────────────────

export const bottomGroup = style({
  marginTop: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.xs,
  width: '100%',
});

// ── Popover surface ─────────────────────────────────────────────────────────

export const popoverContent = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.xs,
  boxShadow: vars.shadow.md,
  minWidth: '200px',
  maxWidth: '320px',
  zIndex: 200,
  outline: 'none',
});

export const popoverHeader = style({
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} ${vars.space.sm}`,
});

export const popoverItem = style({
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textPrimary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
});

export const popoverItemActive = style({
  backgroundColor: vars.color.bgActive,
  color: vars.color.accent,
});

export const popoverItemMeta = style({
  marginLeft: 'auto',
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
});

export const popoverEmpty = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} ${vars.space.sm}`,
});
