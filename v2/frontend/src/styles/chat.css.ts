// PhantomOS v2 — Chat pane styles
// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from './theme.css';

// ── Animations ──────────────────────────────────────────────────────────────

const pulse = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 1 },
});

const slideIn = keyframes({
  '0%': { opacity: 0, transform: 'translateY(8px)' },
  '100%': { opacity: 1, transform: 'translateY(0)' },
});

// ── Root Layout ─────────────────────────────────────────────────────────────

export const chatRoot = style({
  display: 'flex',
  height: '100%',
  overflow: 'hidden',
  background: vars.color.bgPrimary,
});

// ── Sidebar ─────────────────────────────────────────────────────────────────

export const sidebar = style({
  width: '220px',
  minWidth: '220px',
  display: 'flex',
  flexDirection: 'column',
  background: vars.color.bgSecondary,
  borderRight: `1px solid ${vars.color.border}`,
  overflow: 'hidden',
});

export const sidebarHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.md} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const sidebarTitle = style({
  fontSize: vars.fontSize.sm,
  fontWeight: 700,
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontFamily: vars.font.mono,
});

export const newChatButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.accent,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
    borderColor: vars.color.accent,
  },
});

export const conversationList = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.xs} 0`,
  '::-webkit-scrollbar': { width: '3px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

export const conversationItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  cursor: 'pointer',
  borderLeft: '2px solid transparent',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    background: vars.color.bgHover,
  },
  selectors: {
    '&[data-active="true"]': {
      background: vars.color.bgActive,
      borderLeftColor: vars.color.accent,
    },
  },
});

export const conversationItemText = style({
  flex: 1,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: vars.font.body,
});

export const conversationItemMeta = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
});

export const deleteButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  opacity: 0,
  flexShrink: 0,
  transition: `all ${vars.animation.fast} ease`,
  selectors: {
    [`${conversationItem}:hover &`]: { opacity: 1 },
    '&:hover': { color: vars.color.danger, background: vars.color.dangerMuted },
  },
});

export const sidebarEmpty = style({
  padding: vars.space.lg,
  textAlign: 'center',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
});

// ── Main Area ───────────────────────────────────────────────────────────────

export const mainArea = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minWidth: 0,
});

export const mainHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const mainHeaderTitle = style({
  flex: 1,
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const modelSelector = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `3px ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  cursor: 'pointer',
  transition: `border-color ${vars.animation.fast} ease`,
  outline: 'none',
  ':hover': { borderColor: vars.color.borderHover },
  ':focus': { borderColor: vars.color.accent },
});

export const toggleSidebarButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    background: vars.color.bgHover,
  },
});

// ── Messages ────────────────────────────────────────────────────────────────

export const messagesContainer = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.lg} ${vars.space.xl}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
  '::-webkit-scrollbar-track': { background: 'transparent' },
});

export const messageRow = style({
  display: 'flex',
  gap: vars.space.md,
  animation: `${slideIn} 200ms ease`,
  selectors: {
    '&[data-role="user"]': { flexDirection: 'row-reverse' },
  },
});

export const messageAvatar = style({
  width: '28px',
  height: '28px',
  borderRadius: vars.radius.full,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  fontSize: vars.fontSize.xs,
  fontWeight: 700,
  selectors: {
    '&[data-role="user"]': {
      background: vars.color.accentMuted,
      color: vars.color.accent,
    },
    '&[data-role="assistant"]': {
      background: `color-mix(in srgb, #a855f7 15%, transparent)`,
      color: '#a855f7',
    },
  },
});

export const messageBubble = style({
  maxWidth: '75%',
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderRadius: vars.radius.lg,
  fontSize: vars.fontSize.sm,
  lineHeight: '1.6',
  wordBreak: 'break-word',
  selectors: {
    '&[data-role="user"]': {
      background: vars.color.accentMuted,
      color: vars.color.textPrimary,
      borderBottomRightRadius: vars.radius.sm,
    },
    '&[data-role="assistant"]': {
      background: vars.color.bgSecondary,
      color: vars.color.textPrimary,
      border: `1px solid ${vars.color.border}`,
      borderBottomLeftRadius: vars.radius.sm,
    },
  },
});

