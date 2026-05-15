// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show, For, createEffect, on } from 'solid-js';
import { highlightCode, type HighlightedLine } from '@/core/editor/highlighter';
import { detectLanguage } from '@/core/editor/language';
import { readFileContents, writeFileContents } from '@/core/bindings/editor';
import { readPlanFile, writePlanFile } from '@/core/bindings/plans';
import {
  registerOpenFile,
  unregisterAllFilesForPane,
  getOpenFileEntry,
} from '@/core/editor/open-file-registry';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { setSelectedFile, setRevealFilePath, setRightSidebarTab } from '@/core/signals/files';
import { setActivePaneInTab, tabs, removeTab, activePaneId } from '@/core/panes/signals';
import { showToast } from '@/shared/Toast/Toast';
import type { DiffLine } from '@/components/composer/DiffOverlay';
import * as styles from '@/styles/viewer.css';

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
  highlighted: HighlightedLine[];
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
  diffLines: DiffLine[];
  highlightedOld: HighlightedLine[];
  highlightedNew: HighlightedLine[];
}

interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

function buildSideBySideRows(dl: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let i = 0;
  while (i < dl.length) {
    const line = dl[i];
    if (line.type === 'same') {
      rows.push({ left: line, right: line });
      i++;
    } else if (line.type === 'remove') {
      const removes: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (i < dl.length && dl[i].type === 'remove') { removes.push(dl[i]); i++; }
      while (i < dl.length && dl[i].type === 'add') { adds.push(dl[i]); i++; }
      const max = Math.max(removes.length, adds.length);
      for (let j = 0; j < max; j++) {
        rows.push({
          left: j < removes.length ? removes[j] : null,
          right: j < adds.length ? adds[j] : null,
        });
      }
    } else {
      rows.push({ left: null, right: line });
      i++;
    }
  }
  return rows;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FileViewer(props: FileViewerProps) {
  const [loading, setLoading] = createSignal(true);
  const [mode, setMode] = createSignal<'file' | 'diff'>('file');

  // File tabs
  const [fileTabs, setFileTabs] = createSignal<FileTab[]>([]);
  const [activeFileTab, setActiveFileTab] = createSignal(0);

  // Diff tabs
  const [diffTabs, setDiffTabs] = createSignal<DiffTab[]>([]);
  const [activeDiffTab, setActiveDiffTab] = createSignal(0);

  let scrollContainerRef!: HTMLDivElement;
  let textareaRef!: HTMLTextAreaElement;

  const workspaceId = () =>
    (props.workspaceId as string) || activeWorktreeId() || '';

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
    const highlighted = await highlightCode(text, language);
    const fileName = path.split('/').pop() ?? path;

    const tab: FileTab = {
      filePath: path,
      fileName,
      workspaceId: workspaceId(),
      language,
      content: text,
      originalContent: text,
      highlighted,
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
    registerOpenFile(file.filePath, { paneId: '', tabIndex: -1, workspaceId: '' });

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
    if (fileTabs()[index]?.editing) {
      requestAnimationFrame(() => textareaRef?.focus());
    }
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
      const highlighted = await highlightCode(file.content, file.language);
      setFileTabs((prev) => prev.map((f, i) =>
        i === activeFileTab() ? { ...f, dirty: false, originalContent: f.content, highlighted, editing: false } : f,
      ));
      showToast('Saved');
    }
  };

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

    const { computeLineDiff } = await import('@/components/composer/DiffOverlay');
    const diff = computeLineDiff(original, modified);

    const [oldHL, newHL] = await Promise.all([
      highlightCode(original, lang),
      highlightCode(modified, lang),
    ]);

    const tab: DiffTab = {
      filePath: fp,
      fileName,
      originalContent: original,
      modifiedContent: modified,
      originalLabel: origLabel,
      modifiedLabel: modLabel,
      language: lang,
      diffLines: diff,
      highlightedOld: oldHL,
      highlightedNew: newHL,
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

  const diffStats = () => {
    const d = activeDiff();
    if (!d) return { added: 0, removed: 0 };
    let added = 0, removed = 0;
    for (const line of d.diffLines) {
      if (line.type === 'add') added++;
      if (line.type === 'remove') removed++;
    }
    return { added, removed };
  };

  const sideBySideRows = () => {
    const d = activeDiff();
    return d ? buildSideBySideRows(d.diffLines) : [];
  };

  const getOldTokens = (lineNum: number) => activeDiff()?.highlightedOld[lineNum - 1]?.tokens;
  const getNewTokens = (lineNum: number) => activeDiff()?.highlightedNew[lineNum - 1]?.tokens;

  const scrollToLine = (line: number) => {
    if (!scrollContainerRef) return;
    requestAnimationFrame(() => {
      const el = scrollContainerRef.querySelector(`[data-line="${line}"]`);
      el?.scrollIntoView({ block: 'center' });
    });
  };

  const currentLang = () => {
    if (mode() === 'diff') return activeDiff()?.language ?? 'plaintext';
    return activeFile()?.language ?? 'plaintext';
  };

  // ── Lifecycle ────────────────────────────────────────────────────────────

  onMount(() => {
    if (props.originalContent !== undefined && props.modifiedContent !== undefined) {
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
      if (props.originalContent !== undefined) return;
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

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderTokenLine = (tokens: { content: string; color?: string; fontStyle?: string }[]) => (
    <For each={tokens}>
      {(token) => (
        <span style={{ color: token.color, 'font-style': token.fontStyle }}>{token.content}</span>
      )}
    </For>
  );

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
          <div class={styles.diffStats}>
            <span class={styles.diffStatAdd}>+{diffStats().added}</span>
            <span class={styles.diffStatRemove}>-{diffStats().removed}</span>
          </div>
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

        {/* File view — highlighted (read mode) */}
        <Show when={!loading() && mode() === 'file' && activeFile() && !activeFile()!.editing}>
          <table class={styles.codeTable} onDblClick={() => toggleEdit(activeFileTab())}>
            <tbody>
              <For each={activeFile()!.highlighted}>
                {(line, i) => (
                  <tr class={styles.codeLine} data-line={i() + 1}>
                    <td class={styles.lineNumber}>{i() + 1}</td>
                    <td class={styles.lineContent}>{renderTokenLine(line.tokens)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>

        {/* File view — textarea (edit mode) */}
        <Show when={!loading() && mode() === 'file' && activeFile()?.editing}>
          <textarea
            ref={textareaRef!}
            class={styles.editTextarea}
            value={activeFile()!.content}
            onInput={(e) => handleContentChange(e.currentTarget.value)}
            spellcheck={false}
          />
        </Show>

        {/* Side-by-side diff view */}
        <Show when={!loading() && mode() === 'diff' && activeDiff()}>
          <table class={styles.diffTable}>
            <tbody>
              <For each={sideBySideRows()}>
                {(row) => (
                  <tr class={styles.diffRow}>
                    <td class={`${styles.diffCell} ${row.left?.type === 'remove' ? styles.diffCellRemove : row.left === null ? styles.diffCellEmpty : ''}`}>
                      <span class={styles.diffLineNum}>{row.left?.oldNum ?? ''}</span>
                      <span class={styles.diffLineCode}>
                        <Show when={row.left} fallback={<span>&nbsp;</span>}>
                          {(() => {
                            const tokens = row.left!.oldNum ? getOldTokens(row.left!.oldNum) : undefined;
                            return (
                              <Show when={tokens} fallback={<span>{row.left!.text || ' '}</span>}>
                                {renderTokenLine(tokens!)}
                              </Show>
                            );
                          })()}
                        </Show>
                      </span>
                    </td>
                    <td class={`${styles.diffCell} ${row.right?.type === 'add' ? styles.diffCellAdd : row.right === null ? styles.diffCellEmpty : ''}`}>
                      <span class={styles.diffLineNum}>{row.right?.newNum ?? ''}</span>
                      <span class={styles.diffLineCode}>
                        <Show when={row.right} fallback={<span>&nbsp;</span>}>
                          {(() => {
                            const tokens = row.right!.newNum ? getNewTokens(row.right!.newNum) : undefined;
                            return (
                              <Show when={tokens} fallback={<span>{row.right!.text || ' '}</span>}>
                                {renderTokenLine(tokens!)}
                              </Show>
                            );
                          })()}
                        </Show>
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      {/* Status bar */}
      <Show when={!loading() && (activeFile() || activeDiff())}>
        <div class={styles.statusBar}>
          <div class={styles.statusBarLeft}>
            <Show when={mode() === 'file' && activeFile()}>
              <span class={styles.statusBarItem}>{activeFile()!.content.split('\n').length} lines</span>
            </Show>
            <Show when={mode() === 'diff' && activeDiff()}>
              <span class={styles.statusBarItem}>{activeDiff()!.diffLines.length} lines</span>
            </Show>
          </div>
          <div class={styles.statusBarRight}>
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
    </div>
  );
}
