// Author: Subash Karki

import { onMount, onCleanup, createEffect, on } from 'solid-js';
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  highlightSpecialChars,
  rectangularSelection,
} from '@codemirror/view';
import { EditorState, type Extension, Compartment } from '@codemirror/state';
import {
  defaultKeymap,
  history,
  historyKeymap,
} from '@codemirror/commands';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import {
  searchKeymap,
  highlightSelectionMatches,
} from '@codemirror/search';
import { phantomThemeExtension } from './cm-theme';

export interface CodeMirrorEditorProps {
  /** The document text. When changed externally the editor updates. */
  content: string;
  /** CM6 language extension (e.g. from loadLanguage). */
  language?: Extension;
  /** When true the editor is not editable. */
  readOnly?: boolean;
  /** Enable soft line wrapping. */
  lineWrapping?: boolean;
  /** Override theme — defaults to the Phantom theme. */
  theme?: Extension;
  /** Fired on every document change originating from user input. */
  onChange?: (value: string) => void;
  /** Fired once after the EditorView is created. */
  onReady?: (view: EditorView) => void;
  /** CSS class applied to the container div. */
  class?: string;
}

export default function CodeMirrorEditor(props: CodeMirrorEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;

  // Compartments for dynamic reconfiguration
  const readOnlyCompartment = new Compartment();
  const lineWrappingCompartment = new Compartment();
  const editableExtrasCompartment = new Compartment();
  const languageCompartment = new Compartment();

  // Track whether the latest doc change came from the editor itself
  let internalUpdate = false;

  /** Extensions that only apply when the editor is editable. */
  function editableExtras(editable: boolean): Extension {
    if (!editable) return [];
    return [highlightActiveLine(), history()];
  }

  function buildExtensions(): Extension[] {
    const exts: Extension[] = [
      lineNumbers(),
      highlightSpecialChars(),
      drawSelection(),
      rectangularSelection(),
      bracketMatching(),
      foldGutter(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      highlightSelectionMatches(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...searchKeymap,
      ]),

      // Dynamic compartments
      readOnlyCompartment.of([
        EditorView.editable.of(!props.readOnly),
        EditorState.readOnly.of(!!props.readOnly),
      ]),
      lineWrappingCompartment.of(
        props.lineWrapping ? EditorView.lineWrapping : [],
      ),
      editableExtrasCompartment.of(editableExtras(!props.readOnly)),

      // Theme (user override or Phantom default)
      props.theme ?? phantomThemeExtension,

      // Language (dynamic via compartment)
      languageCompartment.of(props.language ? [props.language] : []),

      // Change listener
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          internalUpdate = true;
          props.onChange?.(update.state.doc.toString());
        }
      }),
    ];

    return exts;
  }

  onMount(() => {
    if (!containerRef) return;

    const state = EditorState.create({
      doc: props.content,
      extensions: buildExtensions(),
    });

    view = new EditorView({ state, parent: containerRef });
    props.onReady?.(view);
  });

  onCleanup(() => {
    view?.destroy();
    view = undefined;
  });

  // Sync external content changes into the editor
  createEffect(
    on(
      () => props.content,
      (newContent) => {
        if (!view) return;

        // Skip if this change originated from the editor itself
        if (internalUpdate) {
          internalUpdate = false;
          return;
        }

        const currentContent = view.state.doc.toString();
        if (newContent !== currentContent) {
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: newContent,
            },
          });
        }
      },
    ),
  );

  // Toggle readOnly dynamically
  createEffect(
    on(
      () => props.readOnly,
      (ro) => {
        if (!view) return;
        view.dispatch({
          effects: [
            readOnlyCompartment.reconfigure([
              EditorView.editable.of(!ro),
              EditorState.readOnly.of(!!ro),
            ]),
            editableExtrasCompartment.reconfigure(editableExtras(!ro)),
          ],
        });
      },
    ),
  );

  // Update language dynamically
  createEffect(
    on(
      () => props.language,
      (lang) => {
        if (!view) return;
        view.dispatch({
          effects: languageCompartment.reconfigure(lang ? [lang] : []),
        });
      },
    ),
  );

  // Toggle lineWrapping dynamically
  createEffect(
    on(
      () => props.lineWrapping,
      (wrap) => {
        if (!view) return;
        view.dispatch({
          effects: lineWrappingCompartment.reconfigure(
            wrap ? EditorView.lineWrapping : [],
          ),
        });
      },
    ),
  );

  return (
    <div
      ref={containerRef}
      class={props.class}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
}