export const streamingCursor = style({
  display: 'inline-block',
  width: '2px',
  height: '1em',
  background: vars.color.accent,
  marginLeft: '2px',
  verticalAlign: 'text-bottom',
  animation: `${pulse} 1s ease-in-out infinite`,
});

// ── Thinking Block ──────────────────────────────────────────────────────────

export const thinkingBlock = style({
  margin: `${vars.space.sm} 0`,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.accent} 6%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
});

export const thinkingHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const thinkingContent = style({
  marginTop: vars.space.sm,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
  opacity: 0.7,
});

// ── Tool Use Block ──────────────────────────────────────────────────────────

export const toolUseBlock = style({
  margin: `${vars.space.sm} 0`,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: `color-mix(in srgb, ${vars.color.warning} 6%, transparent)`,
  border: `1px solid color-mix(in srgb, ${vars.color.warning} 15%, transparent)`,
  cursor: 'pointer',
  transition: `all ${vars.animation.fast} ease`,
});

export const toolUseHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.warning,
  fontWeight: 600,
});

export const toolUseContent = style({
  marginTop: vars.space.sm,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
  opacity: 0.7,
  maxHeight: '200px',
  overflowY: 'auto',
});

// ── Code Blocks ─────────────────────────────────────────────────────────────

export const codeBlock = style({
  margin: `${vars.space.sm} 0`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
  border: `1px solid ${vars.color.border}`,
});

export const codeBlockHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.xs} ${vars.space.md}`,
  background: vars.color.bgTertiary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
});

export const codeBlockContent = style({
  padding: `${vars.space.md}`,
  background: vars.color.bgPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  lineHeight: '1.6',
  overflowX: 'auto',
  whiteSpace: 'pre',
  color: vars.color.textPrimary,
  '::-webkit-scrollbar': { height: '3px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
});

export const copyButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  border: 'none',
  background: 'transparent',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    color: vars.color.accent,
    background: vars.color.bgHover,
  },
});

// ── Inline Code ─────────────────────────────────────────────────────────────

export const inlineCode = style({
  padding: `1px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  fontFamily: vars.font.mono,
  fontSize: '0.85em',
  color: vars.color.accent,
});

// ── Markdown Prose ──────────────────────────────────────────────────────────

export const markdownProse = style({
  lineHeight: '1.6',
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
});

// ── Input Area ──────────────────────────────────────────────────────────────

export const inputArea = style({
  display: 'flex',
  alignItems: 'flex-end',
  gap: vars.space.sm,
  padding: `${vars.space.md} ${vars.space.xl}`,
  borderTop: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  flexShrink: 0,
});

export const inputTextarea = style({
  flex: 1,
  padding: `${vars.space.md}`,
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.body,
  lineHeight: '1.5',
  resize: 'none',
  outline: 'none',
  minHeight: '40px',
  maxHeight: '160px',
  boxSizing: 'border-box',
  transition: `border-color ${vars.animation.fast} ease`,
  ':focus': { borderColor: vars.color.accent },
  '::placeholder': { color: vars.color.textDisabled },
});

export const sendButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: vars.radius.md,
  border: 'none',
  background: vars.color.accent,
  color: vars.color.textInverse,
  cursor: 'pointer',
  flexShrink: 0,
  transition: `all ${vars.animation.fast} ease`,
  ':hover': {
    opacity: 0.9,
    boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  },
  ':disabled': {
    opacity: 0.4,
    cursor: 'default',
    boxShadow: 'none',
  },
});

export const inputHint = style({
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  padding: `0 ${vars.space.xl} ${vars.space.sm}`,
  background: vars.color.bgSecondary,
});

// ── Empty State ─────────────────────────────────────────────────────────────

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  gap: vars.space.lg,
  color: vars.color.textDisabled,
  padding: vars.space.xxl,
});

export const emptyIcon = style({
  opacity: 0.3,
  color: vars.color.accent,
});

export const emptyTitle = style({
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  color: vars.color.textSecondary,
  fontFamily: vars.font.display,
  letterSpacing: '0.04em',
});

export const emptySubtitle = style({
  fontSize: vars.fontSize.sm,
  color: vars.color.textDisabled,
  textAlign: 'center',
  maxWidth: '320px',
  lineHeight: '1.5',
});
