// Phantom — Virtualized file tree with flat model, shared context menu, CSS containment
// Author: Subash Karki

import { For, Show, createSignal, createEffect, createMemo, on, onCleanup, batch } from 'solid-js';
import { Portal } from 'solid-js/web';
// Kobalte ContextMenu removed — native positioned popup used instead (1 DOM element vs 200+ portals)
// Manual virtualization used instead of @tanstack/solid-virtual (reactivity issues with SolidJS memos)
import { ChevronRight, Folder, FolderOpen, FileText, Search, X, Eye, AppWindow, Terminal, Clipboard, FilePlus, FolderPlus, Trash2 } from 'lucide-solid';
import * as styles from '@/styles/right-sidebar.css';
import {
  fileTree,
  setFileTree,
  setFilesCount,
  selectedFile,
  setSelectedFile,
  revealFilePath,
  setRevealFilePath,
  type FileNode,
} from '@/core/signals/files';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { listWorkspaceFiles, listWorkspaceDir, searchWorkspaceFiles, revealInFinder, openInFinder, openInDefaultApp, createFile, createFolder, deleteFile } from '@/core/bindings';
import { addTabWithData } from '@/core/panes/signals';
import { openFileInEditor } from '@/core/editor/open-file';
import type { FileEntry } from '@/core/types';

// ── Row height constant ─────────────────────────────────────────────────────

const ROW_HEIGHT = 26;
const INDENT_PX = 12;

// ── Flat tree node ──────────────────────────────────────────────────────────

interface FlatNode {
  path: string;
  name: string;
  isDir: boolean;
  depth: number;
  expanded: boolean;
  gitStatus?: string;
}

// ── Base path helper ────────────────────────────────────────────────────────

function getBasePath(): string {
  const wtId = activeWorktreeId();
  if (!wtId) return '';
  for (const workspaces of Object.values(worktreeMap())) {
    const match = workspaces.find((w) => w.id === wtId);
    if (match) return match.worktree_path ?? '';
  }
  return '';
}

function absolutePathFor(relativePath: string): string {
  const base = getBasePath();
  return base ? `${base}/${relativePath}` : relativePath;
}

// ── Git badge ───────────────────────────────────────────────────────────────

function GitBadge(props: { status: string }) {
  const badgeClass = () => {
    switch (props.status) {
      case 'M': return styles.gitBadgeM;
      case 'A': return styles.gitBadgeA;
      case 'D': return styles.gitBadgeD;
      case '?': return styles.gitBadgeQ;
      default: return styles.gitBadge;
    }
  };

  return (
    <Show when={props.status && props.status !== ''}>
      <span class={badgeClass()}>{props.status}</span>
    </Show>
  );
}

// ── Context menu target ─────────────────────────────────────────────────────

interface ContextTarget {
  path: string;
  name: string;
  isDir: boolean;
  x: number;
  y: number;
}

// ── Search result item ──────────────────────────────────────────────────────

function SearchResultItem(props: { entry: FileEntry; onContextMenu: (e: MouseEvent, entry: FileEntry) => void }) {
  const isSelected = () => selectedFile() === props.entry.path;

  return (
    <div
      class={`${styles.fileItem} ${styles.fileItemPadded} ${isSelected() ? styles.fileItemSelected : ''}`}
      onClick={() => {
        setSelectedFile(props.entry.path);
        const wtId = activeWorktreeId();
        if (wtId) openFileInEditor({ workspaceId: wtId, filePath: props.entry.path });
      }}
      onContextMenu={(e: MouseEvent) => props.onContextMenu(e, props.entry)}
      title={props.entry.path}
    >
      <FileText size={14} class={styles.fileIcon} />
      <span class={styles.fileName}>{props.entry.name}</span>
    </div>
  );
}

// ── Files view ──────────────────────────────────────────────────────────────

