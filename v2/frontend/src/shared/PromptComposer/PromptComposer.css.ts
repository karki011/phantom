// PhantomOS v2 — Floating prompt composer styles
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

export const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

// ---------------------------------------------------------------------------
// 1. Composer — floating glass container
// ---------------------------------------------------------------------------

export const composer = style({
  position: 'fixed',
  left: 0,
  top: 0,
  minWidth: 480,
  maxWidth: 720,
  width: '50vw',
  zIndex: 1000,

  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: `color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
  borderRadius: '20px',
  boxShadow: `${vars.shadow.lg}, ${vars.shadow.glow}`,

  animation: `${fadeIn} 200ms ease-out`,

  display: 'flex',
  flexDirection: 'column',
});

export const composerDragOver = style({
  borderColor: vars.color.accent,
  boxShadow: `${vars.shadow.lg}, 0 0 30px ${vars.color.accentMuted}`,
});

// ---------------------------------------------------------------------------
// 2. Header — drag handle + close button
// ---------------------------------------------------------------------------

export const composerHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.md} 0 ${vars.space.md}`,
});

export const closeButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  padding: 0,
  border: 'none',
  borderRadius: vars.radius.full,
  background: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,

  ':hover': {
    color: vars.color.danger,
    background: vars.color.dangerMuted,
  },
});

// ---------------------------------------------------------------------------
// 2b. Terminal selector — pick which terminal to target
// ---------------------------------------------------------------------------

export const terminalSelector = style({
  position: 'relative',
  flex: 1,
  display: 'flex',
  justifyContent: 'center',
});

export const selectorButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.sm}`,
  border: 'none',
  borderRadius: vars.radius.md,
  background: 'none',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  transition: `color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,

  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

export const selectorDot = style({
  width: 8,
  height: 8,
  borderRadius: vars.radius.full,
  flexShrink: 0,
});

export const selectorLabel = style({
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const selectorDropdown = style({
  position: 'absolute',
  top: '100%',
  left: '50%',
  transform: 'translateX(-50%)',
  marginTop: vars.space.xs,
  minWidth: 160,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.md,
  padding: vars.space.xs,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
});

export const selectorItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  border: 'none',
  borderRadius: vars.radius.sm,
  background: 'none',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  textAlign: 'left',
  transition: `background ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,

  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },

  selectors: {
    '&[data-active="true"]': {
      background: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
  },
});

// ---------------------------------------------------------------------------
// 2c. Drag handle — compact grip icon
// ---------------------------------------------------------------------------

export const dragHandle = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  height: 24,
  cursor: 'grab',
  flexShrink: 0,
  color: vars.color.textDisabled,
  transition: `color ${vars.animation.fast} ease`,

  ':hover': {
    color: vars.color.textSecondary,
  },

  selectors: {
    '&[data-dragging="true"]': {
      cursor: 'grabbing',
      color: vars.color.accent,
    },
  },
});

export const dragLine = style({
  width: 48,
  height: 3,
  borderRadius: vars.radius.full,
  background: vars.color.border,
  transition: `background ${vars.animation.fast} ease`,
});

globalStyle(`${dragHandle}:hover ${dragLine}`, {
  background: vars.color.borderHover,
});

globalStyle(`${dragHandle}[data-dragging="true"] ${dragLine}`, {
  background: vars.color.accent,
});

// ---------------------------------------------------------------------------
// 3. Chips row — attached file/image chips
// ---------------------------------------------------------------------------

export const chipsRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.sm,
  padding: `0 ${vars.space.lg} ${vars.space.sm} ${vars.space.lg}`,
});

// ---------------------------------------------------------------------------
// 4. Chip — individual file/image chip
// ---------------------------------------------------------------------------

export const chip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `2px ${vars.space.sm} 2px ${vars.space.xs}`,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  lineHeight: 1.4,
  maxWidth: 180,
  transition: `border-color ${vars.animation.fast} ease`,

  ':hover': {
    borderColor: vars.color.borderHover,
  },
});

export const chipIcon = style({
  flexShrink: 0,
  color: vars.color.textDisabled,
});

export const chipName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// ---------------------------------------------------------------------------
// 5. Chip thumbnail — image preview inside chip
// ---------------------------------------------------------------------------

export const chipThumb = style({
  width: 20,
  height: 20,
  borderRadius: vars.radius.sm,
  objectFit: 'cover',
  flexShrink: 0,
});

// ---------------------------------------------------------------------------
// 6. Chip remove — tiny X button on chip
// ---------------------------------------------------------------------------

export const chipRemove = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  padding: 0,
  border: 'none',
  background: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  flexShrink: 0,
  fontSize: '10px',
  lineHeight: 1,
  transition: `color ${vars.animation.fast} ease`,

  ':hover': {
    color: vars.color.danger,
  },
});

// ---------------------------------------------------------------------------
// 7. Textarea wrap — full width area for the prompt
// ---------------------------------------------------------------------------

export const textAreaWrap = style({
  padding: `0 ${vars.space.lg}`,
});

// ---------------------------------------------------------------------------
// 7b. Bottom bar — paperclip left, send right
// ---------------------------------------------------------------------------

export const bottomBar = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${vars.space.xs} ${vars.space.md} ${vars.space.md} ${vars.space.md}`,
});

