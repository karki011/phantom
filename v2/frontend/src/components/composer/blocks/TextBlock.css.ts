// Author: Subash Karki
// Port of V1 ComposerPane.css.ts globalStyle rules scoped to .assistantText

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

// Root wrapper — all globalStyle rules target children of this class.
export const assistantText = style({
  fontSize: 'inherit',
  color: vars.color.textPrimary,
  wordBreak: 'break-word',
  lineHeight: 1.6,
});

// Streaming pre (un-parsed markdown shown while streaming)
export const streamingPre = style({
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0,
  fontFamily: 'inherit',
});

// ── Markdown element styles ───────────────────────────────────────────

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

// Inline code pill (not inside <pre>)
globalStyle(`.${assistantText} :not(pre) > code`, {
  background: vars.color.bgTertiary,
  padding: '1px 5px',
  borderRadius: vars.radius.sm,
  fontFamily: vars.font.mono,
  fontSize: '0.9em',
});

// ── Code blocks (<pre><code>) ─────────────────────────────────────────

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

// Copy button appended via DOM after render
globalStyle(`.${assistantText} .copy-btn`, {
  position: 'absolute',
  top: '6px',
  right: '6px',
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

// ── Lists ─────────────────────────────────────────────────────────────

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

// ── Links ─────────────────────────────────────────────────────────────

globalStyle(`.${assistantText} a`, {
  color: vars.color.textLink,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
});
globalStyle(`.${assistantText} a:hover`, {
  color: vars.color.accentHover,
});

// Clickable file-path links injected by linkifyFilePaths()
globalStyle(`.${assistantText} a.file-link`, {
  color: vars.color.accent,
  textDecoration: 'none',
  fontFamily: vars.font.mono,
  fontSize: '0.9em',
  cursor: 'pointer',
  borderBottom: '1px dashed transparent',
  transition: 'border-color 120ms ease, color 120ms ease',
});
globalStyle(`.${assistantText} a.file-link:hover`, {
  color: vars.color.accentHover,
  borderBottomColor: vars.color.accent,
});

// ── Blockquote ────────────────────────────────────────────────────────

globalStyle(`.${assistantText} blockquote`, {
  borderLeft: `2px solid ${vars.color.accent}`,
  paddingLeft: vars.space.md,
  marginTop: vars.space.sm,
  marginBottom: vars.space.sm,
  color: vars.color.textSecondary,
  fontStyle: 'italic',
});

// ── Table ─────────────────────────────────────────────────────────────

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

// ── Horizontal rule ───────────────────────────────────────────────────

globalStyle(`.${assistantText} hr`, {
  border: 'none',
  borderTop: `1px solid ${vars.color.divider}`,
  marginTop: vars.space.md,
  marginBottom: vars.space.md,
});
