// PhantomOS v2 — Lazy Monaco loader with workspace-aware configuration
// Author: Subash Karki
//
// Lazily imports Monaco on first editor mount, configures workers,
// disables semantic validation, and defers TypeScript model sync.
// Call getMonaco() from any editor pane — it returns the same Promise.

import type * as MonacoNS from 'monaco-editor';

let monacoInstance: typeof MonacoNS | null = null;
let loadPromise: Promise<typeof MonacoNS> | null = null;

/**
 * Lazily load and configure Monaco Editor.
 * First call triggers the dynamic import; subsequent calls return the cached instance.
 * Workers are configured as a side-effect of importing monaco-workers.ts.
 */
export const getMonaco = (): Promise<typeof MonacoNS> => {
  if (monacoInstance) return Promise.resolve(monacoInstance);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Side-effect: configure web workers BEFORE Monaco initializes
    await import('./monaco-workers');

    // Dynamic import — Monaco is NOT in the initial bundle (~3MB)
    const monaco = await import('monaco-editor');

    // Disable semantic validation to prevent false-positive red squiggles
    // when we don't have full project type information. Syntax validation stays on.
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    // Defer TypeScript worker model sync — cuts startup CPU
    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(false);
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(false);

    monacoInstance = monaco;
    return monaco;
  })();

  return loadPromise;
};

/**
 * Default editor options shared across all editor panes.
 * Quality-of-life settings ported from v1 + new v2 additions.
 */
export const DEFAULT_EDITOR_OPTIONS: MonacoNS.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  theme: 'phantom-theme',
  fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
  fontSize: 13,
  lineHeight: 20,
  tabSize: 2,
  insertSpaces: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: 'on',
  cursorBlinking: 'smooth',
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
  },
  padding: { top: 8, bottom: 8 },
  renderLineHighlight: 'all',
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
    verticalSliderSize: 8,
    horizontalSliderSize: 8,
  },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  folding: true,
  foldingStrategy: 'indentation',
  wordWrap: 'off',
  // Large file optimizations
  largeFileOptimizations: true,
  maxTokenizationLineLength: 20_000,
  stopRenderingLineAfter: 10_000,
};
