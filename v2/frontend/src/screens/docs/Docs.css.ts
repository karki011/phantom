// PhantomOS v2 — Documentation screen styles (futuristic edition)
// Author: Subash Karki

import { globalStyle, style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

const scanLineIn = keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const fadeSlideIn = keyframes({
  from: { opacity: 0, transform: 'translateY(12px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const glowPulse = keyframes({
  '0%': { opacity: 0.6 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.6 },
});

const accentSweep = keyframes({
  from: { backgroundPosition: '200% center' },
  to: { backgroundPosition: '-200% center' },
});

const scaleIn = keyframes({
  from: { opacity: 0, transform: 'translate(-50%, -50%) scale(0.96)' },
  to: { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
});

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const borderGlow = keyframes({
  '0%, 100%': { boxShadow: `0 0 30px color-mix(in srgb, ${vars.color.accent} 10%, transparent), inset 0 0 30px color-mix(in srgb, ${vars.color.accent} 3%, transparent)` },
  '50%': { boxShadow: `0 0 50px color-mix(in srgb, ${vars.color.accent} 20%, transparent), inset 0 0 50px color-mix(in srgb, ${vars.color.accent} 6%, transparent)` },
});

// ---------------------------------------------------------------------------
// Modal overlay + container
// ---------------------------------------------------------------------------

export const docsOverlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: vars.color.bgOverlay,
  zIndex: 500,
  animation: `${fadeIn} 200ms ease`,
});

export const docsModal = style({
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 501,
  width: 'calc(100vw - 80px)',
  height: 'calc(100vh - 80px)',
  maxWidth: 1200,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, ${vars.color.border})`,
  borderRadius: vars.radius.lg,
  overflow: 'hidden',
  animation: `${scaleIn} 300ms cubic-bezier(0.16, 1, 0.3, 1), ${borderGlow} 4s ease-in-out infinite`,
});

export const docsClose = style({
  position: 'absolute',
  top: vars.space.md,
  right: vars.space.md,
  zIndex: 10,
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: vars.radius.full,
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,

  ':hover': {
    color: vars.color.danger,
    background: vars.color.dangerMuted,
  },
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const docsLayout = style({
  display: 'flex',
  height: '100%',
  overflow: 'hidden',
});

// ---------------------------------------------------------------------------
// Sidebar — glassmorphism nav
// ---------------------------------------------------------------------------

export const docsSidebar = style({
  width: 260,
  flexShrink: 0,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 90%, transparent)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRight: `1px solid color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  overflowY: 'auto',
  padding: `${vars.space.xl} 0`,
  scrollbarWidth: 'thin',
  scrollbarColor: `${vars.color.border} transparent`,
});

globalStyle(`${docsSidebar}::-webkit-scrollbar`, { width: 4 });
globalStyle(`${docsSidebar}::-webkit-scrollbar-track`, { background: 'transparent' });
globalStyle(`${docsSidebar}::-webkit-scrollbar-thumb`, {
  background: vars.color.border,
  borderRadius: vars.radius.full,
});

export const sidebarTitle = style({
  padding: `0 ${vars.space.xl} ${vars.space.xl}`,
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  color: vars.color.accent,
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  textShadow: `0 0 12px ${vars.color.accentMuted}`,
});

export const sidebarSection = style({
  padding: `${vars.space.lg} ${vars.space.xl} ${vars.space.xs}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  animation: `${scanLineIn} 200ms ease both`,
});

export const sidebarItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  width: '100%',
  padding: `${vars.space.sm} ${vars.space.xl}`,
  border: 'none',
  borderLeft: '2px solid transparent',
  background: 'none',
  textAlign: 'left',
  color: vars.color.textSecondary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease, border-color ${vars.animation.fast} ease`,
  animation: `${scanLineIn} 200ms ease both`,

  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
    borderLeftColor: `color-mix(in srgb, ${vars.color.accent} 40%, transparent)`,
  },

  selectors: {
    '&[data-active="true"]': {
      color: vars.color.accent,
      background: vars.color.bgActive,
      borderLeftColor: vars.color.accent,
      textShadow: `0 0 8px ${vars.color.accentMuted}`,
    },
  },
});

// ---------------------------------------------------------------------------
// Search input
// ---------------------------------------------------------------------------

export const searchInput = style({
  display: 'block',
  width: `calc(100% - ${vars.space.xl} * 2)`,
  margin: `0 ${vars.space.xl} ${vars.space.lg}`,
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  outline: 'none',
  transition: `border-color ${vars.animation.fast} ease, box-shadow ${vars.animation.fast} ease`,

  '::placeholder': {
    color: vars.color.textDisabled,
  },

  ':focus': {
    borderColor: vars.color.accent,
    boxShadow: `0 0 0 1px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  },
});

export const searchResultSnippet = style({
  display: 'block',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  marginTop: '2px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const searchHighlight = style({
  backgroundColor: `color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
  borderRadius: '2px',
  padding: '0 1px',
});

export const noResults = style({
  padding: `${vars.space.lg} ${vars.space.xl}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textDisabled,
  textAlign: 'center',
});

// ---------------------------------------------------------------------------
// Content area
// ---------------------------------------------------------------------------

export const docsContent = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.xxl} ${vars.space.xxl} ${vars.space.xxl} 48px`,
  scrollbarWidth: 'thin',
  scrollbarColor: `${vars.color.border} transparent`,
});

globalStyle(`${docsContent}::-webkit-scrollbar`, { width: 4 });
globalStyle(`${docsContent}::-webkit-scrollbar-track`, { background: 'transparent' });
globalStyle(`${docsContent}::-webkit-scrollbar-thumb`, {
  background: vars.color.border,
  borderRadius: vars.radius.full,
});

export const docPage = style({
  maxWidth: 780,
  animation: `${fadeSlideIn} 300ms cubic-bezier(0.16, 1, 0.3, 1) both`,
});

// ---------------------------------------------------------------------------
// Typography — futuristic display + glow
// ---------------------------------------------------------------------------

export const docTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.xxl,
  fontWeight: 700,
  color: vars.color.textPrimary,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  textShadow: `0 0 20px ${vars.color.accentMuted}`,
  marginBottom: vars.space.md,
  paddingBottom: vars.space.lg,
  borderBottom: 'none',
  position: 'relative',

  '::after': {
    content: '""',
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 120,
    height: 2,
    borderRadius: vars.radius.full,
    background: `linear-gradient(90deg, ${vars.color.accent}, transparent)`,
  },
});

