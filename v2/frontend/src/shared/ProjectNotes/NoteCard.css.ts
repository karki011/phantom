// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

// ── Card container ──────────────────────────────────────────────────────────

export const noteCard = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: vars.radius.md,
  background: vars.color.bgSecondary,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, ${vars.color.border})`,
  overflow: 'hidden',
  cursor: 'pointer',
  transition: `all 200ms ease`,
  minHeight: '100px',
  maxHeight: '160px',
  ':hover': {
    borderColor: `color-mix(in srgb, ${vars.color.accent} 50%, ${vars.color.border})`,
    transform: 'translateY(-2px)',
    boxShadow: `0 4px 16px color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

export const noteCardEditing = style({
  maxHeight: 'none',
  minHeight: '200px',
});

// ── Color bar ───────────────────────────────────────────────────────────────

export const noteColorBar = style({
  height: '3px',
  width: '100%',
  flexShrink: 0,
  background: 'var(--note-color)',
});

// ── Content area ────────────────────────────────────────────────────────────

export const noteContent = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  flex: 1,
  overflow: 'hidden',
  position: 'relative',
});

// ── Title ───────────────────────────────────────────────────────────────────

export const noteTitle = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  color: vars.color.textPrimary,
  marginBottom: vars.space.xs,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

// ── Body preview ────────────────────────────────────────────────────────────

export const noteBody = style({
  fontFamily: vars.font.mono,
  fontSize: '0.7rem',
  color: vars.color.textSecondary,
  lineHeight: '1.5',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
});

// Markdown element styles inside noteBody
globalStyle(`${noteBody} p`, {
  margin: '0 0 4px 0',
  fontSize: 'inherit',
});

globalStyle(`${noteBody} ul, ${noteBody} ol`, {
  margin: '0 0 4px 0',
  paddingLeft: '16px',
  fontSize: 'inherit',
});

globalStyle(`${noteBody} li`, {
  margin: 0,
  fontSize: 'inherit',
});

globalStyle(`${noteBody} code`, {
  fontFamily: vars.font.mono,
  fontSize: 'inherit',
  background: vars.color.bgHover,
  padding: '1px 4px',
  borderRadius: vars.radius.sm,
});

globalStyle(`${noteBody} strong`, {
  fontWeight: 600,
  color: vars.color.textPrimary,
});

globalStyle(`${noteBody} em`, {
  fontStyle: 'italic',
});

globalStyle(`${noteBody} a`, {
  color: vars.color.textLink,
  textDecoration: 'none',
});

globalStyle(`${noteBody} h1, ${noteBody} h2, ${noteBody} h3, ${noteBody} h4`, {
  margin: '0 0 4px 0',
  fontSize: 'inherit',
  fontWeight: 600,
  color: vars.color.textPrimary,
});

// ── Checkbox styling ────────────────────────────────────────────────────────

globalStyle(`${noteBody} input[type="checkbox"]`, {
  appearance: 'none',
  width: '12px',
  height: '12px',
  border: `1px solid ${vars.color.border}`,
  borderRadius: '2px',
  verticalAlign: 'middle',
  marginRight: '4px',
  position: 'relative',
  cursor: 'pointer',
});

globalStyle(`${noteBody} input[type="checkbox"]:checked`, {
  background: vars.color.accent,
  borderColor: vars.color.accent,
});

globalStyle(`${noteBody} input[type="checkbox"]:checked::after`, {
  content: '""',
  position: 'absolute',
  left: '3px',
  top: '1px',
  width: '4px',
  height: '7px',
  border: `solid ${vars.color.textInverse}`,
  borderWidth: '0 1.5px 1.5px 0',
  transform: 'rotate(45deg)',
});

// ── Fade overlay ────────────────────────────────────────────────────────────

export const noteFadeOverlay = style({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '32px',
  background: `linear-gradient(transparent, ${vars.color.bgSecondary})`,
  pointerEvents: 'none',
});

// ── Expand button ───────────────────────────────────────────────────────────

export const noteExpandBtn = style({
  position: 'absolute',
  bottom: vars.space.xs,
  right: vars.space.xs,
  width: '24px',
  height: '24px',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: `all ${vars.animation.fast} ease`,
  zIndex: 1,
  ':hover': {
    color: vars.color.accent,
    background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

// ── Type label badge ────────────────────────────────────────────────────────

export const noteTypeLabel = style({
  position: 'absolute',
  top: vars.space.xs,
  right: vars.space.xs,
  fontFamily: vars.font.mono,
  fontSize: '0.55rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--note-color)',
  lineHeight: 1,
});

// ── Pin indicator ───────────────────────────────────────────────────────────

export const notePinned = style({
  position: 'absolute',
  top: vars.space.xs,
  left: vars.space.xs,
  color: vars.color.warning,
  opacity: 0.7,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

// ── Inline editing textarea ─────────────────────────────────────────────────

export const noteEditTextarea = style({
  width: '100%',
  minHeight: '120px',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  resize: 'vertical',
  fontFamily: vars.font.mono,
  fontSize: '0.7rem',
  color: vars.color.textPrimary,
  lineHeight: '1.5',
  padding: 0,
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

// ── Context menu sub-trigger ────────────────────────────────────────────────

export const contextMenuSubTrigger = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  cursor: 'pointer',
  outline: 'none',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    backgroundColor: vars.color.bgHover,
  },
  ':focus-visible': {
    backgroundColor: vars.color.bgHover,
  },
});

export const contextMenuSubContent = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.xs} 0`,
  boxShadow: vars.shadow.md,
  minWidth: '120px',
  zIndex: 101,
  outline: 'none',
});
