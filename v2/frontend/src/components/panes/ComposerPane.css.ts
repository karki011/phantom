// Phantom — Composer pane styling
// Author: Subash Karki

import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const pendingDotPulse = keyframes({
  '0%, 80%, 100%': { opacity: 0.25, transform: 'scale(0.85)' },
  '40%': { opacity: 1, transform: 'scale(1)' },
});

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  // Subtle accent-tinted bg — softer than pitch-black bgPrimary, gives the
  // pane a slight purple wash so it reads as "agent space" rather than void.
  background: `color-mix(in srgb, ${vars.color.accent} 3%, ${vars.color.bgPrimary})`,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
});

export const statusStrip = style({
  position: 'sticky',
  top: 0,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.xxl}`,
  borderBottom: `1px solid ${vars.color.divider}`,
  background: vars.color.bgSecondary,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
});

export const statusDot = style({
  width: 6,
  height: 6,
  borderRadius: vars.radius.full,
  background: vars.color.accent,
});

export const statusDotIdle = style({
  background: vars.color.textDisabled,
});

export const statusGrow = style({
  flex: 1,
});

export const cancelBtn = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: vars.color.borderHover,
  },
});

export const feed = style({
  flex: 1,
  overflowY: 'auto',
  padding: `${vars.space.lg} ${vars.space.xxl}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
});

export const userTurn = style({
  fontSize: 'inherit',
  color: vars.color.textPrimary,
  selectors: {
    '&::before': {
      content: '"YOU"',
      display: 'inline-block',
      marginRight: vars.space.sm,
      padding: '1px 6px',
      borderRadius: vars.radius.sm,
      background: vars.color.accentMuted,
      color: vars.color.accent,
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.05em',
    },
  },
});

export const assistantText = style({
  fontSize: 'inherit',
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
  lineHeight: 1.6,
});

export const editCard = style({
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.sm,
  background: vars.color.bgSecondary,
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  fontSize: vars.fontSize.sm,
});

export const editPath = style({
  flex: 1,
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editStats = style({
  fontFamily: vars.font.mono,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
});

export const editAdded = style({ color: vars.color.success });
export const editRemoved = style({ color: vars.color.danger });

export const editBtn = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  padding: '5px 12px',
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.sm,
  fontWeight: 500,
  transition: `all 150ms ease`,
  ':hover': {
    borderColor: vars.color.borderHover,
    color: vars.color.textPrimary,
    background: `color-mix(in srgb, ${vars.color.textPrimary} 5%, transparent)`,
  },
});

export const editAccept = style({
  borderColor: vars.color.successMuted,
  color: vars.color.success,
  background: `color-mix(in srgb, ${vars.color.success} 10%, transparent)`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.success} 20%, transparent)`,
    borderColor: vars.color.success,
    color: vars.color.success,
  },
});

export const editDiscard = style({
  borderColor: vars.color.dangerMuted,
  color: vars.color.danger,
  background: `color-mix(in srgb, ${vars.color.danger} 8%, transparent)`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.danger} 18%, transparent)`,
    borderColor: vars.color.danger,
    color: vars.color.danger,
  },
});

export const editDecidedAccepted = style({ opacity: 0.5, borderColor: vars.color.successMuted });
export const editDecidedDiscarded = style({ opacity: 0.4, textDecoration: 'line-through' });

export const toolBlock = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
});

// Three-dot bouncing pulse + "thinking..." label, shown immediately on send
// before the first stream event arrives. Hides as soon as any content lands.
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

export const thinkingBlock = style({
  fontStyle: 'italic',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderLeft: `2px solid ${vars.color.accent}`,
  whiteSpace: 'pre-wrap',
});

export const composerArea = style({
  borderTop: `1px solid ${vars.color.divider}`,
  padding: `${vars.space.lg} ${vars.space.xxl} ${vars.space.xl}`,
  marginTop: vars.space.sm,
  background: vars.color.bgSecondary,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const mentionRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.space.xs,
});

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
});

export const mentionRemove = style({
  background: 'transparent',
  border: 0,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
});

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
});

