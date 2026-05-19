// Author: Subash Karki

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * Phantom dark theme for CodeMirror 6.
 * Uses CSS custom properties from the vanilla-extract theme contract
 * so it adapts automatically when the user switches themes.
 */
export const phantomTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--phantom-color-editorBg, var(--phantom-color-bgPrimary))',
      color: 'var(--phantom-color-textPrimary)',
      fontFamily: 'var(--phantom-font-mono)',
      fontSize: '13px',
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: 'var(--phantom-font-mono)',
      lineHeight: '1.6',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: 'var(--phantom-color-accent)',
      fontFamily: 'var(--phantom-font-mono)',
      padding: '4px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--phantom-color-accent)',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--phantom-color-editorSelection) !important',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--phantom-color-editorActiveLine, rgba(255, 255, 255, 0.03))',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--phantom-color-editorGutter, var(--phantom-color-bgSecondary))',
      color: 'var(--phantom-color-textDisabled)',
      borderRight: '1px solid var(--phantom-color-border)',
      minWidth: '40px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      color: 'var(--phantom-color-textSecondary)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 12px',
      minWidth: '20px',
    },
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 4px',
      cursor: 'pointer',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--phantom-color-bgTertiary)',
      border: '1px solid var(--phantom-color-border)',
      color: 'var(--phantom-color-textDisabled)',
      borderRadius: '3px',
      padding: '0 4px',
      margin: '0 4px',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--phantom-color-bgTertiary)',
      border: '1px solid var(--phantom-color-border)',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: 'var(--phantom-color-bgActive)',
      },
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 200, 0, 0.3)',
      borderRadius: '2px',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(255, 200, 0, 0.5)',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      outline: '1px solid var(--phantom-color-accent)',
      borderRadius: '2px',
    },
    '.cm-panels': {
      backgroundColor: 'var(--phantom-color-bgSecondary)',
      color: 'var(--phantom-color-textPrimary)',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid var(--phantom-color-border)',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid var(--phantom-color-border)',
    },
    '.cm-panel.cm-search': {
      padding: '4px 8px',
    },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
      fontFamily: 'var(--phantom-font-body)',
      fontSize: '12px',
    },
    '.cm-panel.cm-search input': {
      backgroundColor: 'var(--phantom-color-bgTertiary)',
      color: 'var(--phantom-color-textPrimary)',
      border: '1px solid var(--phantom-color-border)',
      borderRadius: '4px',
      padding: '2px 6px',
    },
    '.cm-panel.cm-search button': {
      backgroundColor: 'var(--phantom-color-bgTertiary)',
      color: 'var(--phantom-color-textPrimary)',
      border: '1px solid var(--phantom-color-border)',
      borderRadius: '4px',
      cursor: 'pointer',
    },
  },
  { dark: true },
);

/**
 * Syntax highlighting colors — Material-style palette that
 * works well across all Phantom themes.
 */
export const phantomHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#c792ea' },
  { tag: tags.operator, color: '#89ddff' },
  { tag: tags.special(tags.string), color: '#f07178' },
  { tag: tags.string, color: '#c3e88d' },
  { tag: tags.number, color: '#f78c6c' },
  { tag: tags.bool, color: '#ff5370' },
  { tag: tags.null, color: '#ff5370' },
  { tag: tags.comment, color: '#546e7a', fontStyle: 'italic' },
  { tag: tags.lineComment, color: '#546e7a', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#546e7a', fontStyle: 'italic' },
  { tag: tags.docComment, color: '#6a7a8a', fontStyle: 'italic' },
  { tag: tags.function(tags.variableName), color: '#82aaff' },
  { tag: tags.definition(tags.variableName), color: '#f07178' },
  { tag: tags.variableName, color: '#eeffff' },
  { tag: tags.typeName, color: '#ffcb6b' },
  { tag: tags.className, color: '#ffcb6b' },
  { tag: tags.propertyName, color: '#f07178' },
  { tag: tags.tagName, color: '#f07178' },
  { tag: tags.attributeName, color: '#c792ea' },
  { tag: tags.attributeValue, color: '#c3e88d' },
  { tag: tags.regexp, color: '#89ddff' },
  { tag: tags.escape, color: '#89ddff' },
  { tag: tags.meta, color: '#546e7a' },
  { tag: tags.punctuation, color: '#89ddff' },
  { tag: tags.bracket, color: '#89ddff' },
  { tag: tags.separator, color: '#89ddff' },
  { tag: tags.angleBracket, color: '#89ddff' },
  { tag: tags.self, color: '#f07178' },
  { tag: tags.namespace, color: '#ffcb6b' },
  { tag: tags.heading, color: '#c792ea', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: '#82aaff', textDecoration: 'underline' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.invalid, color: '#ff5370', textDecoration: 'underline wavy' },
]);

/** Combined theme + highlight style — use as a single extension. */
export const phantomThemeExtension = [
  phantomTheme,
  syntaxHighlighting(phantomHighlightStyle),
];
