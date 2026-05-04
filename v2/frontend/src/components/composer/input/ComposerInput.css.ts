// Author: Subash Karki
import { style } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

// ── Outer container ──────────────────────────────────────────────────
// Matches V1's composerArea: stacked column with border-top, secondary bg,
// wrapping everything (chips + command palette + textarea + toolbar).
export const composerArea = style({
  position: 'relative',
  borderTop: `1px solid ${vars.color.divider}`,
  padding: `${vars.space.lg} ${vars.space.xxl} ${vars.space.xl}`,
  marginTop: vars.space.sm,
  background: vars.color.bgSecondary,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
})

// Drag-over state — dashed accent outline.
export const composerAreaDragOver = style({
  outline: `1px dashed ${vars.color.accent}`,
  outlineOffset: -2,
})

// ── Textarea ─────────────────────────────────────────────────────────
// Matches V1: bgPrimary, border, rounded corners, auto-resize, outline none.
export const textarea = style({
  width: '100%',
  minHeight: 120,
  resize: 'vertical',
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  lineHeight: 1.5,
  outline: 'none',
  ':focus': {
    borderColor: vars.color.borderFocus,
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
})

// ── Toolbar above textarea ───────────────────────────────────────────
// Horizontal row of controls: attach, mode, dropdowns, context.
export const composerToolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  paddingBottom: vars.space.sm,
})

// ── Send row below textarea ─────────────────────────────────────────
// Contains token estimate (left), spacer, send hint + Send/Stop (right).
export const sendRow = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: vars.space.sm,
  paddingTop: vars.space.xs,
})

export const grow = style({ flex: 1 })

// ── Send hint (right side of toolbar) ────────────────────────────────
export const sendHint = style({
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
})

// ── Stop button ──────────────────────────────────────────────────────
export const stopBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 10px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.danger}`,
  background: 'transparent',
  color: vars.color.danger,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 150ms ease',
  ':hover': {
    background: 'rgba(255, 98, 126, 0.12)',
  },
})

// ── Send button (accent, toolbar-integrated) ─────────────────────────
export const sendButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  padding: `4px ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.accent}`,
  background: vars.color.accent,
  color: vars.color.textInverse,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'opacity 150ms ease',
  ':hover': {
    opacity: 0.9,
  },
  selectors: {
    '&:disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
})

// ── Context chips row ────────────────────────────────────────────────
export const chipsRow = style({
  display: 'flex',
  flexDirection: 'row',
  gap: vars.space.xs,
  flexWrap: 'wrap',
})

export const chip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
})

// ── Mode toggle pill ─────────────────────────────────────────────────
// Matches V1's contextPill pattern: ghost button with rounded corners,
// lights up when active with accent color.
export const modePill = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  color: vars.color.textSecondary,
  padding: `4px ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  transition: `color 150ms ease, border-color 150ms ease, background 150ms ease`,
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: vars.color.borderHover,
  },
  ':disabled': {
    cursor: 'not-allowed',
    opacity: 0.5,
  },
})

export const modePillActive = style({
  color: vars.color.accent,
  borderColor: vars.color.accent,
  background: vars.color.bgTertiary,
})

// ── Token estimate ───────────────────────────────────────────────────
export const tokenEstimate = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
})

// ── Model selector (Kobalte Select, pill-style) ─────────────────────
export const modelSelectTrigger = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `5px ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  transition: `border-color ${vars.animation.fast} ease`,
  outline: 'none',
  ':hover': {
    borderColor: vars.color.borderHover,
  },
  selectors: {
    '&:focus': { borderColor: vars.color.accent },
    '&[data-expanded]': {
      borderColor: vars.color.accent,
    },
  },
})

export const modelSelectValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
})

export const modelSelectIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  color: vars.color.textDisabled,
  transition: `transform ${vars.animation.fast} ease`,
  selectors: {
    [`${modelSelectTrigger}[data-expanded] &`]: {
      transform: 'rotate(180deg)',
    },
  },
})

export const modelSelectContent = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderFocus}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.xs} 0`,
  boxShadow: vars.shadow.md,
  zIndex: 500,
  maxHeight: '200px',
  overflowY: 'auto',
})

export const modelSelectListbox = style({
  outline: 'none',
})

export const modelSelectItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  outline: 'none',
  selectors: {
    '&[data-highlighted]': {
      backgroundColor: vars.color.bgHover,
      color: vars.color.accent,
    },
    '&[data-selected]': {
      color: vars.color.accent,
    },
  },
})

export const modelSelectItemLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
})

export const modelSelectValueInner = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
})

// ── Toolbar divider ─────────────────────────────────────────────────
// Thin vertical separator between toolbar control groups.
export const toolbarDivider = style({
  width: 1,
  height: 16,
  background: vars.color.border,
  opacity: 0.5,
  flexShrink: 0,
})

// ── Danger pill variant ─────────────────────────────────────────────
export const modePillDanger = style({
  color: vars.color.danger,
  borderColor: vars.color.danger,
  background: `color-mix(in srgb, ${vars.color.danger} 8%, transparent)`,
})

// ── Attachment mention row ───────────────────────────────────────────
// Matches V1's mentionRow: wrapping flex row of dismissable chips.
export const mentionRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.xs,
})

export const mentionChip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `2px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
})

export const mentionRemove = style({
  background: 'transparent',
  border: 0,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
})

// ── Attach button (toolbar) ─────────────────────────────────────────
export const attachBtn = style({
  background: 'transparent',
  border: 0,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  padding: `2px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontSize: vars.fontSize.xs,
  transition: 'color 150ms ease',
  ':hover': {
    color: vars.color.textPrimary,
  },
})

// ── Context info button (toolbar) ───────────────────────────────────
export const contextInfoBtn = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  padding: `4px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontSize: vars.fontSize.xs,
  transition: 'color 150ms ease, border-color 150ms ease',
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: vars.color.borderHover,
  },
})

export const contextInfoBtnActive = style({
  color: vars.color.accent,
  borderColor: vars.color.accent,
  background: vars.color.bgTertiary,
})
