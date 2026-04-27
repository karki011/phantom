// PhantomOS v2 — Monaco Editor pane with multi-file tab support
// Author: Subash Karki
//
// Integrates with the pane system (PaneRegistry, PaneContainer) and
// supports: lazy Monaco loading, file tab bar, dirty tracking, Cmd+S save,
// single-instance file enforcement via the open-file registry,
// and reactive theme sync.

import { createSignal, createEffect, onMount, onCleanup, Show, For, on } from 'solid-js';
import { ContextMenu } from '@kobalte/core/context-menu';
import { Clipboard } from 'lucide-solid';
import type * as MonacoNS from 'monaco-editor';
import { getMonaco, DEFAULT_EDITOR_OPTIONS } from '@/core/editor/loader';
import { registerPhantomTheme, buildMonacoTheme } from '@/core/editor/theme-bridge';
import { detectLanguage } from '@/core/editor/language';
import { readFileContents, writeFileContents } from '@/core/bindings/editor';
import { getPreference } from '@/core/bindings';
import { BlameManager } from '@/core/editor/blame';
import {
  registerOpenFile,
  unregisterOpenFile,
  unregisterAllFilesForPane,
  decrementTabIndicesAfter,
  getOpenFileEntry,
} from '@/core/editor/open-file-registry';
import type { EditorFileState, EditorPaneState } from '@/core/editor/types';
import { activeTab, activePaneId, setActivePaneInTab, closePane, removeTab, tabs } from '@/core/panes/signals';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { setSelectedFile, setRevealFilePath, setRightSidebarTab } from '@/core/signals/files';
import * as styles from '@/styles/editor.css';
import * as ctxStyles from '@/styles/right-sidebar.css';

// ---------------------------------------------------------------------------
// Diff review mode types
// ---------------------------------------------------------------------------

interface DiffReviewState {
  /** Whether diff mode is active */
  active: boolean;
  /** Side-by-side (true) or inline (false) */
  sideBySide: boolean;
}

interface EditorPaneProps {
  paneId: string;
  /** Initial file path from addTabWithData (first file to open) */
  filePath?: string;
  /** Initial workspace from addTabWithData */
  workspaceId?: string;
  /** Optional line to jump to */
  line?: number;
  /** Optional column to jump to */
  column?: number;
  /** Passed by PaneContainer — all pane data */
  [key: string]: unknown;
}

