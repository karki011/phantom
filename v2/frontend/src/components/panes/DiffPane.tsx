// PhantomOS v2 — Standalone diff viewer pane
// Author: Subash Karki
//
// Rewritten to follow @monaco-editor/react's DiffEditor lifecycle exactly:
//   1. Load Monaco async
//   2. Create diff editor on the container (no models yet)
//   3. Create models with explicit URIs (reuse existing if found)
//   4. Call setModel({ original, modified })
//   5. Force layout() after a frame
//   6. Mark as ready (remove loading overlay)
//
// The loading overlay is rendered OUTSIDE the Monaco container so it never
// interferes with Monaco's own DOM management.

import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import type * as MonacoNS from 'monaco-editor';
import { getMonaco, DEFAULT_EDITOR_OPTIONS } from '@/core/editor/loader';
import { registerPhantomTheme } from '@/core/editor/theme-bridge';
import { detectLanguage } from '@/core/editor/language';
import { writeFileContents } from '@/core/bindings/editor';
import { removeTab, activeTab } from '@/core/panes/signals';
import { openFileInEditor } from '@/core/editor/open-file';
import * as styles from '@/styles/editor.css';

interface DiffPaneProps {
  paneId: string;
  workspaceId?: string;
  filePath?: string;
  originalContent?: string;
  modifiedContent?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  language?: string;
  readOnly?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers — mirror @monaco-editor/react's model creation strategy
// ---------------------------------------------------------------------------

/** Get or create a model at the given URI. Reuses existing model if found. */
const getOrCreateModel = (
  m: typeof MonacoNS,
  value: string,
  language: string,
  uriPath: string,
): MonacoNS.editor.ITextModel => {
  const uri = m.Uri.parse(uriPath);
  const existing = m.editor.getModel(uri);
  if (existing) {
    // Update value and language if the model already exists
    if (existing.getValue() !== value) existing.setValue(value);
    const currentLang = existing.getLanguageId();
    if (currentLang !== language) m.editor.setModelLanguage(existing, language);
    return existing;
  }
  return m.editor.createModel(value, language, uri);
};

const DiffPane = (props: DiffPaneProps) => {
  // ---------------------------------------------------------------------------
  // Refs — Monaco container must be a dedicated div with NO SolidJS children
  // ---------------------------------------------------------------------------
  let monacoContainerRef!: HTMLDivElement;

  // Mutable refs (not signals — these don't drive rendering)
  let diffEditor: MonacoNS.editor.IDiffEditor | undefined;
  let originalModel: MonacoNS.editor.ITextModel | undefined;
  let modifiedModel: MonacoNS.editor.ITextModel | undefined;
  let editorCreated = false;

  // ---------------------------------------------------------------------------
  // Signals
  // ---------------------------------------------------------------------------
  const [monaco, setMonaco] = createSignal<typeof MonacoNS | null>(null);
  const [isReady, setIsReady] = createSignal(false);
  const [sideBySide, setSideBySide] = createSignal(true);
  const [saving, setSaving] = createSignal(false);

  // ---------------------------------------------------------------------------
  // Derived accessors
  // ---------------------------------------------------------------------------
  const filePath = () => (props.filePath as string) ?? '';
  const workspaceId = () => (props.workspaceId as string) ?? '';
  const orig = () => (props.originalContent as string) ?? '';
  const mod = () => (props.modifiedContent as string) ?? '';
  const isReadOnly = () => !!props.readOnly;
  const lang = () => (props.language as string) || detectLanguage(filePath());
  const origLabel = () => (props.originalLabel as string) ?? 'Original';
  const modLabel = () => (props.modifiedLabel as string) ?? 'Modified';
  const fileName = () => filePath().split('/').pop() ?? filePath();

  // Stable URIs for original/modified models — prevents model leaks on re-render.
  // Uses the paneId to namespace, so multiple DiffPanes don't collide.
  const origUri = () => `diff://${props.paneId}/original/${filePath() || 'untitled'}`;
  const modUri = () => `diff://${props.paneId}/modified/${filePath() || 'untitled'}`;

  // ---------------------------------------------------------------------------
  // Step 1: Load Monaco (async)
  // ---------------------------------------------------------------------------
  onMount(async () => {
    console.log('[DiffPane] Loading Monaco...');
    const m = await getMonaco();
    registerPhantomTheme(m);
    console.log('[DiffPane] Monaco loaded');
    setMonaco(m);
  });

  // ---------------------------------------------------------------------------
  // Step 2: Create diff editor + models when Monaco + content are ready
  //
  // This follows @monaco-editor/react's lifecycle:
  //   a) createDiffEditor(container, options)   — editor exists but has no models
  //   b) createModel() x2                       — models exist independently
  //   c) editor.setModel({ original, modified })— binds models to editor
  //   d) layout()                               — ensure correct dimensions
  //   e) setIsReady(true)                       — remove loading overlay
  // ---------------------------------------------------------------------------
  createEffect(() => {
    const m = monaco();
    const original = orig();
    const modified = mod();

    console.log('[DiffPane] effect:', {
      monaco: !!m,
      origLen: original.length,
      modLen: modified.length,
      editorCreated,
    });

    // Need Monaco loaded AND at least one side with content
    if (!m || (!original && !modified)) return;

    if (!editorCreated) {
      editorCreated = true;
      console.log('[DiffPane] Creating diff editor...');

      // Step 2a: Create the diff editor widget — NO models yet
      // Use minimal options first, matching @monaco-editor/react's pattern
      diffEditor = m.editor.createDiffEditor(monacoContainerRef, {
        automaticLayout: true,
        ...DEFAULT_EDITOR_OPTIONS,
        readOnly: isReadOnly(),
        originalEditable: false,
        renderSideBySide: true,
        enableSplitViewResizing: true,
        ignoreTrimWhitespace: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        // Start WITHOUT hideUnchangedRegions to rule it out as a cause
        // Can be re-enabled once basic rendering is confirmed
      });

      console.log('[DiffPane] Diff editor widget created');

      // Step 2b: Create models with explicit URIs
      const language = lang();
      originalModel = getOrCreateModel(m, original, language, origUri());
      modifiedModel = getOrCreateModel(m, modified, language, modUri());

      console.log('[DiffPane] Models created:', {
        origUri: originalModel.uri.toString(),
        modUri: modifiedModel.uri.toString(),
        origLen: originalModel.getValue().length,
        modLen: modifiedModel.getValue().length,
        language,
      });

      // Step 2c: Bind models to the diff editor
      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
      });

      console.log('[DiffPane] Models bound to editor');

      // Step 2d: Force layout after the browser has painted
      // Double-rAF ensures the container has its final dimensions from CSS flexbox
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!diffEditor) return;
          const rect = monacoContainerRef.getBoundingClientRect();
          console.log('[DiffPane] Container dimensions:', rect.width, 'x', rect.height);

          // If container has zero height, CSS flex hasn't resolved — force it
          if (rect.height === 0) {
            console.warn('[DiffPane] Container has zero height — forcing min-height');
            monacoContainerRef.style.minHeight = '400px';
          }

          diffEditor.layout();
          console.log('[DiffPane] layout() called');

          // Step 2e: Mark ready — removes loading overlay
          setIsReady(true);
          console.log('[DiffPane] Ready');
        });
      });

      // Suppress false TS/JS diagnostics on diff models (V1 pattern)
      const diffUris = new Set([
        originalModel.uri.toString(),
        modifiedModel.uri.toString(),
      ]);
      const clearMarkers = () => {
        for (const model of [originalModel, modifiedModel]) {
          if (model) {
            m.editor.setModelMarkers(model, 'typescript', []);
            m.editor.setModelMarkers(model, 'javascript', []);
          }
        }
      };
      clearMarkers();
      m.editor.onDidChangeMarkers((uris) => {
        if (uris.some((u) => diffUris.has(u.toString()))) clearMarkers();
      });
    } else if (diffEditor) {
      // Content updated after creation — refresh models
      console.log('[DiffPane] Updating existing models');
      if (originalModel && originalModel.getValue() !== original) {
        originalModel.setValue(original);
      }
      if (modifiedModel && modifiedModel.getValue() !== modified) {
        modifiedModel.setValue(modified);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // ResizeObserver — keep Monaco in sync with container size changes
  // ---------------------------------------------------------------------------
  onMount(() => {
    const ro = new ResizeObserver(() => diffEditor?.layout());
    ro.observe(monacoContainerRef);
    onCleanup(() => ro.disconnect());
  });

  // ---------------------------------------------------------------------------
  // Theme sync — watch for system/app theme changes
  // ---------------------------------------------------------------------------
  onMount(() => {
    const observer = new MutationObserver(() => {
      const m = monaco();
      if (m) registerPhantomTheme(m);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    onCleanup(() => observer.disconnect());
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const toggleLayout = () => {
    const next = !sideBySide();
    setSideBySide(next);
    diffEditor?.updateOptions({ renderSideBySide: next });
  };

  const handleAccept = async () => {
    if (!diffEditor || saving()) return;
    setSaving(true);
    try {
      const content = diffEditor.getModel()?.modified.getValue();
      if (content !== undefined) {
        const ok = await writeFileContents(workspaceId(), filePath(), content);
        if (ok) closeDiffTab();
      }
    } finally {
      setSaving(false);
    }
  };

  const closeDiffTab = () => {
    const tab = activeTab();
    if (tab) removeTab(tab.id);
  };

  const handleOpenInEditor = () => {
    const fp = filePath();
    const ws = workspaceId();
    if (fp && ws) {
      closeDiffTab();
      openFileInEditor({ workspaceId: ws, filePath: fp });
    }
  };

  // ---------------------------------------------------------------------------
  // Cleanup — dispose models and editor
  // ---------------------------------------------------------------------------
  onCleanup(() => {
    try {
      // Clear model from editor FIRST so it releases references
      diffEditor?.setModel(null);
    } catch {}
    try { diffEditor?.dispose(); } catch {}
    try { originalModel?.dispose(); } catch {}
    try { modifiedModel?.dispose(); } catch {}
  });

  // ---------------------------------------------------------------------------
  // Render
  //
  // CRITICAL: The Monaco container (monacoContainerRef) must be an EMPTY div
  // with no SolidJS children. Monaco manages its own DOM subtree. The loading
  // overlay is rendered as a SIBLING, positioned absolutely over the container
  // via the parent's position:relative.
  // ---------------------------------------------------------------------------
  return (
    <div class={styles.editorWrapper}>
      {/* Toolbar */}
      <div class={styles.diffToolbar}>
        <div class={styles.diffToolbarLeft}>
          <Show when={!isReadOnly()}>
            <button
              class={styles.diffAcceptButton}
              onClick={handleAccept}
              disabled={saving()}
              type="button"
            >
              {saving() ? 'Saving...' : 'Accept'}
            </button>
            <button class={styles.diffRejectButton} onClick={closeDiffTab} type="button">
              Reject
            </button>
          </Show>
        </div>
        <div class={styles.diffToolbarCenter}>
          <span
            style={{ cursor: 'pointer', 'text-decoration': 'underline', 'text-underline-offset': '3px' }}
            onClick={handleOpenInEditor}
            title="Open in editor"
          >
            {fileName()}
          </span>
        </div>
        <div class={styles.diffToolbarRight}>
          <button class={styles.diffToggleButton} onClick={toggleLayout} type="button">
            {sideBySide() ? 'Inline' : 'Side by Side'}
          </button>
        </div>
      </div>

      {/* File labels (side-by-side mode only) */}
      <Show when={sideBySide()}>
        <div class={styles.diffFileLabels}>
          <div class={styles.diffFileLabelOriginal}>
            <span class={styles.diffFileLabelTagOriginal}>Original</span> {origLabel()}
          </div>
          <div class={styles.diffFileLabelModified}>
            <span class={styles.diffFileLabelTagModified}>Modified</span> {modLabel()}
          </div>
        </div>
      </Show>

      {/* Editor area — position:relative wrapper for overlay positioning */}
      <div style={{ position: 'relative', flex: '1', overflow: 'hidden' }}>
        {/* Monaco container — MUST be empty, no SolidJS children */}
        <div
          ref={monacoContainerRef!}
          class={styles.editorContainer}
          style={{ width: '100%', height: '100%' }}
        />

        {/* Loading overlay — SIBLING of Monaco container, not a child */}
        <Show when={!isReady()}>
          <div class={styles.loadingOverlay}>
            <div class={styles.loadingBar} />
            <span class={styles.loadingText}>Loading diff</span>
          </div>
        </Show>
      </div>

      {/* Status bar */}
      <div class={styles.statusBar}>
        <div class={styles.statusBarLeft}>
          <span class={styles.statusBarItem}>
            {sideBySide() ? 'Side by Side' : 'Inline'}
          </span>
        </div>
        <div class={styles.statusBarRight}>
          <span class={styles.statusBarItem}>{lang()}</span>
          <span class={styles.statusBarItem}>UTF-8</span>
        </div>
      </div>
    </div>
  );
};

export default DiffPane;
