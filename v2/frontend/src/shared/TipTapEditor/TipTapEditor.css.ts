// Author: Subash Karki
import { style, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const editorContainer = style({
	display: 'flex',
	flexDirection: 'column',
	height: '100%',
	overflow: 'hidden',
});

globalStyle(`${editorContainer} .tiptap`, {
	flex: 1,
	overflowY: 'auto',
	outline: 'none',
	padding: vars.space.md,
	fontFamily: vars.font.body,
	fontSize: vars.fontSize.sm,
	color: vars.color.textPrimary,
	lineHeight: '1.7',
	caretColor: vars.color.accent,
});

// --- Paragraphs ---
globalStyle(`${editorContainer} .tiptap p`, {
	margin: '0 0 0.5em 0',
});

// --- Headings ---
globalStyle(`${editorContainer} .tiptap h1, ${editorContainer} .tiptap h2, ${editorContainer} .tiptap h3`, {
	fontFamily: vars.font.display,
	fontWeight: 700,
	color: vars.color.textPrimary,
});

globalStyle(`${editorContainer} .tiptap h1`, {
	fontSize: '1.4em',
	margin: '0.8em 0 0.4em',
});

globalStyle(`${editorContainer} .tiptap h2`, {
	fontSize: '1.2em',
	margin: '0.6em 0 0.3em',
});

globalStyle(`${editorContainer} .tiptap h3`, {
	fontSize: '1.05em',
	margin: '0.5em 0 0.25em',
});

// --- Lists ---
globalStyle(`${editorContainer} .tiptap ul, ${editorContainer} .tiptap ol`, {
	paddingLeft: '1.5em',
	margin: '0.3em 0',
});

globalStyle(`${editorContainer} .tiptap li`, {
	margin: '0.1em 0',
});

globalStyle(`${editorContainer} .tiptap li > p`, {
	margin: '0',
});

// --- Inline code ---
globalStyle(`${editorContainer} .tiptap code`, {
	fontFamily: vars.font.mono,
	background: vars.color.bgHover,
	padding: '1px 4px',
	borderRadius: vars.radius.sm,
	fontSize: '0.9em',
});

// --- Code blocks ---
globalStyle(`${editorContainer} .tiptap pre`, {
	background: vars.color.bgTertiary,
	border: `1px solid ${vars.color.border}`,
	borderRadius: vars.radius.md,
	padding: vars.space.md,
	overflowX: 'auto',
	margin: '0.5em 0',
});

globalStyle(`${editorContainer} .tiptap pre code`, {
	background: 'none',
	padding: '0',
	fontSize: '0.85em',
});

// --- Blockquote ---
globalStyle(`${editorContainer} .tiptap blockquote`, {
	borderLeft: `3px solid ${vars.color.accent}`,
	margin: '0.5em 0',
	paddingLeft: vars.space.md,
	color: vars.color.textSecondary,
});

// --- Inline formatting ---
globalStyle(`${editorContainer} .tiptap strong`, {
	fontWeight: 600,
	color: vars.color.textPrimary,
});

globalStyle(`${editorContainer} .tiptap em`, {
	fontStyle: 'italic',
});

globalStyle(`${editorContainer} .tiptap a`, {
	color: vars.color.accent,
	textDecoration: 'underline',
	cursor: 'pointer',
});

// --- Horizontal rule ---
globalStyle(`${editorContainer} .tiptap hr`, {
	border: 'none',
	borderTop: `1px solid ${vars.color.border}`,
	margin: '1em 0',
});

// --- Task list ---
globalStyle(`${editorContainer} .tiptap ul[data-type="taskList"]`, {
	listStyle: 'none',
	paddingLeft: '0',
});

globalStyle(`${editorContainer} .tiptap li[data-type="taskItem"]`, {
	display: 'flex',
	alignItems: 'flex-start',
	gap: '6px',
});

globalStyle(`${editorContainer} .tiptap li[data-type="taskItem"] > label > input[type="checkbox"]`, {
	appearance: 'none',
	width: '14px',
	height: '14px',
	border: `1.5px solid ${vars.color.border}`,
	borderRadius: '3px',
	cursor: 'pointer',
	marginTop: '3px',
	flexShrink: 0,
	position: 'relative',
	background: 'transparent',
});

globalStyle(`${editorContainer} .tiptap li[data-type="taskItem"] > label > input[type="checkbox"]:checked`, {
	background: vars.color.accent,
	borderColor: vars.color.accent,
});

globalStyle(`${editorContainer} .tiptap li[data-type="taskItem"] > label > input[type="checkbox"]:checked::after`, {
	content: '""',
	position: 'absolute',
	left: '3.5px',
	top: '1px',
	width: '4px',
	height: '8px',
	border: `solid ${vars.color.textInverse}`,
	borderWidth: '0 1.5px 1.5px 0',
	transform: 'rotate(45deg)',
});

// --- Placeholder ---
globalStyle(`${editorContainer} .tiptap p.is-editor-empty:first-child::before`, {
	content: 'attr(data-placeholder)',
	color: vars.color.textDisabled,
	float: 'left',
	height: '0',
	pointerEvents: 'none',
});

// --- Toolbar ---
export const editorToolbar = style({
	display: 'flex',
	alignItems: 'center',
	gap: '2px',
	padding: `${vars.space.xs} ${vars.space.sm}`,
	borderBottom: `1px solid ${vars.color.border}`,
	flexShrink: 0,
});

export const toolbarButton = style({
	width: '28px',
	height: '28px',
	borderRadius: vars.radius.sm,
	border: 'none',
	background: 'transparent',
	color: vars.color.textSecondary,
	cursor: 'pointer',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	transition: `background ${vars.animation.fast}, color ${vars.animation.fast}`,
	selectors: {
		'&:hover': {
			background: vars.color.bgHover,
			color: vars.color.textPrimary,
		},
	},
});

export const toolbarButtonActive = style({
	background: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
	color: vars.color.accent,
	selectors: {
		'&:hover': {
			background: `color-mix(in srgb, ${vars.color.accent} 25%, transparent)`,
			color: vars.color.accent,
		},
	},
});

export const toolbarDivider = style({
	width: '1px',
	height: '16px',
	background: vars.color.border,
	margin: '0 4px',
});