export const docSubtitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  color: vars.color.textPrimary,
  letterSpacing: '0.04em',
  marginTop: vars.space.xxl,
  marginBottom: vars.space.md,
  paddingLeft: vars.space.md,
  borderLeft: `2px solid ${vars.color.accent}`,
  animation: `${scanLineIn} 250ms ease both`,
});

export const docH3 = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.textSecondary,
  letterSpacing: '0.02em',
  marginTop: vars.space.xl,
  marginBottom: vars.space.sm,
  animation: `${scanLineIn} 200ms ease both`,
});

export const docParagraph = style({
  fontSize: vars.fontSize.md,
  lineHeight: 1.75,
  color: vars.color.textSecondary,
  marginBottom: vars.space.md,
  animation: `${scanLineIn} 200ms ease both`,
});

// ---------------------------------------------------------------------------
// Code — terminal-style blocks
// ---------------------------------------------------------------------------

export const docCode = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 60%, transparent)`,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  color: vars.color.accent,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
});

export const docCodeBlock = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.7,
  color: vars.color.textPrimary,
  background: vars.color.bgPrimary,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  borderRadius: vars.radius.md,
  padding: vars.space.lg,
  overflowX: 'auto',
  marginBottom: vars.space.lg,
  position: 'relative',
  animation: `${scanLineIn} 250ms ease both`,

  '::before': {
    content: '">"',
    position: 'absolute',
    top: vars.space.md,
    left: vars.space.md,
    color: vars.color.accent,
    opacity: 0.4,
    fontWeight: 700,
  },
});

// ---------------------------------------------------------------------------
// Table — glass-bordered data grid
// ---------------------------------------------------------------------------

export const docTable = style({
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  marginBottom: vars.space.lg,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  animation: `${scanLineIn} 250ms ease both`,
});

globalStyle(`${docTable} th`, {
  padding: `${vars.space.sm} ${vars.space.md}`,
  textAlign: 'left',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  color: vars.color.accent,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  background: `color-mix(in srgb, ${vars.color.accent} 6%, transparent)`,
  borderBottom: `1px solid ${vars.color.divider}`,
});

globalStyle(`${docTable} td`, {
  padding: `${vars.space.sm} ${vars.space.md}`,
  textAlign: 'left',
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.divider} 50%, transparent)`,
});

globalStyle(`${docTable} tr:last-child td`, {
  borderBottom: 'none',
});

globalStyle(`${docTable} tr:hover td`, {
  background: vars.color.bgHover,
});

// ---------------------------------------------------------------------------
// Badge — status indicators with glow
// ---------------------------------------------------------------------------

export const docBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  letterSpacing: '0.05em',

  selectors: {
    '&[data-status="done"]': {
      background: vars.color.successMuted,
      color: vars.color.success,
      boxShadow: `0 0 8px ${vars.color.successMuted}`,
    },
    '&[data-status="planned"]': {
      background: vars.color.infoMuted,
      color: vars.color.info,
      boxShadow: `0 0 8px ${vars.color.infoMuted}`,
    },
    '&[data-status="partial"]': {
      background: vars.color.warningMuted,
      color: vars.color.warning,
      boxShadow: `0 0 8px ${vars.color.warningMuted}`,
    },
  },
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts — styled keys
// ---------------------------------------------------------------------------

export const docShortcut = style({
  display: 'inline-flex',
  gap: '3px',
  alignItems: 'center',
});

globalStyle(`${docShortcut} kbd`, {
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: `2px ${vars.space.sm}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  color: vars.color.textSecondary,
  boxShadow: `0 1px 2px rgba(0,0,0,0.3)`,
  lineHeight: 1,
});

// ---------------------------------------------------------------------------
// List — bulleted with accent markers
// ---------------------------------------------------------------------------

export const docList = style({
  paddingLeft: vars.space.xl,
  marginBottom: vars.space.md,
  listStyleType: 'none',
});

globalStyle(`${docList} li`, {
  position: 'relative',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.md,
  lineHeight: 1.75,
  marginBottom: vars.space.xs,
  paddingLeft: vars.space.md,
  animation: `${scanLineIn} 200ms ease both`,
});

globalStyle(`${docList} li::before`, {
  content: '"▸"',
  position: 'absolute',
  left: 0,
  color: vars.color.accent,
  opacity: 0.6,
});

// ---------------------------------------------------------------------------
// Divider — accent gradient line
// ---------------------------------------------------------------------------

export const docDivider = style({
  border: 'none',
  height: 1,
  margin: `${vars.space.xxl} 0`,
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  opacity: 0.3,
});