export default function EditorPane(props: EditorPaneProps) {
  let editorContainerRef!: HTMLDivElement;
  let editorInstance: MonacoNS.editor.IStandaloneCodeEditor | undefined;
  let diffEditorInstance: MonacoNS.editor.IDiffEditor | undefined;
  let monacoRef: typeof MonacoNS | undefined;
  let blameManager: BlameManager | undefined;

  const [loading, setLoading] = createSignal(true);
  const [files, setFiles] = createSignal<EditorFileState[]>([]);
  const [activeFileIndex, setActiveFileIndex] = createSignal(0);
  const [cursorLine, setCursorLine] = createSignal(1);
  const [cursorCol, setCursorCol] = createSignal(1);
  const [diffReview, setDiffReview] = createSignal<DiffReviewState>({
    active: false,
    sideBySide: true,
  });

  // The workspace context — prefer explicit prop, fall back to active worktree
  const workspaceId = () =>
    (props.workspaceId as string) || activeWorktreeId() || '';

  // Derive the worktree root path for relative path computation
  const worktreeRootPath = (): string => {
    const wtId = workspaceId();
    if (!wtId) return '';
    for (const workspaces of Object.values(worktreeMap())) {
      const match = workspaces.find((w) => w.id === wtId);
      if (match) return match.worktree_path ?? '';
    }
    return '';
  };

  // ---------------------------------------------------------------------------
  // Context menu: Copy file path actions
  // ---------------------------------------------------------------------------

  const registerCopyPathActions = (editor: MonacoNS.editor.IStandaloneCodeEditor): void => {
    editor.addAction({
      id: 'phantom.copyAbsolutePath',
      label: 'Copy Absolute Path',
      contextMenuGroupId: 'filePath',
      contextMenuOrder: 1,
      run: () => {
        const file = activeFile();
        if (!file) return;
        void navigator.clipboard.writeText(file.filePath);
      },
    });

    editor.addAction({
      id: 'phantom.copyRelativePath',
      label: 'Copy Relative Path',
      contextMenuGroupId: 'filePath',
      contextMenuOrder: 2,
      run: () => {
        const file = activeFile();
        if (!file) return;
        const root = worktreeRootPath();
        const relativePath = root && file.filePath.startsWith(root)
          ? file.filePath.slice(root.length).replace(/^\//, '')
          : file.filePath;
        void navigator.clipboard.writeText(relativePath);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Monaco initialization
  // ---------------------------------------------------------------------------

  onMount(async () => {
    monacoRef = await getMonaco();
    registerPhantomTheme(monacoRef);

    // Load saved editor preferences before creating the instance
    const [savedFontSize, savedLineHeight] = await Promise.all([
      getPreference('editor_fontSize'),
      getPreference('editor_lineHeight'),
    ]);

    editorInstance = monacoRef.editor.create(editorContainerRef, {
      ...DEFAULT_EDITOR_OPTIONS,
      ...(savedFontSize ? { fontSize: Number(savedFontSize) } : {}),
      ...(savedLineHeight ? { lineHeight: Number(savedLineHeight) } : {}),
      value: '',
      language: 'plaintext',
    });

    // Cursor position tracking for status bar
    editorInstance.onDidChangeCursorPosition((e) => {
      setCursorLine(e.position.lineNumber);
      setCursorCol(e.position.column);
    });

    // Initialize git blame integration
    blameManager = new BlameManager(monacoRef, editorInstance);
    blameManager.registerToggleAction();

    // Register copy path context menu actions
    registerCopyPathActions(editorInstance);

    setLoading(false);

    // Force layout after Monaco is created
    requestAnimationFrame(() => editorInstance?.layout());

    // Open the initial file if available at mount time
    const initialPath = props.filePath as string;
    console.log('[EditorPane] onMount, filePath:', JSON.stringify(initialPath));
    if (initialPath) {
      await openFileTab(initialPath, props.line as number, props.column as number);
      requestAnimationFrame(() => editorInstance?.layout());
    }
  });

  // ---------------------------------------------------------------------------
  // Reactive: open file when props.filePath arrives late (store propagation)
  // ---------------------------------------------------------------------------

  createEffect(on(
    () => props.filePath as string,
    (filePath) => {
      if (!filePath || loading()) return;
      if (files().length > 0) return;
      console.log('[EditorPane] reactive filePath arrived:', filePath);
      void openFileTab(filePath, props.line as number, props.column as number).then(() => {
        requestAnimationFrame(() => editorInstance?.layout());
      });
    },
  ));

  // ---------------------------------------------------------------------------
  // ResizeObserver — refit editor when pane resizes
  // ---------------------------------------------------------------------------

  onMount(() => {
    const ro = new ResizeObserver(() => {
      editorInstance?.layout();
    });
    ro.observe(editorContainerRef);
    onCleanup(() => ro.disconnect());
  });

  // ---------------------------------------------------------------------------
  // Editor settings sync — live-apply font size / line height from Settings
  // ---------------------------------------------------------------------------

  onMount(() => {
    const handleSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && editorInstance) {
        editorInstance.updateOptions(detail);
      }
    };
    window.addEventListener('phantom:editor-settings-changed', handleSettingsChanged);
    onCleanup(() => window.removeEventListener('phantom:editor-settings-changed', handleSettingsChanged));
  });

  // ---------------------------------------------------------------------------
  // Theme sync — re-register Monaco theme when app theme changes
  // ---------------------------------------------------------------------------

  onMount(() => {
    const observer = new MutationObserver(() => {
      if (monacoRef) {
        registerPhantomTheme(monacoRef);
        editorInstance?.updateOptions({ theme: 'phantom-theme' });
      }
    });
    // Watch for class changes on <html> (theme class swaps)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    onCleanup(() => observer.disconnect());
  });

  // ---------------------------------------------------------------------------
  // Event listeners: open-file and goto from other entry points
  // ---------------------------------------------------------------------------

  onMount(() => {
    const handleOpenFile = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.paneId !== props.paneId) return;
      void openFileTab(detail.filePath, detail.line, detail.column);
    };

    const handleGoto = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.paneId !== props.paneId) return;
      // Find and switch to the file tab, then jump to line
      const idx = files().findIndex((f) => f.filePath === detail.filePath);
      if (idx >= 0) {
        switchToFile(idx);
        jumpToLine(detail.line, detail.column ?? 1);
      }
    };

    const handleToggleBlame = () => {
      // Only respond if this pane is the active one
      if (activePaneId() !== props.paneId) return;
      blameManager?.toggleFullBlame();
    };

    window.addEventListener('phantom:editor-open-file', handleOpenFile);
    window.addEventListener('phantom:editor-goto', handleGoto);
    window.addEventListener('phantom:editor-toggle-blame', handleToggleBlame);
    onCleanup(() => {
      window.removeEventListener('phantom:editor-open-file', handleOpenFile);
      window.removeEventListener('phantom:editor-goto', handleGoto);
      window.removeEventListener('phantom:editor-toggle-blame', handleToggleBlame);
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard: Cmd+S save, Cmd+W close tab
  // ---------------------------------------------------------------------------

  onMount(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      // Only intercept when this pane is focused
      if (activePaneId() !== props.paneId) return;

      if (meta && e.key === 's') {
        e.preventDefault();
        void saveActiveFile();
        return;
      }

      if (meta && e.key === 'w') {
        e.preventDefault();
        const tab = tabs().find((t) => props.paneId in t.panes);
        if (tab) removeTab(tab.id);
        return;
      }
    };

    document.addEventListener('keydown', handleKeydown);
    onCleanup(() => document.removeEventListener('keydown', handleKeydown));
  });

  // ---------------------------------------------------------------------------
  // File tab management
  // ---------------------------------------------------------------------------

  const openFileTab = async (filePath: string, line?: number, column?: number): Promise<void> => {
    if (!monacoRef || !editorInstance) return;

    // Check if already open in THIS pane
    const existingIdx = files().findIndex((f) => f.filePath === filePath);
    if (existingIdx >= 0) {
      switchToFile(existingIdx);
      if (line) jumpToLine(line, column ?? 1);
      return;
    }

    // Check if already open in ANOTHER pane (single-instance enforcement)
    const existingEntry = getOpenFileEntry(filePath);
    if (existingEntry && existingEntry.paneId !== props.paneId) {
      // Focus the other pane instead
      setActivePaneInTab(existingEntry.paneId);
      if (line) {
        window.dispatchEvent(new CustomEvent('phantom:editor-goto', {
          detail: { paneId: existingEntry.paneId, filePath, line, column: column ?? 1 },
        }));
      }
      return;
    }

    // Read file content from Go backend
    const content = await readFileContents(workspaceId(), filePath);
    const language = detectLanguage(filePath);
    const label = filePath.split('/').pop() ?? filePath;

    // Create Monaco model
    const uri = monacoRef.Uri.file(filePath);
    let model = monacoRef.editor.getModel(uri);
    if (!model) {
      model = monacoRef.editor.createModel(content, language, uri);
    } else {
      model.setValue(content);
    }

    // Save current view state before switching
    if (files().length > 0) {
      saveCurrentViewState();
    }

    // Add to files list
    const newFile: EditorFileState = {
      filePath,
      workspaceId: workspaceId(),
      language,
      label,
      dirty: false,
      originalContent: content,
      viewState: null,
    };

    const newIndex = files().length;
    setFiles((prev) => [...prev, newFile]);
    setActiveFileIndex(newIndex);

    // Register in global open-file registry
    registerOpenFile(filePath, {
      paneId: props.paneId,
      tabIndex: newIndex,
      workspaceId: workspaceId(),
    });

    // Set model on editor
    editorInstance.setModel(model);

    // Wire dirty tracking for this model
    model.onDidChangeContent(() => {
      const idx = files().findIndex((f) => f.filePath === filePath);
      if (idx < 0) return;
      const current = model!.getValue();
      const isDirty = current !== files()[idx].originalContent;
      if (files()[idx].dirty !== isDirty) {
        setFiles((prev) => prev.map((f, i) => i === idx ? { ...f, dirty: isDirty } : f));
      }
    });

    // Jump to line if specified
    if (line) {
      jumpToLine(line, column ?? 1);
    }

    editorInstance.focus();

    // Sync file tree selection in right sidebar
    setSelectedFile(filePath);
    setRevealFilePath(filePath);
    setRightSidebarTab('files');

    // Activate git blame for this file (async, non-blocking)
    void blameManager?.activate(workspaceId(), filePath);
  };

  const switchToFile = (index: number): void => {
    if (!monacoRef || !editorInstance) return;
    if (index < 0 || index >= files().length) return;
    if (index === activeFileIndex()) return;

    // Save current view state
    saveCurrentViewState();

    const targetFile = files()[index];
    const uri = monacoRef.Uri.file(targetFile.filePath);
    const model = monacoRef.editor.getModel(uri);
    if (!model) return;

    editorInstance.setModel(model);

    // Restore view state
    if (targetFile.viewState) {
      editorInstance.restoreViewState(targetFile.viewState);
    }

    setActiveFileIndex(index);
    editorInstance.focus();

    // Sync file tree selection in right sidebar
    setSelectedFile(targetFile.filePath);
    setRevealFilePath(targetFile.filePath);
    setRightSidebarTab('files');

    // Re-activate blame for the switched-to file
    void blameManager?.activate(targetFile.workspaceId, targetFile.filePath);
  };

  const closeOtherTabs = (keepIndex: number): void => {
    if (!monacoRef) return;
    const fileList = files();
    const keepFile = fileList[keepIndex];
    if (!keepFile) return;

    for (let j = 0; j < fileList.length; j++) {
      if (j === keepIndex) continue;
      const f = fileList[j];
      const uri = monacoRef.Uri.file(f.filePath);
      monacoRef.editor.getModel(uri)?.dispose();
      unregisterOpenFile(f.filePath);
    }

    setFiles([keepFile]);
    setActiveFileIndex(0);

    registerOpenFile(keepFile.filePath, {
      paneId: props.paneId,
      tabIndex: 0,
      workspaceId: workspaceId(),
    });

    const uri = monacoRef.Uri.file(keepFile.filePath);
    const model = monacoRef.editor.getModel(uri);
    if (model) {
      editorInstance?.setModel(model);
      if (keepFile.viewState) editorInstance?.restoreViewState(keepFile.viewState);
    }
    editorInstance?.focus();

    setSelectedFile(keepFile.filePath);
    setRevealFilePath(keepFile.filePath);
  };

  const closeFileTab = (index: number): void => {
    if (!monacoRef) return;
    const fileList = files();
    if (index < 0 || index >= fileList.length) return;

    const file = fileList[index];

    // TODO: Prompt for unsaved changes (Wave 4 polish)

    // Dispose the Monaco model
    const uri = monacoRef.Uri.file(file.filePath);
    const model = monacoRef.editor.getModel(uri);
    model?.dispose();

    // Remove from registry
    unregisterOpenFile(file.filePath);
    decrementTabIndicesAfter(props.paneId, index);

    // Remove from files list
    const newFiles = fileList.filter((_, i) => i !== index);
    setFiles(newFiles);

    // Close the entire editor tab if no files remain
    if (newFiles.length === 0) {
      const tab = tabs().find((t) => props.paneId in t.panes);
      if (tab) removeTab(tab.id);
      return;
    } else {
      const newIndex = Math.min(index, newFiles.length - 1);
      const targetFile = newFiles[newIndex];
      const uri = monacoRef.Uri.file(targetFile.filePath);
      const model = monacoRef.editor.getModel(uri);
      if (model) {
        editorInstance?.setModel(model);
        if (targetFile.viewState) {
          editorInstance?.restoreViewState(targetFile.viewState);
        }
      }
      setActiveFileIndex(newIndex);
      editorInstance?.focus();

      setSelectedFile(targetFile.filePath);
      setRevealFilePath(targetFile.filePath);
    }
  };

  const saveCurrentViewState = (): void => {
    const idx = activeFileIndex();
    if (idx < 0 || idx >= files().length) return;
    const viewState = editorInstance?.saveViewState() ?? null;
    setFiles((prev) => prev.map((f, i) => i === idx ? { ...f, viewState } : f));
  };

  const jumpToLine = (line: number, column: number): void => {
    if (!editorInstance) return;
    editorInstance.revealLineInCenter(line);
    editorInstance.setPosition({ lineNumber: line, column });
    editorInstance.focus();
  };

  // ---------------------------------------------------------------------------
  // Diff review mode — inline review of dirty files
  // ---------------------------------------------------------------------------

  const enterDiffReview = (): void => {
    if (!monacoRef || !editorInstance) return;
    const file = activeFile();
    if (!file) return;

    // Save the normal editor view state before switching
    saveCurrentViewState();

    // Hide the normal editor
    editorInstance.getDomNode()?.style.setProperty('display', 'none');

    // Create diff editor in the same container
    diffEditorInstance = monacoRef.editor.createDiffEditor(editorContainerRef, {
      ...DEFAULT_EDITOR_OPTIONS,
      readOnly: false,
      originalEditable: false,
      renderSideBySide: diffReview().sideBySide,
      enableSplitViewResizing: true,
      ignoreTrimWhitespace: false,
    });

    const originalModel = monacoRef.editor.createModel(
      file.originalContent,
      file.language,
    );

    // Use the existing model from the editor (preserves undo history)
    const uri = monacoRef.Uri.file(file.filePath);
    const modifiedModel = monacoRef.editor.getModel(uri);

    if (modifiedModel) {
      diffEditorInstance.setModel({
        original: originalModel,
        modified: modifiedModel,
      });
    }

    setDiffReview({ active: true, sideBySide: diffReview().sideBySide });
    requestAnimationFrame(() => diffEditorInstance?.layout());
  };

  const exitDiffReview = (): void => {
    if (!diffEditorInstance || !editorInstance) return;

    // Dispose the original model (the modified model is the editor's model — keep it)
    const model = diffEditorInstance.getModel();
    model?.original?.dispose();

    // Dispose the diff editor
    diffEditorInstance.dispose();
    diffEditorInstance = undefined;

    // Show the normal editor again
    editorInstance.getDomNode()?.style.setProperty('display', '');

    setDiffReview({ active: false, sideBySide: diffReview().sideBySide });
    requestAnimationFrame(() => editorInstance?.layout());
    editorInstance.focus();
  };

  const toggleDiffLayout = (): void => {
    const next = !diffReview().sideBySide;
    setDiffReview({ active: true, sideBySide: next });
    diffEditorInstance?.updateOptions({ renderSideBySide: next });
  };

  const acceptDiffChanges = async (): Promise<void> => {
    // Save modified content to disk, then exit diff mode
    await saveActiveFile();
    exitDiffReview();
  };

  const rejectDiffChanges = (): void => {
    if (!monacoRef || !editorInstance) return;
    const file = activeFile();
    if (!file) return;

    // Revert the model to originalContent
    const uri = monacoRef.Uri.file(file.filePath);
    const model = monacoRef.editor.getModel(uri);
    if (model) {
      model.setValue(file.originalContent);
    }

    // Mark as clean
    setFiles((prev) => prev.map((f, i) =>
      i === activeFileIndex() ? { ...f, dirty: false } : f,
    ));

    exitDiffReview();
  };

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const saveActiveFile = async (): Promise<void> => {
    const file = files()[activeFileIndex()];
    if (!file || !editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const content = model.getValue();
    const success = await writeFileContents(file.workspaceId, file.filePath, content);

    if (success) {
      // Update the original content baseline — file is now clean
      setFiles((prev) => prev.map((f, i) =>
        i === activeFileIndex() ? { ...f, dirty: false, originalContent: content } : f,
      ));

      // Invalidate blame cache so next activation re-fetches fresh data
      blameManager?.invalidateCache(file.workspaceId, file.filePath);
    }
  };

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  onCleanup(() => {
    // Clean up blame manager
    blameManager?.dispose();

    // Unregister all files from the global registry
    unregisterAllFilesForPane(props.paneId);

    // Clean up diff editor if active
    if (diffEditorInstance) {
      const model = diffEditorInstance.getModel();
      model?.original?.dispose();
      diffEditorInstance.dispose();
    }

    // Dispose all Monaco models owned by this pane
    if (monacoRef) {
      for (const file of files()) {
        const uri = monacoRef.Uri.file(file.filePath);
        const model = monacoRef.editor.getModel(uri);
        model?.dispose();
      }
    }

    // Dispose the editor instance
    editorInstance?.dispose();
  });

  // ---------------------------------------------------------------------------
  // Active file derived signals
  // ---------------------------------------------------------------------------

  const activeFile = () => files()[activeFileIndex()] ?? null;
  const activeLanguage = () => activeFile()?.language ?? 'plaintext';
  const hasFiles = () => files().length > 0;

  // ---------------------------------------------------------------------------
  // File tab context menu helpers
  // ---------------------------------------------------------------------------

  const absolutePathFor = (filePath: string): string => {
    const root = worktreeRootPath();
    if (root && !filePath.startsWith('/')) return `${root}/${filePath}`;
    return filePath;
  };

  const relativePathFor = (filePath: string): string => {
    const root = worktreeRootPath();
    const abs = absolutePathFor(filePath);
    return root && abs.startsWith(root)
      ? abs.slice(root.length).replace(/^\//, '')
      : filePath;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div class={styles.editorWrapper}>
      {/* File tab bar — only show when 2+ files open (single file uses pane header) */}
      <Show when={files().length > 0 && !diffReview().active}>
        <div class={styles.fileTabBar}>
          <For each={files()}>
            {(file, i) => (
              <ContextMenu>
                <ContextMenu.Trigger
                  as="button"
                  class={styles.fileTab}
                  data-active={i() === activeFileIndex()}
                  onClick={() => switchToFile(i())}
                  title={file.filePath}
                  type="button"
                >
                  <span class={styles.fileTabLabel}>{file.label}</span>
                  <Show when={file.dirty}>
                    <span class={styles.dirtyDot} />
                  </Show>
                  <span
                    class={styles.fileTabClose}
                    onClick={(e: MouseEvent) => { e.stopPropagation(); closeFileTab(i()); }}
                  >
                    &times;
                  </span>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content class={ctxStyles.contextMenuContent}>
                    <ContextMenu.Item class={ctxStyles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(file.label); }}>
                      <Clipboard size={13} />
                      Copy File Name
                    </ContextMenu.Item>
                    <ContextMenu.Item class={ctxStyles.contextMenuItem} onSelect={() => { const rel = relativePathFor(file.filePath); navigator.clipboard.writeText(rel); }}>
                      <Clipboard size={13} />
                      Copy Relative Path
                    </ContextMenu.Item>
                    <ContextMenu.Item class={ctxStyles.contextMenuItem} onSelect={() => { const abs = absolutePathFor(file.filePath); navigator.clipboard.writeText(abs); }}>
                      <Clipboard size={13} />
                      Copy Absolute Path
                    </ContextMenu.Item>
                    <ContextMenu.Separator class={ctxStyles.contextMenuSeparator} />
                    <ContextMenu.Item class={ctxStyles.contextMenuItem} onSelect={() => closeFileTab(i())}>
                      Close
                    </ContextMenu.Item>
                    <ContextMenu.Item class={ctxStyles.contextMenuItem} disabled={files().length <= 1} onSelect={() => closeOtherTabs(i())}>
                      Close Others
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu>
            )}
          </For>
        </div>
      </Show>

      {/* Diff review toolbar — shown when reviewing changes */}
      <Show when={diffReview().active}>
        <div class={styles.diffToolbar}>
          <div class={styles.diffToolbarLeft}>
            <button
              class={styles.diffAcceptButton}
              onClick={acceptDiffChanges}
              type="button"
            >
              Accept
            </button>
            <button
              class={styles.diffRejectButton}
              onClick={rejectDiffChanges}
              type="button"
            >
              Reject
            </button>
          </div>

          <div class={styles.diffToolbarCenter}>
            <span>Reviewing: {activeFile()?.label}</span>
          </div>

          <div class={styles.diffToolbarRight}>
            <button
              class={styles.diffToggleButton}
              onClick={toggleDiffLayout}
              type="button"
            >
              {diffReview().sideBySide ? 'Inline' : 'Side by Side'}
            </button>
            <button
              class={styles.diffCloseButton}
              onClick={exitDiffReview}
              title="Close diff view"
              type="button"
            >
              &times;
            </button>
          </div>
        </div>
      </Show>

      {/* Monaco editor container */}
      <div class={styles.editorContainer} ref={editorContainerRef!}>
        {/* Loading overlay — shown while Monaco is being fetched */}
        <Show when={loading()}>
          <div class={styles.loadingOverlay}>
            <div class={styles.loadingBar} />
            <span class={styles.loadingText}>Initializing editor</span>
          </div>
        </Show>

        {/* Empty state — no files open */}
        <Show when={!loading() && !hasFiles()}>
          <div class={styles.emptyState}>
            <span>No file open</span>
            <div class={styles.emptyStateHint}>
              <kbd class={styles.emptyStateKbd}>Cmd+P</kbd>
              <span>to find and open a file</span>
            </div>
          </div>
        </Show>
      </div>

      {/* Status bar */}
      <Show when={hasFiles() && !loading()}>
        <div class={styles.statusBar}>
          <div class={styles.statusBarLeft}>
            <span class={styles.statusBarItem}>
              Ln {cursorLine()}, Col {cursorCol()}
            </span>
          </div>
          <div class={styles.statusBarRight}>
            <span class={styles.statusBarItem}>{activeLanguage()}</span>
            <span class={styles.statusBarItem}>UTF-8</span>
            <Show when={activeFile()?.dirty && !diffReview().active}>
              <span class={`${styles.statusBarItem} ${styles.statusBarItemAccent}`}>Modified</span>
              <button
                class={styles.diffReviewButton}
                onClick={enterDiffReview}
                type="button"
              >
                Review Changes
              </button>
            </Show>
            <Show when={diffReview().active}>
              <span class={`${styles.statusBarItem} ${styles.statusBarItemAccent}`}>
                Diff Review
              </span>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
