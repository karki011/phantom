// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show, For, createEffect, on, createMemo } from 'solid-js';
import { Portal } from 'solid-js/web';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'highlight.js/styles/github-dark-dimmed.min.css';
import { detectLanguage } from '@/core/editor/language';
import { readFileContents, writeFileContents } from '@/core/bindings/editor';
import { readPlanFile, writePlanFile } from '@/core/bindings/plans';
import {
  registerOpenFile,
  unregisterOpenFile,
  unregisterAllFilesForPane,
  getOpenFileEntry,
} from '@/core/editor/open-file-registry';
import { activeWorktreeId } from '@/core/signals/app';
import { setSelectedFile, setRevealFilePath, setRightSidebarTab } from '@/core/signals/files';
import { setActivePaneInTab, tabs, removeTab, activePaneId } from '@/core/panes/signals';
import { worktreeMap } from '@/core/signals/worktrees';
import { showToast } from '@/shared/Toast/Toast';
import CodeMirrorEditor from '@/core/editor/CodeMirrorEditor';
import DiffViewer from '@/shared/DiffViewer/DiffViewer';
import { loadLanguage } from '@/core/editor/cm-languages';
import { phantomThemeExtension } from '@/core/editor/cm-theme';
import { highlightCode } from '@/core/composer/highlighter';
import { TextWrap, Clipboard, X as XIcon } from 'lucide-solid';
import type { Extension } from '@codemirror/state';
import * as styles from '@/styles/viewer.css';
import * as markdownStyles from '@/styles/markdown-preview.css';
import * as sidebarStyles from '@/styles/right-sidebar.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface FileViewerProps {
  paneId: string;
  filePath?: string;
  workspaceId?: string;
  isPlanFile?: boolean;
  line?: number;
  originalContent?: string;
  modifiedContent?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  language?: string;
  readOnly?: boolean;
  [key: string]: unknown;
}

interface FileTab {
  filePath: string;
  fileName: string;
  workspaceId: string;
  language: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  isPlanFile: boolean;
  editing: boolean;
}

