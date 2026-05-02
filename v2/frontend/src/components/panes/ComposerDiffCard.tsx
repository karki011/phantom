// Author: Subash Karki
// Phantom — Inline Monaco DiffEditor for Composer edit cards.
//
// Replaces the flat EditCardRow with a syntax-highlighted inline diff.
// Uses the same Monaco loader, theme bridge, and language detection as
// the standalone DiffPane, but tuned for the chat-feed context:
//   - Inline diff (not side-by-side) by default — fits chat width
//   - Compact: no minimap, no scrollBeyondLastLine
//   - Auto-height capped at 400px
//   - Accept/Discard buttons in the header
//   - Adapts to auto-accept mode (shows "Applied" badge instead of buttons)
//   - Collapses to header-only when the edit is decided

import { createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js';
import { FileEdit, ChevronDown, ChevronRight, Check, X } from 'lucide-solid';
import type * as MonacoNS from 'monaco-editor';
import { getMonaco } from '@/core/editor/loader';
import { registerPhantomTheme } from '@/core/editor/theme-bridge';
import { detectLanguage } from '@/core/editor/language';
import type { ComposerEditCard } from '@/core/bindings/composer';
import * as styles from './ComposerDiffCard.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ComposerDiffCardProps {
  card: ComposerEditCard;
  autoAccept: boolean;
  onAccept: () => void;
  onDiscard: () => void;
  onOpenDiff: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get or create a Monaco model at the given URI. Reuses existing if found. */
const getOrCreateModel = (
  m: typeof MonacoNS,
  value: string,
  language: string,
  uriPath: string,
): MonacoNS.editor.ITextModel => {
  const uri = m.Uri.parse(uriPath);
  const existing = m.editor.getModel(uri);
  if (existing) {
    if (existing.getValue() !== value) existing.setValue(value);
    const currentLang = existing.getLanguageId();
    if (currentLang !== language) m.editor.setModelLanguage(existing, language);
    return existing;
  }
  return m.editor.createModel(value, language, uri);
};

/** Extract just the filename from a path. */
const basename = (p: string): string => {
  if (!p) return '';
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ComposerDiffCard = (props: ComposerDiffCardProps) => {
  // Container ref — MUST stay empty (Monaco manages its own DOM)
  let monacoContainerRef!: HTMLDivElement;

  // Mutable refs (not signals — these don't drive rendering)
  let diffEditor: MonacoNS.editor.IDiffEditor | undefined;
  let originalModel: MonacoNS.editor.ITextModel | undefined;
  let modifiedModel: MonacoNS.editor.ITextModel | undefined;
  let editorCreated = false;

  // Signals
  const [monaco, setMonaco] = createSignal<typeof MonacoNS | null>(null);
  const [isReady, setIsReady] = createSignal(false);
  const [expanded, setExpanded] = createSignal(true);
  const [sideBySide, setSideBySide] = createSignal(false); // inline by default for chat

  // Derived
  const isPending = () => props.card.status === 'pending';
  const isAccepted = () => props.card.status === 'accepted';
  const isDiscarded = () => props.card.status === 'discarded';
  const language = () => detectLanguage(props.card.path);

  // Stable URIs — namespace by card ID to prevent model collisions
  const origUri = () => `composer-diff://${props.card.id}/original/${props.card.path || 'untitled'}`;
  const modUri = () => `composer-diff://${props.card.id}/modified/${props.card.path || 'untitled'}`;

  // Container state class
  const containerClass = () => {
    const base = styles.diffCardContainer;
    if (isPending() && !props.autoAccept) return `${base} ${styles.diffCardPending}`;
    if (isAccepted()) return `${base} ${styles.diffCardDecidedAccepted}`;
    if (isDiscarded()) return `${base} ${styles.diffCardDecidedDiscarded}`;
    return base;
  };

  // ---------------------------------------------------------------------------
  // Load Monaco
  // ---------------------------------------------------------------------------
  onMount(async () => {
    const m = await getMonaco();
    registerPhantomTheme(m);
    setMonaco(m);
  });

  // ---------------------------------------------------------------------------
  // Create DiffEditor once Monaco + content are ready
  // ---------------------------------------------------------------------------
  createEffect(() => {
    const m = monaco();
    if (!m || editorCreated) return;

    const origContent = props.card.old_content ?? '';
    const modContent = props.card.new_content ?? '';

    // Need at least one side with content to show a diff
    if (!origContent && !modContent) return;

    editorCreated = true;

    // Create diff editor widget (no models yet)
    diffEditor = m.editor.createDiffEditor(monacoContainerRef, {
      automaticLayout: true,
      theme: 'phantom-theme',
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
      fontSize: 12,
      lineHeight: 18,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: sideBySide(),
      enableSplitViewResizing: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      wordWrap: 'on',
      folding: false,
      glyphMargin: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      renderOverviewRuler: false,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollbar: {
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
        alwaysConsumeMouseWheel: false,
      },
      padding: { top: 4, bottom: 4 },
      ignoreTrimWhitespace: false,
      hideUnchangedRegions: {
        enabled: true,
        contextLineCount: 3,
        minimumLineCount: 3,
        revealLineCount: 20,
      },
    });

    // Create models with stable URIs
    const lang = language();
    originalModel = getOrCreateModel(m, origContent, lang, origUri());
    modifiedModel = getOrCreateModel(m, modContent, lang, modUri());

    // Bind models to editor
    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    // Suppress false TS/JS diagnostics
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

    // Auto-height: compute from line count, capped at 400px
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!diffEditor) return;

        // Compute ideal height from modified content line count
        const totalLines = Math.max(
          modifiedModel?.getLineCount() ?? 10,
          originalModel?.getLineCount() ?? 10,
        );
        const lineHeight = 18;
        const padding = 8;
        // Minimum 60px, maximum 400px
        const idealHeight = Math.min(400, Math.max(60, totalLines * lineHeight + padding));
        monacoContainerRef.style.height = `${idealHeight}px`;

        diffEditor.layout();
        setIsReady(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Side-by-side toggle
  // ---------------------------------------------------------------------------
  createEffect(() => {
    const sbs = sideBySide();
    if (diffEditor) {
      diffEditor.updateOptions({ renderSideBySide: sbs });
    }
  });

  // ---------------------------------------------------------------------------
  // ResizeObserver — keep Monaco in sync
  // ---------------------------------------------------------------------------
  onMount(() => {
    const ro = new ResizeObserver(() => diffEditor?.layout());
    ro.observe(monacoContainerRef);
    onCleanup(() => ro.disconnect());
  });

  // ---------------------------------------------------------------------------
  // Theme sync — watch for app theme changes
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
  // Cleanup — dispose models and editor
  // ---------------------------------------------------------------------------
  onCleanup(() => {
    try { diffEditor?.setModel(null); } catch { /* noop */ }
    try { diffEditor?.dispose(); } catch { /* noop */ }
    try { originalModel?.dispose(); } catch { /* noop */ }
    try { modifiedModel?.dispose(); } catch { /* noop */ }
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div class={containerClass()}>
      {/* Header bar */}
      <div class={styles.diffCardHeader}>
        {/* Expand/collapse toggle */}
        <button
          class={styles.diffCardExpandBtn}
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          title={expanded() ? 'Collapse diff' : 'Expand diff'}
        >
          <Show when={expanded()} fallback={<ChevronRight size={12} />}>
            <ChevronDown size={12} />
          </Show>
        </button>

        {/* File icon */}
        <span class={styles.diffCardFileIcon}>
          <FileEdit size={13} />
        </span>

        {/* File path — click to open full diff pane */}
        <span
          class={styles.diffCardFilePath}
          title={props.card.path}
          onClick={props.onOpenDiff}
        >
          {basename(props.card.path)}
        </span>

        {/* Diff stats */}
        <span class={styles.diffCardStats}>
          <span class={styles.diffStatsAdded}>+{props.card.lines_added}</span>
          <span class={styles.diffStatsRemoved}>-{props.card.lines_removed}</span>
        </span>

        {/* Layout toggle */}
        <Show when={expanded()}>
          <button
            class={styles.diffCardToggleBtn}
            type="button"
            onClick={() => setSideBySide((prev) => !prev)}
            title={sideBySide() ? 'Switch to inline diff' : 'Switch to side-by-side diff'}
          >
            {sideBySide() ? 'Inline' : 'Split'}
          </button>
        </Show>

        {/* Action buttons / status badges */}
        <Show when={!props.autoAccept && isPending()}>
          <button class={styles.diffCardAcceptBtn} type="button" onClick={props.onAccept} title="Accept edit">
            <Check size={12} /> Accept
          </button>
          <button class={styles.diffCardDiscardBtn} type="button" onClick={props.onDiscard} title="Discard edit">
            <X size={12} /> Discard
          </button>
        </Show>

        <Show when={props.autoAccept && isPending()}>
          <span class={styles.appliedBadge}>
            <Check size={11} /> Auto-applied
          </span>
        </Show>

        <Show when={isAccepted()}>
          <span class={styles.appliedBadge}>
            <Check size={11} /> Applied
          </span>
        </Show>

        <Show when={isDiscarded()}>
          <span class={styles.discardedBadge}>
            <X size={11} /> Discarded
          </span>
        </Show>
      </div>

      {/* Monaco DiffEditor — container MUST be empty (Monaco manages its own DOM) */}
      <div class={expanded() ? styles.diffCardEditor : styles.diffCardEditorCollapsed}>
        <div ref={monacoContainerRef!} style={{ width: '100%', height: '100%' }} />

        {/* Loading indicator — shown until Monaco creates the diff */}
        <Show when={!isReady() && expanded()}>
          <div class={styles.diffCardLoading}>Loading diff...</div>
        </Show>
      </div>
    </div>
  );
};

export default ComposerDiffCard;