export function FilesView() {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchResults, setSearchResults] = createSignal<FileEntry[]>([]);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Flat tree state ─────────────────────────────────────────────────────
  const [expandedDirs, setExpandedDirs] = createSignal<Set<string>>(new Set());
  const [dirChildren, setDirChildren] = createSignal<Map<string, FileNode[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = createSignal<Set<string>>(new Set());

  // ── Inline create state ─────────────────────────────────────────────────
  const [creatingIn, setCreatingIn] = createSignal<{ parentPath: string; type: 'file' | 'folder' } | null>(null);

  // ── Single shared context menu target ───────────────────────────────────
  // Set on contextmenu event BEFORE Kobalte opens the menu
  const [contextTarget, setContextTarget] = createSignal<ContextTarget | null>(null);

  let scrollRef!: HTMLDivElement;

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // ── Load root file tree when worktree changes ─────────────────────────
  createEffect(on(activeWorktreeId, async (wtId) => {
    if (!wtId) { setFileTree([]); return; }
    const entries = await listWorkspaceFiles(wtId);
    const nodes: FileNode[] = entries.map((e) => ({
      name: e.name,
      path: e.path,
      isDir: e.is_dir,
      gitStatus: e.git_status || undefined,
      children: e.is_dir ? [] : undefined,
    }));
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    batch(() => {
      setFileTree(nodes);
      setFilesCount(nodes.length);
      setExpandedDirs(new Set<string>());
      setDirChildren(new Map<string, FileNode[]>());
    });
  }));

  // ── Sort helper ───────────────────────────────────────────────────────
  function sortNodes(nodes: FileNode[]): FileNode[] {
    return [...nodes].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // ── Load directory children from Go ───────────────────────────────────
  async function loadDirChildren(path: string): Promise<FileNode[]> {
    const wtId = activeWorktreeId();
    if (!wtId) return [];
    setLoadingDirs((prev) => { const s = new Set(prev); s.add(path); return s; });
    try {
      const entries = await listWorkspaceDir(wtId, path);
      const nodes: FileNode[] = entries.map((e) => ({
        name: e.name,
        path: e.path,
        isDir: e.is_dir,
        gitStatus: e.git_status || undefined,
        children: e.is_dir ? [] : undefined,
      }));
      const sorted = sortNodes(nodes);
      setDirChildren((prev) => { const m = new Map(prev); m.set(path, sorted); return m; });
      return sorted;
    } finally {
      setLoadingDirs((prev) => { const s = new Set(prev); s.delete(path); return s; });
    }
  }

  // ── Expand / collapse ─────────────────────────────────────────────────
  async function toggleDir(path: string) {
    const exp = expandedDirs();
    if (exp.has(path)) {
      // Collapse — also remove all descendant expansions
      const next = new Set(exp);
      next.delete(path);
      for (const p of exp) {
        if (p.startsWith(path + '/')) next.delete(p);
      }
      setExpandedDirs(next);
    } else {
      // Expand
      const next = new Set(exp);
      next.add(path);
      setExpandedDirs(next);
      // Lazy load if not yet loaded
      if (!dirChildren().has(path)) {
        await loadDirChildren(path);
      }
    }
  }

  // ── Flat list computation ─────────────────────────────────────────────
  const flatList = createMemo((): FlatNode[] => {
    const exp = expandedDirs();
    const childMap = dirChildren();
    const result: FlatNode[] = [];

    function walk(nodes: FileNode[], depth: number) {
      for (const node of nodes) {
        const isExpanded = node.isDir && exp.has(node.path);
        const cached = node.isDir ? childMap.get(node.path) : undefined;
        result.push({
          path: node.path,
          name: node.name,
          isDir: node.isDir,
          depth,
          expanded: isExpanded,
          gitStatus: node.gitStatus,
        });
        if (isExpanded && cached) {
          walk(cached, depth + 1);
        }
      }
    }

    walk(fileTree(), 0);
    return result;
  });

  // ── Simple scroll-based virtualization (reactive in SolidJS) ────────
  const [scrollTop, setScrollTop] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(600);
  const OVERSCAN = 10;

  const visibleRange = createMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(flatList().length, Math.ceil((scrollTop() + containerHeight()) / ROW_HEIGHT) + OVERSCAN);
    return { start, end };
  });

  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return flatList().slice(start, end).map((node, i) => ({
      ...node,
      index: start + i,
      offsetY: (start + i) * ROW_HEIGHT,
    }));
  });

  // ── Reveal-in-tree ────────────────────────────────────────────────────
  createEffect(on(revealFilePath, async (target) => {
    if (!target) return;

    // Split path into ancestor directories to expand
    const parts = target.split('/');
    const ancestors: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      ancestors.push(parts.slice(0, i).join('/'));
    }

    // Expand each ancestor sequentially (need children loaded before next level)
    for (const dir of ancestors) {
      const exp = expandedDirs();
      if (!exp.has(dir)) {
        const next = new Set(exp);
        next.add(dir);
        setExpandedDirs(next);
        if (!dirChildren().has(dir)) {
          await loadDirChildren(dir);
        }
      }
    }

    // Scroll to the target node
    setRevealFilePath(null);
    requestAnimationFrame(() => {
      const list = flatList();
      const idx = list.findIndex((n) => n.path === target);
      if (idx >= 0 && scrollRef) {
        const targetTop = idx * ROW_HEIGHT;
        const viewportMiddle = scrollRef.clientHeight / 2;
        scrollRef.scrollTop = Math.max(0, targetTop - viewportMiddle);
      }
    });
  }));

  // ── Handle right-click — set target so shared menu renders correct items ─
  function handleRowContextMenu(e: MouseEvent, node: FlatNode) {
    e.preventDefault();
    e.stopPropagation();
    setContextTarget({
      path: node.path,
      name: node.name,
      isDir: node.isDir,
      x: e.clientX,
      y: e.clientY,
    });
  }

  function closeContextMenu() {
    setContextTarget(null);
  }

  // ── Handle new file/folder creation ───────────────────────────────────
  async function handleCreateSubmit(name: string) {
    const info = creatingIn();
    if (!info || !name.trim()) { setCreatingIn(null); return; }
    const wtId = activeWorktreeId();
    if (!wtId) { setCreatingIn(null); return; }
    const newPath = info.parentPath ? `${info.parentPath}/${name.trim()}` : name.trim();
    const ok = info.type === 'file'
      ? await createFile(wtId, newPath)
      : await createFolder(wtId, newPath);
    setCreatingIn(null);
    if (ok) {
      // Refresh directory children
      await loadDirChildren(info.parentPath);
      if (info.type === 'file') {
        openFileInEditor({ workspaceId: wtId, filePath: newPath });
      }
    }
  }

  // ── Debounced search ──────────────────────────────────────────────────
  function handleSearchInput(value: string) {
    setSearchQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    debounceTimer = setTimeout(async () => {
      const wtId = activeWorktreeId();
      if (!wtId) return;
      const results = await searchWorkspaceFiles(wtId, value.trim());
      setSearchResults(results);
    }, 200);
  }

  function clearSearch() {
    setSearchQuery('');
    setSearchResults([]);
    if (debounceTimer) clearTimeout(debounceTimer);
  }

  const isSearching = () => searchQuery().trim().length > 0;

  // ── Context menu actions ──────────────────────────────────────────────
  function ctxRevealInFinder() {
    const t = contextTarget();
    if (t) revealInFinder(absolutePathFor(t.path));
  }
  function ctxOpenInDefaultApp() {
    const t = contextTarget();
    if (t) openInDefaultApp(absolutePathFor(t.path));
  }
  function ctxOpenInFinder() {
    const t = contextTarget();
    if (t) openInFinder(absolutePathFor(t.path));
  }
  function ctxOpenInTerminal() {
    const t = contextTarget();
    if (t) addTabWithData('terminal', 'Terminal', { cwd: absolutePathFor(t.path) });
  }
  async function ctxDelete() {
    const t = contextTarget();
    if (!t) return;
    const wtId = activeWorktreeId();
    if (wtId) await deleteFile(wtId, t.path);
  }
  function ctxCopyName() {
    const t = contextTarget();
    if (t) navigator.clipboard.writeText(t.name);
  }
  function ctxCopyPath() {
    const t = contextTarget();
    if (t) navigator.clipboard.writeText(t.path);
  }
  function ctxCopyAbsolutePath() {
    const t = contextTarget();
    if (t) navigator.clipboard.writeText(absolutePathFor(t.path));
  }
  function ctxNewFile() {
    const t = contextTarget();
    if (!t || !t.isDir) return;
    // Ensure dir is expanded
    const exp = expandedDirs();
    if (!exp.has(t.path)) {
      toggleDir(t.path);
    }
    setCreatingIn({ parentPath: t.path, type: 'file' });
  }
  function ctxNewFolder() {
    const t = contextTarget();
    if (!t || !t.isDir) return;
    const exp = expandedDirs();
    if (!exp.has(t.path)) {
      toggleDir(t.path);
    }
    setCreatingIn({ parentPath: t.path, type: 'folder' });
  }

  // ── Render a single virtualized row ───────────────────────────────────
  function VirtualRow(props: { node: FlatNode; start: number; size: number }) {
    const indent = props.node.depth * INDENT_PX + 8;
    const isIgnored = () => props.node.gitStatus === '!';
    const isSelected = () => !props.node.isDir && selectedFile() === props.node.path;

    if (props.node.isDir) {
      return (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${props.start}px)`,
            height: `${props.size}px`,
          }}
        >
          <div
            class={`${styles.fileItem} ${styles.fileItemDir} ${isIgnored() ? styles.fileItemIgnored : ''}`}
            style={{ 'padding-left': `${indent}px` }}
            title={props.node.path}
            onClick={() => toggleDir(props.node.path)}
            onContextMenu={(e: MouseEvent) => handleRowContextMenu(e, props.node)}
          >
            <ChevronRight
              size={12}
              class={styles.fileChevron}
              style={{ transform: props.node.expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
            <Show when={props.node.expanded} fallback={<Folder size={14} class={styles.fileIcon} />}>
              <FolderOpen size={14} class={styles.fileIcon} />
            </Show>
            <span class={styles.fileName}>{props.node.name}</span>
            <Show when={props.node.gitStatus && props.node.gitStatus !== '!'}>
              <GitBadge status={props.node.gitStatus!} />
            </Show>
          </div>
        </div>
      );
    }

    // File row
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${props.start}px)`,
          height: `${props.size}px`,
        }}
      >
        <div
          class={`${styles.fileItem} ${isSelected() ? styles.fileItemSelected : ''} ${isIgnored() ? styles.fileItemIgnored : ''}`}
          style={{ 'padding-left': `${indent}px` }}
          title={props.node.path}
          onClick={() => {
            setSelectedFile(props.node.path);
            const wtId = activeWorktreeId();
            if (wtId) openFileInEditor({ workspaceId: wtId, filePath: props.node.path });
          }}
          onContextMenu={(e: MouseEvent) => handleRowContextMenu(e, props.node)}
          draggable={true}
          onDragStart={(e: DragEvent) => {
            const abs = absolutePathFor(props.node.path);
            e.dataTransfer?.setData('text/phantom-path', abs);
            e.dataTransfer?.setData('text/plain', abs);
          }}
        >
          <FileText size={14} class={styles.fileIcon} />
          <span class={styles.fileName}>{props.node.name}</span>
          <Show when={props.node.gitStatus && props.node.gitStatus !== '!'}>
            <GitBadge status={props.node.gitStatus!} />
          </Show>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Search input */}
      <div class={styles.fileSearchWrapper}>
        <div class={styles.fileSearchInput}>
          <Search size={13} class={styles.fileSearchIcon} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery()}
            onInput={(e) => handleSearchInput(e.currentTarget.value)}
          />
          <Show when={isSearching()}>
            <button class={styles.fileSearchClear} onClick={clearSearch} title="Clear search">
              <X size={12} />
            </button>
          </Show>
        </div>
      </div>

      {/* Search results or virtualized file tree */}
      <Show
        when={isSearching()}
        fallback={
          <Show
            when={fileTree().length > 0}
            fallback={
              <div class={styles.emptyState}>
                <FileText size={24} />
                <span>No files loaded</span>
                <span class={styles.emptyStateHint}>
                  File tree will populate when a worktree is active
                </span>
              </div>
            }
          >
            {/* Scroll container with manual virtualization */}
            <div
              ref={(el: HTMLDivElement) => {
                scrollRef = el;
                setContainerHeight(el.clientHeight);
                const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
                ro.observe(el);
                onCleanup(() => ro.disconnect());
              }}
              class={styles.fileTreeVirtual}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
              {/* Spacer div for total scroll height */}
              <div
                style={{
                  height: `${flatList().length * ROW_HEIGHT}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                <For each={visibleItems()}>
                  {(node) => (
                    <VirtualRow
                      node={node}
                      start={node.offsetY}
                      size={ROW_HEIGHT}
                    />
                  )}
                </For>
              </div>

              {/* Inline create input — rendered as sticky footer inside scroll area */}
              <Show when={creatingIn()}>
                {(info) => {
                  let inputRef!: HTMLInputElement;
                  const parentIdx = flatList().findIndex((n) => n.path === info().parentPath);
                  const parentNode = parentIdx >= 0 ? flatList()[parentIdx] : null;
                  const depth = parentNode ? parentNode.depth + 1 : 0;

                  return (
                    <div
                      class={styles.createInputOverlay}
                      style={{
                        'padding-left': `${depth * INDENT_PX + 8}px`,
                      }}
                    >
                      {info().type === 'file' ? <FileText size={14} class={styles.fileIcon} /> : <Folder size={14} class={styles.fileIcon} />}
                      <input
                        autofocus
                        ref={(el: HTMLInputElement) => { inputRef = el; requestAnimationFrame(() => requestAnimationFrame(() => el.focus())); }}
                        type="text"
                        placeholder={info().type === 'file' ? 'filename' : 'folder name'}
                        class={styles.renameInput}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateSubmit(inputRef.value);
                          if (e.key === 'Escape') setCreatingIn(null);
                        }}
                        onFocusOut={() => handleCreateSubmit(inputRef.value)}
                      />
                    </div>
                  );
                }}
              </Show>
            </div>

          </Show>
        }
      >
        <Show
          when={searchResults().length > 0}
          fallback={
            <div class={styles.emptyState}>
              <Search size={20} />
              <span>No matching files</span>
            </div>
          }
        >
          <div class={styles.fileTree}>
            <For each={searchResults()}>
              {(entry) => (
                <SearchResultItem
                  entry={entry}
                  onContextMenu={(e: MouseEvent, ent: FileEntry) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextTarget({
                      path: ent.path,
                      name: ent.name,
                      isDir: ent.is_dir,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Native positioned context menu — portal to body to escape containment */}
      <Show when={contextTarget()}>
        {(target) => {
          let menuRef!: HTMLDivElement;
          const handleClickAway = (e: MouseEvent) => {
            if (menuRef && !menuRef.contains(e.target as Node)) closeContextMenu();
          };
          const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeContextMenu();
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
                class={styles.contextMenuContent}
                style={{
                  position: 'fixed',
                  left: `${target().x}px`,
                  top: `${target().y}px`,
                  'z-index': 9999,
                }}
              >
                <Show when={target().isDir}>
                  <div class={styles.contextMenuItem} onClick={() => { ctxNewFile(); closeContextMenu(); }}>
                    <FilePlus size={13} /> New File
                  </div>
                  <div class={styles.contextMenuItem} onClick={() => { ctxNewFolder(); closeContextMenu(); }}>
                    <FolderPlus size={13} /> New Folder
                  </div>
                  <div class={styles.contextMenuSeparator} />
                  <div class={styles.contextMenuItem} onClick={() => { ctxOpenInFinder(); closeContextMenu(); }}>
                    <FolderOpen size={13} /> Open in Finder
                  </div>
                  <div class={styles.contextMenuItem} onClick={() => { ctxOpenInTerminal(); closeContextMenu(); }}>
                    <Terminal size={13} /> Open in Terminal
                  </div>
                  <div class={styles.contextMenuSeparator} />
                  <div class={styles.contextMenuItem} onClick={() => { ctxDelete(); closeContextMenu(); }}>
                    <Trash2 size={13} /> Delete Folder
                  </div>
                </Show>
                <Show when={!target().isDir}>
                  <div class={styles.contextMenuItem} onClick={() => { ctxRevealInFinder(); closeContextMenu(); }}>
                    <Eye size={13} /> Reveal in Finder
                  </div>
                  <div class={styles.contextMenuItem} onClick={() => { ctxOpenInDefaultApp(); closeContextMenu(); }}>
                    <AppWindow size={13} /> Open File
                  </div>
                  <div class={styles.contextMenuSeparator} />
                  <div class={styles.contextMenuItem} onClick={() => { ctxDelete(); closeContextMenu(); }}>
                    <Trash2 size={13} /> Delete
                  </div>
                </Show>
                <div class={styles.contextMenuSeparator} />
                <div class={styles.contextMenuItem} onClick={() => { ctxCopyName(); closeContextMenu(); }}>
                  <Clipboard size={13} /> Copy Name
                </div>
                <div class={styles.contextMenuItem} onClick={() => { ctxCopyPath(); closeContextMenu(); }}>
                  <Clipboard size={13} /> Copy Path
                </div>
                <div class={styles.contextMenuItem} onClick={() => { ctxCopyAbsolutePath(); closeContextMenu(); }}>
                  <Clipboard size={13} /> Copy Absolute Path
                </div>
              </div>
            </Portal>
          );
        }}
      </Show>
    </>
  );
}