export const composerToolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.md,
  fontSize: vars.fontSize.sm,
  color: vars.color.textSecondary,
  paddingTop: vars.space.sm,
});

export const grow = style({ flex: 1 });

// ── Kobalte model select ──────────────────────────────────────────────
export const modelSelectTrigger = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `5px ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontSize: vars.fontSize.sm,
  fontFamily: vars.font.mono,
  cursor: 'pointer',
  transition: `border-color ${vars.animation.fast} ease`,
  outline: 'none',
  ':hover': { borderColor: vars.color.borderHover },
  selectors: {
    '&:focus': { borderColor: vars.color.accent },
    '&[data-expanded]': { borderColor: vars.color.accent },
  },
});

export const modelSelectValue = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
});

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
});

export const modelSelectContent = style({
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderFocus}`,
  borderRadius: vars.radius.md,
  padding: `${vars.space.xs} 0`,
  boxShadow: vars.shadow.md,
  zIndex: 500,
  maxHeight: '200px',
  overflowY: 'auto',
});

export const modelSelectListbox = style({
  outline: 'none',
});

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
});

export const modelSelectItemLabel = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
});

export const sendHint = style({
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
});

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
});

export const fontSizeSelect = style({
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textSecondary,
  borderRadius: vars.radius.sm,
  padding: '2px 4px',
  fontSize: '11px',
  fontFamily: vars.font.mono,
  cursor: 'pointer',
  outline: 'none',
  ':focus': {
    borderColor: vars.color.borderFocus,
  },
});

export const jumpToLatest = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  width: '100%',
  padding: `${vars.space.xs} 0`,
  background: `color-mix(in srgb, ${vars.color.accent} 10%, ${vars.color.bgSecondary})`,
  border: 'none',
  borderTop: `1px solid ${vars.color.divider}`,
  color: vars.color.accent,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 18%, ${vars.color.bgSecondary})`,
  },
});

export const progressStrip = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.xxl}`,
  borderTop: `1px solid ${vars.color.divider}`,
  background: `color-mix(in srgb, ${vars.color.accent} 5%, ${vars.color.bgSecondary})`,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  flexShrink: 0,
});

export const progressDot = style({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: vars.color.accent,
  animation: `${pendingDotPulse} 1.2s ease-in-out infinite`,
  flexShrink: 0,
});

export const progressLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: vars.font.mono,
});

export const retryBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `3px ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.accent}`,
  background: 'transparent',
  color: vars.color.accent,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 150ms ease, border-color 150ms ease',
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
    borderColor: vars.color.accentHover,
  },
});


export const emptyState = style({
  margin: 'auto',
  textAlign: 'center',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.sm,
});

// "No project context" toggle pill that lives in the status strip.
// Default state is muted so it disappears into the chrome; the active
// state lights it up so users can tell at a glance whether the next turn
// will run with or without workspace awareness.
export const contextPill = style({
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.full,
  color: vars.color.textSecondary,
  padding: `4px ${vars.space.md}`,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: vars.color.borderHover,
  },
  ':disabled': {
    cursor: 'not-allowed',
    opacity: 0.5,
  },
});

export const contextPillActive = style({
  color: vars.color.accent,
  borderColor: vars.color.accent,
  background: vars.color.bgTertiary,
});

// Subtle border tint when the user is dragging a file over the composer
// area, so they know the drop will be accepted.
export const composerAreaDragOver = style({
  outline: `1px dashed ${vars.color.accent}`,
  outlineOffset: -2,
});

// ── Slash command palette ────────────────────────────────────────────
export const commandPalette = style({
  position: 'relative',
  maxHeight: '240px',
  overflowY: 'auto',
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.xs,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
});

export const commandItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  ':hover': {
    background: vars.color.bgHover,
  },
});

export const commandItemActive = style({
  background: vars.color.bgHover,
});

export const commandName = style({
  fontFamily: vars.font.mono,
  fontWeight: 600,
  color: vars.color.accent,
  flexShrink: 0,
});