interface DiffTab {
  filePath: string;
  fileName: string;
  originalContent: string;
  modifiedContent: string;
  originalLabel: string;
  modifiedLabel: string;
  language: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FileViewer(props: FileViewerProps) {
  const [loading, setLoading] = createSignal(true);
  const [mode, setMode] = createSignal<'file' | 'diff'>('file');
  const [lineWrapping, setLineWrapping] = createSignal(false);
  const [previewMode, setPreviewMode] = createSignal(false);

  // File tabs
  const [fileTabs, setFileTabs] = createSignal<FileTab[]>([]);
  const [activeFileTab, setActiveFileTab] = createSignal(0);

  // Diff tabs
  const [diffTabs, setDiffTabs] = createSignal<DiffTab[]>([]);
  const [activeDiffTab, setActiveDiffTab] = createSignal(0);

  let scrollContainerRef!: HTMLDivElement;

  // Context menu for file tabs
  const [tabContextMenu, setTabContextMenu] = createSignal<{ index: number; x: number; y: number } | null>(null);

  const workspaceId = () =>
    (props.workspaceId as string) || activeWorktreeId() || '';

  // Resolve worktree base path for absolute path copy
  const worktreeBasePath = createMemo(() => {
    const wtId = workspaceId();
    if (!wtId) return '';
    for (const workspaces of Object.values(worktreeMap())) {
      const match = workspaces.find((w) => w.id === wtId);
      if (match) return match.worktree_path ?? '';
    }
    return '';
  });

  // ── Language extension (async, reactive) ─────────────────────────────────

  const [langExtension, setLangExtension] = createSignal<Extension | undefined>(undefined);

  createEffect(
    on(
      () => currentLang(),
      async (lang) => {
        if (!lang || lang === 'plaintext') {
          setLangExtension(undefined);
          return;
        }
        const ext = await loadLanguage(lang);
        setLangExtension(ext ?? undefined);
      },
    ),
  );

  // ── File tab management ──────────────────────────────────────────────────

  const addFileTab = async (path: string, isPlan = false, line?: number) => {
    const existing = getOpenFileEntry(path);
    if (existing && existing.paneId !== props.paneId) {
      setActivePaneInTab(existing.paneId);
      return;
    }

    // Already open in this pane — switch to it
    const existingIdx = fileTabs().findIndex((t) => t.filePath === path);
    if (existingIdx >= 0) {
      setActiveFileTab(existingIdx);
      setMode('file');
      if (line) scrollToLine(line);
      return;
    }

    setLoading(true);
    setMode('file');

    let text: string;
    if (isPlan) {
      try {
        text = await readPlanFile(path);
      } catch (err) {
        text = `// Failed to open: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      text = await readFileContents(workspaceId(), path);
    }

    const language = detectLanguage(path);
    const fileName = path.split('/').pop() ?? path;

    const tab: FileTab = {
      filePath: path,
      fileName,
      workspaceId: workspaceId(),
      language,
      content: text,
      originalContent: text,
      dirty: false,
      isPlanFile: isPlan,
      editing: false,
    };

    setFileTabs((prev) => [...prev, tab]);
    setActiveFileTab(fileTabs().length - 1);

    registerOpenFile(path, {
      paneId: props.paneId,
      tabIndex: fileTabs().length - 1,
      workspaceId: workspaceId(),
    });

    setSelectedFile(path);
    setRevealFilePath(path);
    setRightSidebarTab('files');
    setLoading(false);

    if (line) requestAnimationFrame(() => scrollToLine(line));
  };

  const closeFileTab = (index: number) => {
    const tabList = fileTabs();
    if (index < 0 || index >= tabList.length) return;

    const file = tabList[index];
    unregisterOpenFile(file.filePath);

    if (tabList.length <= 1 && diffTabs().length === 0) {
      const tab = tabs().find((t) => props.paneId in t.panes);
      if (tab) removeTab(tab.id);
      return;
    }

    const newTabs = tabList.filter((_, i) => i !== index);
    setFileTabs(newTabs);
    if (newTabs.length > 0) {
      const newIdx = Math.min(index, newTabs.length - 1);
      setActiveFileTab(newIdx);
    } else if (diffTabs().length > 0) {
      setMode('diff');
    }
  };

  const toggleEdit = (index: number) => {
    setFileTabs((prev) => prev.map((f, i) =>
      i === index ? { ...f, editing: !f.editing } : f,
    ));
  };

  const handleContentChange = (value: string) => {
    const idx = activeFileTab();
    setFileTabs((prev) => prev.map((f, i) =>
      i === idx ? { ...f, content: value, dirty: value !== f.originalContent } : f,
    ));
  };

  const saveFile = async () => {
    const file = fileTabs()[activeFileTab()];
    if (!file) return;

    let success: boolean;
    if (file.isPlanFile) {
      try {
        await writePlanFile(file.filePath, file.content);
        success = true;
      } catch {
        success = false;
      }
    } else {
      success = await writeFileContents(file.workspaceId, file.filePath, file.content);
    }

    if (success) {
      setFileTabs((prev) => prev.map((f, i) =>
        i === activeFileTab() ? { ...f, dirty: false, originalContent: f.content, editing: false } : f,
      ));
      showToast('Saved');
    }
  };

  // ── File tab context menu actions ─────────────────────────────────────────

  function handleTabContextMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    setTabContextMenu({ index, x: e.clientX, y: e.clientY });
  }

  function closeTabContextMenu() {
    setTabContextMenu(null);
  }

  function ctxCopyPath() {
    const menu = tabContextMenu();
    if (!menu) return;
    const tab = fileTabs()[menu.index];
    if (tab) navigator.clipboard.writeText(tab.filePath);
    closeTabContextMenu();
  }

  function ctxCopyAbsolutePath() {
    const menu = tabContextMenu();
    if (!menu) return;
    const tab = fileTabs()[menu.index];
    if (tab) {
      const base = worktreeBasePath();
      const abs = base ? `${base}/${tab.filePath}` : tab.filePath;
      navigator.clipboard.writeText(abs);
    }
    closeTabContextMenu();
  }

  function ctxCloseTab() {
    const menu = tabContextMenu();
    if (!menu) return;
    closeFileTab(menu.index);
    closeTabContextMenu();
  }

  function ctxCloseAllTabs() {
    const all = fileTabs();
    // Close from end to start to avoid index shifting
    for (let i = all.length - 1; i >= 0; i--) {
      closeFileTab(i);
    }
    closeTabContextMenu();
  }

  function ctxCloseOtherTabs() {
    const menu = tabContextMenu();
    if (!menu) return;
    const keepPath = fileTabs()[menu.index]?.filePath;
    if (!keepPath) { closeTabContextMenu(); return; }
    const all = fileTabs();
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].filePath !== keepPath) closeFileTab(i);
    }
    closeTabContextMenu();
  }

  // ── Diff tab management ──────────────────────────────────────────────────

  const addDiffTab = async (
    fp: string,
    original: string,
    modified: string,
    origLabel: string,
    modLabel: string,
    language?: string,
  ) => {
    const lang = language || detectLanguage(fp);
    const fileName = fp.split('/').pop() ?? fp;

    const existingIdx = diffTabs().findIndex((t) => t.filePath === fp);
    if (existingIdx >= 0) {
      setActiveDiffTab(existingIdx);
      setMode('diff');
      return;
    }

    setLoading(true);
    setMode('diff');

    const tab: DiffTab = {
      filePath: fp,
      fileName,
      originalContent: original,
      modifiedContent: modified,
      originalLabel: origLabel,
      modifiedLabel: modLabel,
      language: lang,
    };

    setDiffTabs((prev) => [...prev, tab]);
    setActiveDiffTab(diffTabs().length - 1);
    setLoading(false);
  };

  const closeDiffTab = (index: number) => {
    const tabList = diffTabs();
    if (tabList.length <= 1 && fileTabs().length === 0) {
      const tab = tabs().find((t) => props.paneId in t.panes);
      if (tab) removeTab(tab.id);
      return;
    }
    const newTabs = tabList.filter((_, i) => i !== index);
    setDiffTabs(newTabs);
    if (newTabs.length > 0) {
      setActiveDiffTab(Math.min(index, newTabs.length - 1));
    } else if (fileTabs().length > 0) {
      setMode('file');
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────

  const activeFile = () => fileTabs()[activeFileTab()] ?? null;
  const activeDiff = () => diffTabs()[activeDiffTab()] ?? null;

  const scrollToLine = (line: number) => {
    if (!scrollContainerRef) return;
    requestAnimationFrame(() => {
      const el = scrollContainerRef.querySelector(`[data-line="${line}"]`);
      el?.scrollIntoView({ block: 'center' });
    });
  };

  function currentLang(): string {
    if (mode() === 'diff') return activeDiff()?.language ?? 'plaintext';
    return activeFile()?.language ?? 'plaintext';
  }

  const isMarkdown = () => currentLang() === 'markdown';

  // ── Markdown preview rendering ──────────────────────────────────────────

  // Signal for the final HTML — starts as parsed markdown, updated when highlights resolve
  const [displayHtml, setDisplayHtml] = createSignal('');

  const parsedMarkdownHtml = createMemo(() => {
    if (!previewMode() || !isMarkdown()) return '';
    const content = activeFile()?.content;
    if (!content) return '';
    const raw = marked.parse(content, { breaks: true, gfm: true });
    // marked.parse can return string | Promise<string> — sync input returns string
    return DOMPurify.sanitize(typeof raw === 'string' ? raw : '');
  });

  // Monotonic counter for highlight block IDs
  let _hlCounter = 0;

  // Highlight code blocks off the main thread after markdown is parsed
  createEffect(() => {
    const html = parsedMarkdownHtml();
    if (!html) {
      setDisplayHtml('');
      return;
    }

    const template = document.createElement('template');
    template.innerHTML = html;
    const fragment = template.content;
    const codeBlocks = fragment.querySelectorAll('pre code');

    if (codeBlocks.length === 0) {
      setDisplayHtml(html);
      return;
    }

    let pendingCount = codeBlocks.length;

    codeBlocks.forEach((codeEl, index) => {
      const code = codeEl.textContent ?? '';
      if (!code.trim()) {
        pendingCount--;
        if (pendingCount === 0) setDisplayHtml(template.innerHTML);
        return;
      }

      let language: string | undefined;
      for (const cls of codeEl.className.split(/\s+/)) {
        if (cls.startsWith('language-')) {
          language = cls.slice('language-'.length);
          break;
        }
      }

      const blockId = `fv-hl-${index}-${++_hlCounter}`;
      highlightCode(blockId, code, language, (_id, highlighted) => {
        codeEl.innerHTML = highlighted;
        codeEl.classList.add('hljs');
        pendingCount--;
        if (pendingCount === 0) setDisplayHtml(template.innerHTML);
      });
    });

    // Show un-highlighted markdown immediately while highlights are pending
    setDisplayHtml(html);
  });

  // Post-render: copy buttons on <pre> blocks, external link handling
  let previewRef: HTMLDivElement | undefined;

  createEffect(() => {
    void displayHtml();
    if (!previewRef) return;
    requestAnimationFrame(() => {
      if (!previewRef) return;

      // Copy buttons on <pre> blocks
      previewRef.querySelectorAll('pre').forEach((pre) => {
        if (pre.querySelector('.copy-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        pre.style.position = 'relative';
        pre.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        pre.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });
        btn.addEventListener('click', () => {
          const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
          navigator.clipboard.writeText(code);
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
        pre.appendChild(btn);
      });

      // External links -> system browser
      previewRef.querySelectorAll('a[href]').forEach((a) => {
        if ((a as HTMLElement).dataset.extWired) return;
        const href = a.getAttribute('href') ?? '';
        if (href.startsWith('http://') || href.startsWith('https://')) {
          (a as HTMLElement).dataset.extWired = '1';
          a.addEventListener('click', (e) => {
            e.preventDefault();
            window.open(href, '_blank');
          });
        }
      });
    });
  });

  // Reset preview mode when switching to a non-markdown file
  createEffect(
    on(
      () => activeFile()?.filePath,
      () => {
        if (!isMarkdown()) setPreviewMode(false);
      },
    ),
  );

  // ── Lifecycle ────────────────────────────────────────────────────────────

  onMount(() => {
    if (props.originalContent && props.modifiedContent) {
      void addDiffTab(
        (props.filePath as string) || 'file',
        props.originalContent as string,
        props.modifiedContent as string,
        (props.originalLabel as string) || 'Original',
        (props.modifiedLabel as string) || 'Modified',
        props.language as string,
      );
      return;
    }
    if (props.filePath) {
      void addFileTab(props.filePath as string, !!props.isPlanFile, props.line);
    } else {
      setLoading(false);
    }
  });

  createEffect(on(
    () => props.filePath as string,
    (fp, prevFp) => {
      if (!fp || fp === prevFp) return;
      if (props.originalContent) return;
      void addFileTab(fp, !!props.isPlanFile);
    },
  ));

  // ── Events ───────────────────────────────────────────────────────────────

  onMount(() => {
    const handleOpenFile = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.paneId !== props.paneId) return;
      void addFileTab(d.filePath, false, d.line);
    };

    const handleDiffFile = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.paneId !== props.paneId) return;
      void addDiffTab(d.filePath, d.originalContent, d.modifiedContent, d.originalLabel, d.modifiedLabel, d.language);
    };

    const handleGoto = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.paneId !== props.paneId) return;
      scrollToLine(d.line);
    };

    const handleKeydown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (activePaneId() !== props.paneId) return;

      // Alt+Z — toggle word wrap
      if (e.altKey && e.key === 'z') {
        e.preventDefault();
        setLineWrapping((v) => !v);
        return;
      }

      // Cmd+Shift+P — toggle markdown preview
      if (meta && e.shiftKey && e.key === 'p' && isMarkdown() && mode() === 'file') {
        e.preventDefault();
        setPreviewMode((v) => !v);
        return;
      }

      if (meta && e.key === 's') {
        e.preventDefault();
        if (mode() === 'file' && activeFile()?.dirty) void saveFile();
        return;
      }

      if (meta && e.key === 'w') {
        e.preventDefault();
        if (mode() === 'file' && fileTabs().length > 1) closeFileTab(activeFileTab());
        else if (mode() === 'diff' && diffTabs().length > 1) closeDiffTab(activeDiffTab());
        else { const t = tabs().find((t) => props.paneId in t.panes); if (t) removeTab(t.id); }
      }
    };

    window.addEventListener('phantom:editor-open-file', handleOpenFile);
    window.addEventListener('phantom:diff-open-file', handleDiffFile);
    window.addEventListener('phantom:editor-goto', handleGoto);
    document.addEventListener('keydown', handleKeydown);
    onCleanup(() => {
      window.removeEventListener('phantom:editor-open-file', handleOpenFile);
      window.removeEventListener('phantom:diff-open-file', handleDiffFile);
      window.removeEventListener('phantom:editor-goto', handleGoto);
      document.removeEventListener('keydown', handleKeydown);
    });
  });

  onCleanup(() => {
    unregisterAllFilesForPane(props.paneId);
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div class={styles.viewerWrapper}>
      {/* Tab bar — files */}
      <Show when={mode() === 'file' && fileTabs().length > 0}>
        <div class={styles.diffTabBar}>
          <For each={fileTabs()}>
            {(tab, i) => (
              <button
                type="button"
                class={styles.diffTab}
                data-active={i() === activeFileTab()}
                onClick={() => setActiveFileTab(i())}
                onContextMenu={(e: MouseEvent) => handleTabContextMenu(e, i())}
                title={tab.filePath}
              >
                <span class={styles.diffTabLabel}>{tab.fileName}</span>
                <Show when={tab.dirty}>
                  <span class={styles.dirtyDot} />
                </Show>
                <span
                  class={styles.diffTabClose}
                  onClick={(e: MouseEvent) => { e.stopPropagation(); closeFileTab(i()); }}
                >
                  &times;
                </span>
              </button>
            )}
          </For>

          {/* Switch to diffs if any */}
          <Show when={diffTabs().length > 0}>
            <button
              type="button"
              class={styles.modeSwitchBtn}
              onClick={() => setMode('diff')}
            >
              Diffs ({diffTabs().length})
            </button>
          </Show>

          {/* Markdown preview toggle — in tab bar for visibility */}
          <Show when={isMarkdown()}>
            <div class={styles.previewToggleGroup}>
              <button
                type="button"
                class={styles.previewToggleBtn}
                data-active={!previewMode()}
                onClick={() => setPreviewMode(false)}
                title="View source (Cmd+Shift+P)"
              >
                Source
              </button>
              <button
                type="button"
                class={styles.previewToggleBtn}
                data-active={previewMode()}
                onClick={() => setPreviewMode(true)}
                title="Rendered preview (Cmd+Shift+P)"
              >
                Preview
              </button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Tab bar — diffs */}
      <Show when={mode() === 'diff' && diffTabs().length > 0}>
        <div class={styles.diffTabBar}>
          <For each={diffTabs()}>
            {(tab, i) => (
              <button
                type="button"
                class={styles.diffTab}
                data-active={i() === activeDiffTab()}
                onClick={() => setActiveDiffTab(i())}
              >
                <span class={styles.diffTabLabel}>{tab.fileName}</span>
                <span
                  class={styles.diffTabClose}
                  onClick={(e: MouseEvent) => { e.stopPropagation(); closeDiffTab(i()); }}
                >
                  &times;
                </span>
              </button>
            )}
          </For>

          {/* Switch to files if any */}
          <Show when={fileTabs().length > 0}>
            <button
              type="button"
              class={styles.modeSwitchBtn}
              onClick={() => setMode('file')}
            >
              Files ({fileTabs().length})
            </button>
          </Show>
        </div>
      </Show>

      {/* Diff header */}
      <Show when={mode() === 'diff' && activeDiff()}>
        <div class={styles.diffHeader}>
          <span class={styles.diffFilePath}>{activeDiff()!.originalLabel} → {activeDiff()!.modifiedLabel}</span>
        </div>
      </Show>

      {/* Content area */}
      <div class={styles.codeContainer} ref={scrollContainerRef!}>
        <Show when={loading()}>
          <div class={styles.loadingOverlay}>
            <div class={styles.loadingBar} />
            <span class={styles.loadingText}>Loading</span>
          </div>
        </Show>

        <Show when={!loading() && mode() === 'file' && !activeFile()}>
          <div class={styles.emptyState}>
            <span>No file open</span>
            <div class={styles.emptyStateHint}>
              <kbd class={styles.emptyStateKbd}>Cmd+P</kbd>
              <span>to find and open a file</span>
            </div>
          </div>
        </Show>

        {/* File view — CodeMirror editor or markdown preview */}
        <Show when={!loading() && mode() === 'file' && activeFile()}>
          <Show when={previewMode() && isMarkdown()} fallback={
            <CodeMirrorEditor
              content={activeFile()!.content}
              language={langExtension()}
              readOnly={!activeFile()!.editing}
              lineWrapping={lineWrapping()}
              theme={phantomThemeExtension}
              onChange={handleContentChange}
              class={styles.cmFillContainer}
            />
          }>
            <div class={markdownStyles.previewContainer}>
              <div class={markdownStyles.scrollArea}>
                <div
                  ref={previewRef}
                  class={markdownStyles.markdownProse}
                  innerHTML={displayHtml()}
                />
              </div>
            </div>
          </Show>
        </Show>

        {/* Diff view — CodeMirror merge */}
        <Show when={!loading() && mode() === 'diff' && activeDiff()}>
          <DiffViewer
            originalContent={activeDiff()!.originalContent}
            modifiedContent={activeDiff()!.modifiedContent}
            class={styles.cmFillContainer}
          />
        </Show>
      </div>

      {/* Status bar */}
      <Show when={!loading() && (activeFile() || activeDiff())}>
        <div class={styles.statusBar}>
          <div class={styles.statusBarLeft}>
            <Show when={mode() === 'file' && activeFile()}>
              <span class={styles.statusBarItem}>{activeFile()!.content.split('\n').length} lines</span>
            </Show>
          </div>
          <div class={styles.statusBarRight}>
            <button
              type="button"
              class={styles.wrapToggleBtn}
              data-active={lineWrapping()}
              onClick={() => setLineWrapping((v) => !v)}
              title={lineWrapping() ? 'Disable word wrap' : 'Enable word wrap (Alt+Z)'}
            >
              <TextWrap size={12} />
            </button>
            <span class={styles.statusBarItem}>{currentLang()}</span>
            <span class={styles.statusBarItem}>UTF-8</span>
            <Show when={mode() === 'file' && activeFile()}>
              <Show when={activeFile()!.editing}>
                <button type="button" class={styles.editToggleBtn} onClick={() => toggleEdit(activeFileTab())}>
                  View
                </button>
              </Show>
              <Show when={!activeFile()!.editing}>
                <button type="button" class={styles.editToggleBtn} onClick={() => toggleEdit(activeFileTab())}>
                  Edit
                </button>
              </Show>
              <Show when={activeFile()!.dirty}>
                <span class={styles.statusBarItemAccent}>Modified</span>
                <button type="button" class={styles.saveBtn} onClick={() => void saveFile()}>
                  Save
                </button>
              </Show>
            </Show>
          </div>
        </div>
      </Show>

      {/* File tab context menu — portal to body */}
      <Show when={tabContextMenu()}>
        {(menu) => {
          let menuRef!: HTMLDivElement;
          const handleClickAway = (e: MouseEvent) => {
            if (menuRef && !menuRef.contains(e.target as Node)) closeTabContextMenu();
          };
          const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeTabContextMenu();
          };
          createEffect(() => {
            document.addEventListener('mousedown', handleClickAway);
            document.addEventListener('keydown', handleEscape);
            onCleanup(() => {
              document.removeEventListener('mousedown', handleClickAway);
              document.removeEventListener('keydown', handleEscape);
            });
          });

          return (
            <Portal>
              <div
                ref={(el: HTMLDivElement) => { menuRef = el; }}
                class={sidebarStyles.contextMenuContent}
                style={{
                  position: 'fixed',
                  left: `${menu().x}px`,
                  top: `${menu().y}px`,
                  'z-index': 9999,
                }}
              >
                <div class={sidebarStyles.contextMenuItem} onClick={ctxCopyPath}>
                  <Clipboard size={13} /> Copy Path
                </div>
                <div class={sidebarStyles.contextMenuItem} onClick={ctxCopyAbsolutePath}>
                  <Clipboard size={13} /> Copy Absolute Path
                </div>
                <div class={sidebarStyles.contextMenuSeparator} />
                <div class={sidebarStyles.contextMenuItem} onClick={ctxCloseTab}>
                  <XIcon size={13} /> Close
                </div>
                <div class={sidebarStyles.contextMenuItem} onClick={ctxCloseAllTabs}>
                  <XIcon size={13} /> Close All
                </div>
                <div class={sidebarStyles.contextMenuItem} onClick={ctxCloseOtherTabs}>
                  <XIcon size={13} /> Close Others
                </div>
              </div>
            </Portal>
          );
        }}
      </Show>
    </div>
  );
}
