// Phantom — Markdown Preview pane styles (vanilla-extract)
// Author: Subash Karki

import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

// ── Container ─────────────────────────────────────────────────────────────────

export const previewContainer = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: vars.color.bgPrimary,
});

export const previewHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.space.sm} ${vars.space.lg}`,
  borderBottom: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  flexShrink: 0,
});

export const previewHeaderTitle = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const previewHeaderActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
});

export const headerButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: `2px ${vars.space.sm}`,
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  color: vars.color.textSecondary,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  cursor: 'pointer',
  transition: 'color 150ms, border-color 150ms',
  selectors: {
    '&:hover': {
      color: vars.color.accent,
      borderColor: vars.color.accent,
    },
  },
});

export const scrollArea = style({
  flex: 1,
  overflow: 'auto',
  padding: `${vars.space.lg} ${vars.space.xl}`,
});

export const loadingState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: vars.color.textSecondary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  gap: vars.space.sm,
});

export const errorState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: vars.color.danger,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
});

// ── Markdown Prose ────────────────────────────────────────────────────────────

export const markdownProse = style({
  lineHeight: '1.7',
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  maxWidth: '860px',
});

// ── Markdown Prose — globalStyle rules for rendered HTML ──────────────────────

// Paragraphs
globalStyle(`${markdownProse} p`, {
  margin: '0 0 12px 0',
  lineHeight: 1.7,
});

// Strong/bold
globalStyle(`${markdownProse} strong`, {
  fontWeight: 600,
  color: vars.color.textPrimary,
});

// Emphasis
globalStyle(`${markdownProse} em`, {
  fontStyle: 'italic',
});

// Links
globalStyle(`${markdownProse} a`, {
  color: vars.color.accent,
  textDecoration: 'none',
  transition: 'color 150ms',
});

globalStyle(`${markdownProse} a:hover`, {
  textDecoration: 'underline',
  color: vars.color.accentHover,
});

// Headings
globalStyle(`${markdownProse} h1, ${markdownProse} h2, ${markdownProse} h3, ${markdownProse} h4, ${markdownProse} h5, ${markdownProse} h6`, {
  fontFamily: vars.font.display,
  fontWeight: 600,
  lineHeight: 1.3,
  color: vars.color.textPrimary,
});

globalStyle(`${markdownProse} h1`, {
  fontSize: vars.fontSize.xxl,
  margin: '0 0 16px',
  paddingBottom: '8px',
  borderBottom: `1px solid ${vars.color.border}`,
});

globalStyle(`${markdownProse} h2`, {
  fontSize: vars.fontSize.xl,
  margin: '24px 0 12px',
  paddingBottom: '6px',
  borderBottom: `1px solid ${vars.color.border}`,
});

globalStyle(`${markdownProse} h3`, {
  fontSize: vars.fontSize.lg,
  margin: '20px 0 8px',
});

globalStyle(`${markdownProse} h4`, {
  fontSize: vars.fontSize.md,
  margin: '16px 0 6px',
});

globalStyle(`${markdownProse} h5, ${markdownProse} h6`, {
  fontSize: vars.fontSize.sm,
  margin: '12px 0 4px',
  color: vars.color.textSecondary,
});

// Lists
globalStyle(`${markdownProse} ul, ${markdownProse} ol`, {
  paddingLeft: '24px',
  margin: '8px 0 12px',
});

globalStyle(`${markdownProse} li`, {
  margin: '4px 0',
  lineHeight: 1.7,
});

globalStyle(`${markdownProse} li > ul, ${markdownProse} li > ol`, {
  margin: '4px 0',
});

// Task lists (GFM checkboxes)
globalStyle(`${markdownProse} input[type="checkbox"]`, {
  marginRight: '6px',
  accentColor: vars.color.accent,
});

// Blockquotes
globalStyle(`${markdownProse} blockquote`, {
  borderLeft: `3px solid ${vars.color.accent}`,
  paddingLeft: '16px',
  margin: '12px 0',
  color: vars.color.textSecondary,
  fontStyle: 'italic',
});

globalStyle(`${markdownProse} blockquote p`, {
  margin: '0 0 8px',
});

// Horizontal rules
globalStyle(`${markdownProse} hr`, {
  border: 'none',
  borderTop: `1px solid ${vars.color.border}`,
  margin: '20px 0',
});

// Tables
globalStyle(`${markdownProse} table`, {
  borderCollapse: 'collapse',
  width: '100%',
  margin: '12px 0',
  fontSize: vars.fontSize.sm,
});

globalStyle(`${markdownProse} th, ${markdownProse} td`, {
  border: `1px solid ${vars.color.border}`,
  padding: '8px 12px',
  textAlign: 'left',
});

globalStyle(`${markdownProse} th`, {
  background: vars.color.bgTertiary,
  fontWeight: 600,
  color: vars.color.textPrimary,
  fontFamily: vars.font.display,
});

globalStyle(`${markdownProse} tr:nth-child(even)`, {
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 50%, transparent)`,
});

// Code blocks
globalStyle(`${markdownProse} pre`, {
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: '14px 16px',
  margin: '12px 0',
  overflowX: 'auto',
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
  lineHeight: 1.6,
  position: 'relative',
});

globalStyle(`${markdownProse} pre code`, {
  background: 'transparent',
  padding: '0',
  border: 'none',
  fontSize: 'inherit',
  fontFamily: 'inherit',
});

// Inline code
globalStyle(`${markdownProse} code`, {
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.sm,
  padding: '1px 6px',
  fontSize: '0.85em',
  fontFamily: vars.font.mono,
  color: vars.color.accent,
});

// Images
globalStyle(`${markdownProse} img`, {
  maxWidth: '100%',
  height: 'auto',
  borderRadius: vars.radius.md,
  margin: '12px 0',
});

// Definition lists (if any)
globalStyle(`${markdownProse} dt`, {
  fontWeight: 600,
  marginTop: '12px',
});

globalStyle(`${markdownProse} dd`, {
  marginLeft: '16px',
  marginBottom: '8px',
});

// Copy button injected via addCopyButtons
globalStyle(`${markdownProse} .copy-btn`, {
  position: 'absolute',
  top: '6px',
  right: '6px',
  padding: '2px 8px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgSecondary,
  color: vars.color.textSecondary,
  fontSize: '10px',
  fontFamily: vars.font.mono,
  cursor: 'pointer',
  opacity: 0,
  transition: 'opacity 150ms',
});

globalStyle(`${markdownProse} pre:hover .copy-btn`, {
  opacity: 1,
});

globalStyle(`${markdownProse} .copy-btn:hover`, {
  color: vars.color.accent,
  borderColor: vars.color.accent,
});