export const commandDesc = style({
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const commandSource = style({
  fontSize: '10px',
  color: vars.color.textDisabled,
  flexShrink: 0,
  padding: '1px 4px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
});

// `.copy-btn` is appended via DOM in ComposerMarkdown after each render
// (DOMPurify strips inline handlers, hence the post-render walk). Styled
// globally so the button is positioned absolutely inside the <pre> code
// block. Scoped to the assistantText container to avoid bleeding into
// other markdown surfaces (e.g. ChatPane previously had its own copy of
// these styles in chat.css.ts).
globalStyle(`.${assistantText} pre`, {
  position: 'relative',
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  marginTop: vars.space.sm,
  marginBottom: vars.space.sm,
  overflowX: 'auto',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  lineHeight: '1.6',
});

globalStyle(`.${assistantText} .copy-btn`, {
  position: 'absolute',
  top: 6,
  right: 6,
  padding: '2px 8px',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.body,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  background: vars.color.bgSecondary,
  color: vars.color.textSecondary,
  cursor: 'pointer',
  opacity: 0,
  transition: 'opacity 120ms ease, color 120ms ease, border-color 120ms ease',
});

globalStyle(`.${assistantText} .copy-btn:hover`, {
  color: vars.color.textPrimary,
  borderColor: vars.color.borderHover,
});

// ── Markdown element styles for assistantText innerHTML ──────────────

globalStyle(`.${assistantText} p`, {
  marginBottom: vars.space.sm,
});
globalStyle(`.${assistantText} p:last-child`, {
  marginBottom: 0,
});

globalStyle(`.${assistantText} h1`, {
  fontSize: vars.fontSize.xl,
  fontWeight: 600,
  marginTop: vars.space.lg,
  marginBottom: vars.space.sm,
});
globalStyle(`.${assistantText} h2`, {
  fontSize: vars.fontSize.lg,
  fontWeight: 600,
  marginTop: vars.space.lg,
  marginBottom: vars.space.sm,
});
globalStyle(`.${assistantText} h3`, {
  fontSize: vars.fontSize.md,
  fontWeight: 600,
  marginTop: vars.space.md,
  marginBottom: vars.space.xs,
});
globalStyle(`.${assistantText} h4, .${assistantText} h5, .${assistantText} h6`, {
  fontSize: vars.fontSize.sm,
  fontWeight: 600,
  marginTop: vars.space.md,
  marginBottom: vars.space.xs,
});

globalStyle(`.${assistantText} :not(pre) > code`, {
  background: vars.color.bgTertiary,
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: '0.9em',
});

globalStyle(`.${assistantText} ul, .${assistantText} ol`, {
  paddingLeft: vars.space.xl,
  marginTop: vars.space.xs,
  marginBottom: vars.space.sm,
});
globalStyle(`.${assistantText} ul`, {
  listStyleType: 'disc',
});
globalStyle(`.${assistantText} ol`, {
  listStyleType: 'decimal',
});
globalStyle(`.${assistantText} li`, {
  marginBottom: vars.space.xs,
});
globalStyle(`.${assistantText} li:last-child`, {
  marginBottom: 0,
});

globalStyle(`.${assistantText} a`, {
  color: vars.color.textLink,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
});
globalStyle(`.${assistantText} a:hover`, {
  color: vars.color.accentHover,
});

// Clickable file-path links injected by linkifyFilePaths() post-render.
globalStyle(`.${assistantText} a.file-link`, {
  color: vars.color.accent,
  textDecoration: 'none',
  fontFamily: vars.font.mono,
  fontSize: '0.9em',
  cursor: 'pointer',
  borderBottom: `1px dashed transparent`,
  transition: 'border-color 120ms ease, color 120ms ease',
});
globalStyle(`.${assistantText} a.file-link:hover`, {
  color: vars.color.accentHover,
  borderBottomColor: vars.color.accent,
});

globalStyle(`.${assistantText} blockquote`, {
  borderLeft: `2px solid ${vars.color.accent}`,
  paddingLeft: vars.space.md,
  marginTop: vars.space.sm,
  marginBottom: vars.space.sm,
  color: vars.color.textSecondary,
  fontStyle: 'italic',
});

globalStyle(`.${assistantText} table`, {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: vars.space.sm,
  marginBottom: vars.space.sm,
  fontSize: vars.fontSize.xs,
});
globalStyle(`.${assistantText} th, .${assistantText} td`, {
  border: `1px solid ${vars.color.border}`,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  textAlign: 'left',
});
globalStyle(`.${assistantText} th`, {
  background: vars.color.bgTertiary,
  fontWeight: 600,
});

globalStyle(`.${assistantText} hr`, {
  border: 'none',
  borderTop: `1px solid ${vars.color.divider}`,
  marginTop: vars.space.md,
  marginBottom: vars.space.md,
});

// ── Past Sessions sidebar (lives inside the Composer pane root) ──────
//
// The pane root becomes a flex-row container with two children:
//   1. <sidebar>  — fixed-width 240px when expanded, 0 when collapsed.
//   2. <main>     — status strip + feed + composerArea (the existing UI).
// Each pane keeps its own collapsed-state, persisted via composer_sidebar_collapsed.

// Wrapper used to switch the root from column → row when the sidebar is
// rendered. We can't redefine `root` so we add a sibling class on top of it
// when sidebar mode is active.
export const rootWithSidebar = style({
  flexDirection: 'row',
});

export const sidebar = style({
  display: 'flex',
  flexDirection: 'column',
  width: 240,
  flex: '0 0 240px',
  borderRight: `1px solid ${vars.color.divider}`,
  // Sidebar reads as a SECONDARY surface — slightly darker than the main
  // pane (which is bgPrimary + 3% accent). bgSecondary gives the contrast.
  background: vars.color.bgSecondary,
  overflow: 'hidden',
  transition: `width ${vars.animation.fast} ease, flex-basis ${vars.animation.fast} ease`,
});

export const sidebarCollapsed = style({
  width: 0,
  flexBasis: 0,
  borderRightWidth: 0,
});

// Header row with the "+ New chat" CTA.
export const sidebarHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.divider}`,
});

export const sidebarNewBtn = style({
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  background: 'transparent',
  border: `1px solid ${vars.color.border}`,
  color: vars.color.textPrimary,
  borderRadius: vars.radius.sm,
  padding: `4px ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  ':hover': {
    borderColor: vars.color.accent,
    color: vars.color.accent,
  },
});

