// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

// ── Drawer content ──────────────────────────────────────────────────────────

export const drawerContent = style({
  flex: 1,
  overflow: 'auto',
  padding: `${vars.space.md} ${vars.space.xl}`,
});

export const addNoteBtn = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `all 150ms ease`,
  ':hover': {
    color: vars.color.accent,
    borderColor: `color-mix(in srgb, ${vars.color.accent} 45%, ${vars.color.border})`,
    background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

// ── Notes list ──────────────────────────────────────────────────────────────

export const notesList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

// ── Note card ───────────────────────────────────────────────────────────────

export const noteCard = style({
  borderRadius: vars.radius.md,
  background: vars.color.bgSecondary,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, ${vars.color.border})`,
  overflow: 'hidden',
  transition: `border-color ${vars.animation.fast} ease`,
  ':hover': {
    borderColor: `color-mix(in srgb, ${vars.color.accent} 35%, ${vars.color.border})`,
  },
});

export const noteColorBar = style({
  height: '3px',
  width: '100%',
  background: 'var(--note-color)',
});

export const noteHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.md}`,
  width: '100%',
  border: 'none',
  background: 'transparent',
  color: vars.color.textPrimary,
  cursor: 'pointer',
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  textAlign: 'left',
  outline: 'none',
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const noteChevron = style({
  color: vars.color.textSecondary,
  flexShrink: 0,
  transition: `transform ${vars.animation.fast} ease`,
});

export const notePinIcon = style({
  color: vars.color.warning,
  flexShrink: 0,
  opacity: 0.8,
});

export const noteTitle = style({
  flex: 1,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const noteTypeBadge = style({
  fontFamily: vars.font.mono,
  fontSize: '0.55rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--note-color)',
  flexShrink: 0,
});

export const noteActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  flexShrink: 0,
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease`,
});

// Show actions on card hover
globalStyle(`${noteCard}:hover ${noteActions}`, {
  opacity: 1,
});

export const noteActionBtn = style({
  width: '22px',
  height: '22px',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

export const noteActionBtnDanger = style({
  width: '22px',
  height: '22px',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.danger,
    background: `color-mix(in srgb, ${vars.color.danger} 12%, transparent)`,
  },
});

// ── Collapsible content ─────────────────────────────────────────────────────

export const noteContent = style({
  padding: `0 ${vars.space.md} ${vars.space.md}`,
  borderTop: `1px solid color-mix(in srgb, ${vars.color.accent} 8%, ${vars.color.border})`,
});

export const noteBody = style({
  fontFamily: vars.font.mono,
  fontSize: '0.7rem',
  color: vars.color.textSecondary,
  lineHeight: '1.6',
  cursor: 'text',
  padding: `${vars.space.sm} 0`,
  minHeight: '40px',
});

// Markdown styles inside noteBody
globalStyle(`${noteBody} p`, { margin: '0 0 4px 0', fontSize: 'inherit' });
globalStyle(`${noteBody} ul, ${noteBody} ol`, { margin: '0 0 4px 0', paddingLeft: '16px', fontSize: 'inherit' });
globalStyle(`${noteBody} li`, { margin: 0, fontSize: 'inherit' });
globalStyle(`${noteBody} code`, {
  fontFamily: 'inherit',
  background: `color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  borderRadius: '2px',
  padding: '0 3px',
});
globalStyle(`${noteBody} a`, { color: vars.color.textLink, textDecoration: 'none' });
globalStyle(`${noteBody} strong`, { fontWeight: 600, color: vars.color.textPrimary });
globalStyle(`${noteBody} h1, ${noteBody} h2, ${noteBody} h3, ${noteBody} h4`, {
  margin: '0 0 4px 0', fontSize: 'inherit', fontWeight: 600, color: vars.color.textPrimary,
});

export const notePlaceholder = style({
  color: vars.color.textDisabled,
  fontStyle: 'italic',
  fontSize: '0.7rem',
  fontFamily: vars.font.mono,
});

export const noteTextarea = style({
  width: '100%',
  minHeight: '100px',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  resize: 'vertical',
  fontFamily: vars.font.mono,
  fontSize: '0.7rem',
  color: vars.color.textPrimary,
  lineHeight: '1.6',
  padding: `${vars.space.sm} 0`,
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

// ── Empty state ─────────────────────────────────────────────────────────────

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.md,
  padding: `${vars.space.xl} 0`,
  color: vars.color.textDisabled,
});

export const emptyText = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  margin: 0,
});

export const emptyCreateBtn = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.accent} 15%, ${vars.color.bgSecondary})`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 30%, ${vars.color.border})`,
  color: vars.color.accent,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 25%, ${vars.color.bgSecondary})`,
    borderColor: vars.color.accent,
  },
});

// ── Save / Cancel buttons ───────────────────────────────────────────────────

export const editorActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: vars.space.sm,
  paddingTop: vars.space.sm,
  borderTop: `1px solid color-mix(in srgb, ${vars.color.accent} 8%, ${vars.color.border})`,
});

export const saveBtn = style({
  padding: `${vars.space.xs} ${vars.space.lg}`,
  borderRadius: vars.radius.sm,
  border: 'none',
  background: vars.color.accent,
  color: vars.color.bgPrimary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  cursor: 'pointer',
  transition: `opacity ${vars.animation.fast} ease`,
  ':hover': {
    opacity: 0.85,
  },
});

export const cancelBtn = style({
  padding: `${vars.space.xs} ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textSecondary,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

// ── Context menu (reused from NoteCard) ─────────────────────────────────────

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
  ':hover': { backgroundColor: vars.color.bgHover },
  ':focus-visible': { backgroundColor: vars.color.bgHover },
});

export const contextMenuSubContent = style({
  backgroundColor: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.xs} 0`,
  boxShadow: vars.shadow.md,
  minWidth: '120px',
  zIndex: 9100,
});
