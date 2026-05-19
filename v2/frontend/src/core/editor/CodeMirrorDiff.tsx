// Author: Subash Karki

import { onMount, onCleanup, createEffect, on } from 'solid-js';
import { MergeView } from '@codemirror/merge';
import { unifiedMergeView } from '@codemirror/merge';
import { EditorView, lineNumbers } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { phantomThemeExtension } from './cm-theme';

export interface CodeMirrorDiffProps {
  /** Original / "before" content. */
  originalContent: string;
  /** Modified / "after" content. */
  modifiedContent: string;
  /** CM6 language extension (applied to both sides). */
  language?: Extension;
  /** Enable soft line wrapping. */
  lineWrapping?: boolean;
  /** If true, render a unified diff instead of side-by-side. */
  unified?: boolean;
  /** Override theme — defaults to the Phantom theme. */
  theme?: Extension;
  /** CSS class applied to the container div. */
  class?: string;
}

/** Shared extensions for both panes (or the unified view). */
function baseExtensions(props: CodeMirrorDiffProps): Extension[] {
  const theme = props.theme ?? phantomThemeExtension;
  return [
    lineNumbers(),
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
    ...(props.lineWrapping ? [EditorView.lineWrapping] : []),
    theme,
    ...(props.language ? [props.language] : []),
  ];
}

export default function CodeMirrorDiff(props: CodeMirrorDiffProps) {
  let containerRef: HTMLDivElement | undefined;
  let mergeView: MergeView | undefined;
  let unifiedView: EditorView | undefined;

  function createSideBySide() {
    if (!containerRef) return;
    destroyViews();

    const exts = baseExtensions(props);

    mergeView = new MergeView({
      a: { doc: props.originalContent, extensions: exts },
      b: { doc: props.modifiedContent, extensions: exts },
      parent: containerRef,
      collapseUnchanged: { margin: 3, minSize: 4 },
      highlightChanges: true,
      gutter: true,
    });
  }

  function createUnified() {
    if (!containerRef) return;
    destroyViews();

    const exts = baseExtensions(props);

    const state = EditorState.create({
      doc: props.modifiedContent,
      extensions: [
        ...exts,
        unifiedMergeView({
          original: props.originalContent,
          highlightChanges: true,
          gutter: true,
        }),
      ],
    });

    unifiedView = new EditorView({ state, parent: containerRef });
  }

  function destroyViews() {
    mergeView?.destroy();
    mergeView = undefined;
    unifiedView?.destroy();
    unifiedView = undefined;
  }

  onMount(() => {
    if (props.unified) {
      createUnified();
    } else {
      createSideBySide();
    }
  });

  onCleanup(destroyViews);

  // Re-create when content, unified mode, or language changes
  createEffect(
    on(
      () => [props.originalContent, props.modifiedContent, props.unified, props.language] as const,
      () => {
        if (!containerRef) return;
        if (props.unified) {
          createUnified();
        } else {
          createSideBySide();
        }
      },
      { defer: true },
    ),
  );

  // Toggle lineWrapping (rebuild is simplest given MergeView's API)
  createEffect(
    on(
      () => props.lineWrapping,
      () => {
        if (!containerRef) return;
        if (props.unified) {
          createUnified();
        } else {
          createSideBySide();
        }
      },
      { defer: true },
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