// Section label "RECENTS" — uppercase, tracked, muted.
export const sidebarSectionLabel = style({
  padding: `${vars.space.md} ${vars.space.md} ${vars.space.xs}`,
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: vars.color.textDisabled,
});

export const sidebarList = style({
  flex: 1,
  overflowY: 'auto',
  padding: `0 ${vars.space.xs} ${vars.space.sm}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
});

// One past-session row.
export const sidebarRow = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.xs,
  padding: `6px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

// Active row gets a 2px accent stripe down the left edge + bold text.
export const sidebarRowActive = style({
  color: vars.color.accent,
  fontWeight: 600,
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      top: 4,
      bottom: 4,
      width: 2,
      borderRadius: vars.radius.sm,
      background: vars.color.accent,
    },
  },
});

export const sidebarRowPrompt = style({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// Prompt text shown in italic when the row's prompt is empty (first turn
// was attachments-only).
export const sidebarRowPromptEmpty = style({
  fontStyle: 'italic',
  color: vars.color.textDisabled,
});

// Right-aligned timestamp — visible only on hover so the list reads clean.
export const sidebarRowTime = style({
  flex: '0 0 auto',
  fontFamily: vars.font.mono,
  color: vars.color.textDisabled,
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease`,
  selectors: {
    [`${sidebarRow}:hover &`]: { opacity: 1 },
    // Hide the timestamp when the delete button is hovered so the row
    // never looks like it has two right-aligned chips fighting for space.
    [`${sidebarRow}:hover button:hover ~ &, ${sidebarRow}:has(button:hover) &`]: { opacity: 0 },
  },
});

// Hover-revealed delete button. Hidden by default so the Recents list
// reads clean; clicking it triggers the confirm dialog. Sized smaller than
// the row's text to read as a soft secondary action.
export const sidebarRowDelete = style({
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 18,
  marginLeft: 2,
  padding: 0,
  border: 'none',
  background: 'transparent',
  borderRadius: vars.radius.sm,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  opacity: 0,
  transition: `opacity ${vars.animation.fast} ease, color ${vars.animation.fast} ease, background ${vars.animation.fast} ease`,
  selectors: {
    [`${sidebarRow}:hover &`]: { opacity: 1 },
    '&:hover': {
      color: vars.color.danger,
      background: vars.color.bgHover,
    },
  },
});

// Small amber badge shown next to sessions that were interrupted by a crash.
export const sidebarInterruptedBadge = style({
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  background: vars.color.warningMuted,
  color: vars.color.warning,
  fontSize: '9px',
  fontWeight: 600,
  lineHeight: '14px',
  whiteSpace: 'nowrap',
});

// Banner shown at the top of the sidebar when interrupted sessions exist.
export const sidebarInterruptedBanner = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `4px ${vars.space.sm}`,
  margin: `0 ${vars.space.xs} ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  background: vars.color.warningMuted,
  color: vars.color.warning,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  cursor: 'pointer',
  transition: `background ${vars.animation.fast} ease`,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.warning} 20%, transparent)`,
  },
});

export const sidebarEmpty = style({
  margin: 'auto',
  padding: vars.space.lg,
  textAlign: 'center',
  fontStyle: 'italic',
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
});

// Footer with the collapse/expand toggle.
export const sidebarFooter = style({
  borderTop: `1px solid ${vars.color.divider}`,
  padding: vars.space.xs,
  display: 'flex',
});

export const sidebarToggle = style({
  flex: 1,
  background: 'transparent',
  border: 0,
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: `${vars.space.xs} ${vars.space.sm}`,
  fontSize: vars.fontSize.xs,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

// Floating expand button used when the sidebar is collapsed — anchored to
// the left edge of the main column, so the user always has a way back in.
export const sidebarExpandFloating = style({
  position: 'absolute',
  bottom: vars.space.xs,
  left: 0,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderLeft: 0,
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} 4px`,
  borderTopRightRadius: vars.radius.sm,
  borderBottomRightRadius: vars.radius.sm,
  cursor: 'pointer',
  zIndex: 6,
  ':hover': {
    color: vars.color.textPrimary,
    borderColor: vars.color.borderHover,
  },
});

