// Author: Subash Karki
import { style, globalStyle, keyframes } from '@vanilla-extract/css'
import { vars } from '@/styles/theme.css'

export const proseMirrorRoot = style({})

export const editorContainer = style({
  width: '100%',
  minHeight: 120,
  maxHeight: 300,
  overflowY: 'auto',
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.sm,
  lineHeight: '1.5',
  outline: 'none',
  cursor: 'text',
  transition: 'border-color 150ms ease',
  selectors: {
    '&:focus-within': {
      borderColor: vars.color.borderFocus,
    },
  },
})

// ProseMirror root element
globalStyle(`${editorContainer} .ProseMirror`, {
  outline: 'none',
  minHeight: '80px',
  color: vars.color.textPrimary,
  fontFamily: vars.font.body,
  fontSize: 'inherit',
  lineHeight: '1.5',
})

// Paragraph
globalStyle(`${editorContainer} .ProseMirror p`, {
  margin: 0,
  padding: 0,
})

globalStyle(`${editorContainer} .ProseMirror p + p`, {
  marginTop: '0.4em',
})

// Placeholder — shown when editor has no content
// ProseMirror adds an empty <p><br></p> when blank. We detect this via
// the .ProseMirror element having data-placeholder set and only one empty child.
globalStyle(`${editorContainer} .ProseMirror[data-placeholder]:empty::before, ${editorContainer} .ProseMirror[data-placeholder] > p:only-child:has(> br:only-child)::before`, {
  content: 'attr(data-placeholder)',
  color: vars.color.textDisabled,
  pointerEvents: 'none',
  float: 'left',
  height: 0,
  fontStyle: 'italic',
  opacity: 0.7,
})

// Inherit placeholder from parent for the p > br case
globalStyle(`${editorContainer} .ProseMirror[data-placeholder] > p:only-child:has(> br:only-child)::before`, {
  content: 'attr(data-placeholder) !important',
})

// Fallback for browsers that don't support :has() — use class-based approach
globalStyle(`${editorContainer} .ProseMirror[data-placeholder].ProseMirror-empty::before`, {
  content: 'attr(data-placeholder)',
  color: vars.color.textDisabled,
  pointerEvents: 'none',
  position: 'absolute',
  fontStyle: 'italic',
  opacity: 0.7,
})

// Inline code
globalStyle(`${editorContainer} .ProseMirror code`, {
  fontFamily: vars.font.mono,
  fontSize: '0.88em',
  background: vars.color.bgTertiary,
  borderRadius: '3px',
  padding: '1px 4px',
  color: vars.color.textPrimary,
})

// Code blocks
globalStyle(`${editorContainer} .ProseMirror pre`, {
  background: vars.color.bgTertiary,
  borderRadius: vars.radius.sm,
  padding: `${vars.space.sm} ${vars.space.md}`,
  overflowX: 'auto',
  margin: `${vars.space.xs} 0`,
})

globalStyle(`${editorContainer} .ProseMirror pre code`, {
  background: 'none',
  padding: 0,
  fontSize: '0.85em',
  fontFamily: vars.font.mono,
})

// Headings
globalStyle(`${editorContainer} .ProseMirror h1, ${editorContainer} .ProseMirror h2, ${editorContainer} .ProseMirror h3`, {
  margin: `${vars.space.xs} 0`,
  fontFamily: vars.font.display,
  color: vars.color.textPrimary,
  fontWeight: '600',
})

// Lists
globalStyle(`${editorContainer} .ProseMirror ul, ${editorContainer} .ProseMirror ol`, {
  paddingLeft: '1.4em',
  margin: `${vars.space.xs} 0`,
})

globalStyle(`${editorContainer} .ProseMirror li`, {
  margin: '2px 0',
})

// Blockquote
globalStyle(`${editorContainer} .ProseMirror blockquote`, {
  borderLeft: `3px solid ${vars.color.accent}`,
  paddingLeft: vars.space.md,
  margin: `${vars.space.xs} 0`,
  color: vars.color.textSecondary,
  fontStyle: 'italic',
})

// Bold / Italic
globalStyle(`${editorContainer} .ProseMirror strong`, {
  fontWeight: '600',
  color: vars.color.textPrimary,
})

globalStyle(`${editorContainer} .ProseMirror em`, {
  fontStyle: 'italic',
  color: vars.color.textSecondary,
})

// Links
globalStyle(`${editorContainer} .ProseMirror a`, {
  color: vars.color.accent,
  textDecoration: 'underline',
  cursor: 'pointer',
})

// ProseMirror selection
globalStyle(`${editorContainer} .ProseMirror ::selection`, {
  background: `color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
})

// Table styles (GFM)
globalStyle(`${editorContainer} .ProseMirror table`, {
  borderCollapse: 'collapse',
  width: '100%',
  margin: `${vars.space.xs} 0`,
})

globalStyle(`${editorContainer} .ProseMirror th, ${editorContainer} .ProseMirror td`, {
  border: `1px solid ${vars.color.border}`,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  textAlign: 'left',
})

globalStyle(`${editorContainer} .ProseMirror th`, {
  background: vars.color.bgTertiary,
  fontWeight: '600',
})