export const bottomSpacer = style({
  flex: 1,
});

// ---------------------------------------------------------------------------
// 8. Attach button — paperclip icon (left)
// ---------------------------------------------------------------------------

export const attachButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  padding: 0,
  border: 'none',
  background: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  borderRadius: vars.radius.full,
  flexShrink: 0,
  transition: `color ${vars.animation.fast} ease`,

  ':hover': {
    color: vars.color.accent,
  },
});

export const textField = style({
  flex: 1,
  minWidth: 0,
});

// ---------------------------------------------------------------------------
// 9. Text area — auto-growing prompt input
// ---------------------------------------------------------------------------

export const textArea = style({
  width: '100%',
  minHeight: '4.5em',
  maxHeight: 200,
  resize: 'none',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  lineHeight: 1.5,
  padding: `${vars.space.xs} 0`,

  '::placeholder': {
    color: vars.color.textDisabled,
  },

  /* Thin themed scrollbar */
  scrollbarWidth: 'thin',
  scrollbarColor: `${vars.color.border} transparent`,
});

globalStyle(`${textArea}::-webkit-scrollbar`, {
  width: 4,
});

globalStyle(`${textArea}::-webkit-scrollbar-track`, {
  background: 'transparent',
});

globalStyle(`${textArea}::-webkit-scrollbar-thumb`, {
  background: vars.color.border,
  borderRadius: vars.radius.full,
});

// ---------------------------------------------------------------------------
// 10. Send button — submit (right)
// ---------------------------------------------------------------------------

export const sendButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  padding: 0,
  border: 'none',
  borderRadius: vars.radius.full,
  background: vars.color.accent,
  color: vars.color.textInverse,
  cursor: 'pointer',
  flexShrink: 0,
  transition: `background ${vars.animation.fast} ease, opacity ${vars.animation.fast} ease`,

  ':hover': {
    background: vars.color.accentHover,
  },

  selectors: {
    '&[disabled], &[data-disabled="true"]': {
      background: vars.color.bgActive,
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
});

// ---------------------------------------------------------------------------
// 11. Model button — model selector (optional, between attach and send)
// ---------------------------------------------------------------------------

export const modelButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  padding: 0,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  background: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  transition: `border-color ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,

  ':hover': {
    borderColor: vars.color.accent,
    color: vars.color.accent,
  },
});

// ---------------------------------------------------------------------------
// 12. Drop zone — file drag-over overlay
// ---------------------------------------------------------------------------

export const dropOverlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '20px',
  border: `2px dashed ${vars.color.accent}`,
  background: vars.color.accentMuted,
  color: vars.color.accent,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.md,
  fontWeight: 500,
  pointerEvents: 'none',
  zIndex: 1,
});

// ---------------------------------------------------------------------------
// 13. Utility — hidden
// ---------------------------------------------------------------------------

export const hidden = style({
  display: 'none',
});

// ---------------------------------------------------------------------------
// FAB — floating action button to open composer
// ---------------------------------------------------------------------------

export const fab = style({
  position: 'fixed',
  bottom: 'calc(2.5rem + 12px)',
  zIndex: 999,
  width: 44,
  height: 44,
  borderRadius: vars.radius.full,
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',

  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow: `${vars.shadow.md}, 0 0 12px ${vars.color.accentMuted}`,
  color: vars.color.accent,
  transition: `transform ${vars.animation.fast} ease, box-shadow ${vars.animation.fast} ease, color ${vars.animation.fast} ease`,

  ':hover': {
    transform: 'scale(1.1)',
    boxShadow: `${vars.shadow.lg}, ${vars.shadow.glow}`,
    color: vars.color.accentHover,
  },

  ':active': {
    transform: 'scale(0.95)',
  },
});