// Wrapper for the main column when the sidebar is rendered — it must
// shrink so the textarea + feed don't overflow the pane.
export const main = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
});

// ── Conflict banner ───────────────────────────────────────────────────
// Amber/warning strip shown above the feed when another Composer pane is
// editing the same repository. Dismissable; reappears when a new conflict
// is detected.
export const conflictBanner = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.xxl}`,
  background: vars.color.warningMuted,
  borderBottom: `1px solid ${vars.color.warning}`,
  color: vars.color.warning,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
});

export const conflictBannerText = style({
  flex: 1,
});

export const conflictAction = style({
  background: 'transparent',
  border: `1px solid ${vars.color.warning}`,
  color: vars.color.warning,
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  ':hover': {
    background: `color-mix(in srgb, ${vars.color.warning} 15%, transparent)`,
  },
});

export const conflictDismiss = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.warning,
  padding: `2px ${vars.space.xs}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  opacity: 0.7,
  ':hover': {
    opacity: 1,
  },
});

// ── Context capacity warning banner ──────────────────────────────────
// Shown above the composer input area when context window usage is high.

export const contextWarningBanner = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.xxl}`,
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  flexShrink: 0,
});

export const contextWarningBannerWarn = style({
  background: vars.color.warningMuted,
  borderBottom: `1px solid ${vars.color.warning}`,
  color: vars.color.warning,
});

export const contextWarningBannerCritical = style({
  background: vars.color.dangerMuted,
  borderBottom: `1px solid ${vars.color.danger}`,
  color: vars.color.danger,
});

export const contextWarningText = style({
  flex: 1,
});

export const contextWarningBtn = style({
  background: 'transparent',
  border: `1px solid currentColor`,
  color: 'inherit',
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  cursor: 'pointer',
  fontSize: vars.fontSize.xs,
  fontWeight: 500,
  flexShrink: 0,
  ':hover': {
    background: `color-mix(in srgb, currentColor 15%, transparent)`,
  },
  ':disabled': {
    cursor: 'not-allowed',
    opacity: 0.5,
  },
});

// ── File preview overlay ──────────────────────────────────────────────

export const filePreviewOverlay = style({
  position: 'absolute',
  inset: 0,
  zIndex: 50,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: vars.space.lg,
});

export const filePreviewPanel = style({
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  width: '100%',
  maxWidth: '90%',
  maxHeight: '90%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
});

export const filePreviewHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderBottom: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
});

export const filePreviewTitle = style({
  fontWeight: 600,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
});

export const filePreviewPath = style({
  flex: 1,
  fontSize: '10px',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const filePreviewClose = style({
  background: 'transparent',
  border: 'none',
  color: vars.color.textSecondary,
  cursor: 'pointer',
  padding: vars.space.xs,
  borderRadius: vars.radius.sm,
  ':hover': {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
});

export const filePreviewBody = style({
  flex: 1,
  overflow: 'auto',
  padding: `${vars.space.lg} ${vars.space.xl}`,
  minHeight: 300,
});

export const filePreviewLoading = style({
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  textAlign: 'center',
  padding: vars.space.xl,
});

export const filePreviewMarkdown = style({
  color: vars.color.textPrimary,
  fontSize: 'inherit',
  lineHeight: 1.7,
  fontFamily: vars.font.body,
});

globalStyle(`.${filePreviewMarkdown} table`, {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: vars.space.sm,
  marginBottom: vars.space.sm,
  fontSize: vars.fontSize.xs,
});
globalStyle(`.${filePreviewMarkdown} th, .${filePreviewMarkdown} td`, {
  border: `1px solid ${vars.color.border}`,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  textAlign: 'left',
});
globalStyle(`.${filePreviewMarkdown} th`, {
  background: vars.color.bgSecondary,
  fontWeight: 600,
});
globalStyle(`.${filePreviewMarkdown} tr:nth-child(even)`, {
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 50%, transparent)`,
});
globalStyle(`.${filePreviewMarkdown} code`, {
  fontFamily: vars.font.mono,
  fontSize: '0.9em',
  padding: '1px 4px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
});
globalStyle(`.${filePreviewMarkdown} pre`, {
  background: vars.color.bgSecondary,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  overflow: 'auto',
  marginTop: vars.space.sm,
  marginBottom: vars.space.sm,
});
globalStyle(`.${filePreviewMarkdown} h1, .${filePreviewMarkdown} h2, .${filePreviewMarkdown} h3`, {
  marginTop: vars.space.lg,
  marginBottom: vars.space.sm,
  color: vars.color.textPrimary,
});
globalStyle(`.${filePreviewMarkdown} hr`, {
  border: 'none',
  borderTop: `1px solid ${vars.color.border}`,
  margin: `${vars.space.lg} 0`,
});

export const filePreviewCode = style({
  margin: 0,
  padding: 0,
  fontSize: 'inherit',
  fontFamily: vars.font.mono,
  color: vars.color.textPrimary,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

// ── Search overlay (Cmd+F / Ctrl+F) ─────────────────────────────────
// Small pill floating at the top-right of the main column, above the feed.
export const searchOverlay = style({
  position: 'absolute',
  top: vars.space.xs,
  right: vars.space.md,
  zIndex: 10,
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.space.xs,
  padding: `4px ${vars.space.sm}`,
  borderRadius: vars.radius.full,
  border: `1px solid ${vars.color.borderFocus}`,
  background: `color-mix(in srgb, ${vars.color.bgSecondary} 92%, transparent)`,
  backdropFilter: 'blur(8px)',
  boxShadow: vars.shadow.md,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
});

export const searchInput = style({
  width: 180,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const searchClose = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  padding: 2,
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
});

globalStyle('mark.search-hit', {
  background: `color-mix(in srgb, ${vars.color.accent} 40%, transparent)`,
  color: 'inherit',
  borderRadius: '2px',
  padding: '0 1px',
});
