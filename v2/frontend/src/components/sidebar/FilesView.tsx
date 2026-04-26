// PhantomOS v2 — File tree view with lazy-loaded directories and git status badges
// Author: Subash Karki

import { For, Show, createSignal, createEffect, on, onCleanup } from 'solid-js';
import { Collapsible } from '@kobalte/core/collapsible';
import { ContextMenu } from '@kobalte/core/context-menu';
import { ChevronRight, Folder, FolderOpen, FileText, Search, X, Eye, AppWindow, Terminal, Clipboard, FilePlus, FolderPlus, Trash2 } from 'lucide-solid';
import * as styles from '@/styles/right-sidebar.css';
import {
  fileTree,
  setFileTree,
  setFilesCount,
  selectedFile,
  setSelectedFile,
  type FileNode,
} from '@/core/signals/files';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { listWorkspaceFiles, listWorkspaceDir, searchWorkspaceFiles, revealInFinder, openInFinder, openInDefaultApp, createFile, createFolder, deleteFile } from '@/core/bindings';
import { addTabWithData } from '@/core/panes/signals';
import { openFileInEditor } from '@/core/editor/open-file';
import { showToast } from '@/shared/Toast/Toast';
import type { FileEntry } from '@/core/types';

// ── Base path helper ─────────────────────────────────────────────────────────

function getBasePath(): string {
  const wtId = activeWorktreeId();
  if (!wtId) return '';
  for (const workspaces of Object.values(worktreeMap())) {
    const match = workspaces.find((w) => w.id === wtId);
    if (match) return match.worktree_path ?? '';
  }
  return '';
}

// ── Git badge ─────────────────────────────────────────────────────────────────

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

// ── File tree item (recursive) ────────────────────────────────────────────────

function FileTreeItem(props: { node: FileNode; depth: number }) {
  const [expanded, setExpanded] = createSignal(props.node.expanded ?? false);
  const [children, setChildren] = createSignal<FileNode[]>(props.node.children ?? []);
  const [loaded, setLoaded] = createSignal(false);
  const [creating, setCreating] = createSignal<'file' | 'folder' | null>(null);

  const indent = () => props.depth * 12;
  const isSelected = () => !props.node.isDir && selectedFile() === props.node.path;

  async function handleExpand(open: boolean) {
    setExpanded(open);
    if (open && !loaded() && props.node.isDir) {
      const wtId = activeWorktreeId();
      if (!wtId) return;
      const entries = await listWorkspaceDir(wtId, props.node.path);
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
      setChildren(nodes);
      setLoaded(true);
    }
  }

  const isIgnored = () => props.node.gitStatus === '!';

  const absolutePath = () => {
    const base = getBasePath();
    return base ? `${base}/${props.node.path}` : props.node.path;
  };

  if (!props.node.isDir) {
    return (
      <ContextMenu>
        <ContextMenu.Trigger
          as="div"
          class={`${styles.fileItem} ${isSelected() ? styles.fileItemSelected : ''} ${isIgnored() ? styles.fileItemIgnored : ''}`}
          style={{ 'padding-left': `${indent() + 8}px` }}
          onClick={() => {
            setSelectedFile(props.node.path);
            const wtId = activeWorktreeId();
            if (wtId) openFileInEditor({ workspaceId: wtId, filePath: props.node.path });
          }}
          title={props.node.path}
          draggable={true}
          onDragStart={(e: DragEvent) => {
            e.dataTransfer?.setData('text/phantom-path', absolutePath());
            e.dataTransfer?.setData('text/plain', absolutePath());
          }}
        >
          <FileText size={14} class={styles.fileIcon} />
          <span class={styles.fileName}>{props.node.name}</span>
          <Show when={props.node.gitStatus && props.node.gitStatus !== '!'}>
            <GitBadge status={props.node.gitStatus!} />
          </Show>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content class={styles.contextMenuContent}>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => revealInFinder(absolutePath())}>
              <Eye size={13} />
              Reveal in Finder
            </ContextMenu.Item>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => openInDefaultApp(absolutePath())}>
              <AppWindow size={13} />
              Open File
            </ContextMenu.Item>
            <ContextMenu.Separator class={styles.contextMenuSeparator} />
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={async () => {
              const wtId = activeWorktreeId();
              if (!wtId) return;
              const ok = await deleteFile(wtId, props.node.path);
              if (ok) {
                showToast('Deleted', props.node.name);
              }
            }}>
              <Trash2 size={13} />
              Delete
            </ContextMenu.Item>
            <ContextMenu.Separator class={styles.contextMenuSeparator} />
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(props.node.name); showToast('Copied', props.node.name); }}>
              <Clipboard size={13} />
              Copy File Name
            </ContextMenu.Item>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(props.node.path); showToast('Copied', props.node.path); }}>
              <Clipboard size={13} />
              Copy Path
            </ContextMenu.Item>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(absolutePath()); showToast('Copied', absolutePath()); }}>
              <Clipboard size={13} />
              Copy Absolute Path
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenu.Trigger as="div">
        <Collapsible open={expanded()} onOpenChange={handleExpand}>
          <Collapsible.Trigger
            class={`${styles.fileItem} ${styles.fileItemDir} ${isIgnored() ? styles.fileItemIgnored : ''}`}
            style={{ 'padding-left': `${indent() + 8}px` }}
            title={props.node.path}
          >
            <ChevronRight size={12} class={styles.fileChevron} />
            <Show when={expanded()} fallback={<Folder size={14} class={styles.fileIcon} />}>
              <FolderOpen size={14} class={styles.fileIcon} />
            </Show>
            <span class={styles.fileName}>{props.node.name}</span>
            <Show when={props.node.gitStatus && props.node.gitStatus !== '!'}>
              <GitBadge status={props.node.gitStatus!} />
            </Show>
          </Collapsible.Trigger>

          <Collapsible.Content>
            <Show when={creating()}>
              {(type) => {
                let inputRef!: HTMLInputElement;
                const handleSubmit = async () => {
                  const name = inputRef.value.trim();
                  setCreating(null);
                  if (!name) return;
                  const wtId = activeWorktreeId();
                  if (!wtId) return;
                  const newPath = props.node.path ? `${props.node.path}/${name}` : name;
                  const ok = type() === 'file'
                    ? await createFile(wtId, newPath)
                    : await createFolder(wtId, newPath);
                  if (ok) {
                    showToast('Created', newPath);
                    setLoaded(false);
                    handleExpand(true);
                    if (type() === 'file') openFileInEditor({ workspaceId: wtId, filePath: newPath });
                  }
                };
                return (
                  <div
                    class={styles.fileItem}
                    style={{ 'padding-left': `${(props.depth + 1) * 12 + 8}px` }}
                  >
                    {type() === 'file' ? <FileText size={14} class={styles.fileIcon} /> : <Folder size={14} class={styles.fileIcon} />}
                    <input
                      ref={(el: HTMLInputElement) => { inputRef = el; setTimeout(() => el.focus(), 0); }}
                      type="text"
                      placeholder={type() === 'file' ? 'filename' : 'folder name'}
                      style={{ background: 'var(--color-bg-input, #1a1a2e)', border: '1px solid var(--color-border-focus, #4a9eff)', color: 'inherit', 'font-size': '12px', padding: '1px 4px', 'border-radius': '3px', outline: 'none', flex: '1', 'min-width': '0' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setCreating(null); }}
                      onFocusOut={handleSubmit}
                    />
                  </div>
                );
              }}
            </Show>
            <Show when={children().length > 0}>
              <For each={children()}>
                {(child) => <FileTreeItem node={child} depth={props.depth + 1} />}
              </For>
            </Show>
          </Collapsible.Content>
        </Collapsible>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenuContent}>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { setCreating('file'); if (!expanded()) handleExpand(true); }}>
            <FilePlus size={13} />
            New File
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { setCreating('folder'); if (!expanded()) handleExpand(true); }}>
            <FolderPlus size={13} />
            New Folder
          </ContextMenu.Item>
          <ContextMenu.Separator class={styles.contextMenuSeparator} />
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => openInFinder(absolutePath())}>
            <FolderOpen size={13} />
            Open in Finder
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => addTabWithData('terminal', 'Terminal', { cwd: absolutePath() })}>
            <Terminal size={13} />
            Open in Terminal
          </ContextMenu.Item>
          <ContextMenu.Separator class={styles.contextMenuSeparator} />
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={async () => {
            const wtId = activeWorktreeId();
            if (!wtId) return;
            const ok = await deleteFile(wtId, props.node.path);
            if (ok) {
              showToast('Deleted', props.node.name);
            }
          }}>
            <Trash2 size={13} />
            Delete Folder
          </ContextMenu.Item>
          <ContextMenu.Separator class={styles.contextMenuSeparator} />
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(props.node.name); showToast('Copied', props.node.name); }}>
            <Clipboard size={13} />
            Copy Folder Name
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(props.node.path); showToast('Copied', props.node.path); }}>
            <Clipboard size={13} />
            Copy Path
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(absolutePath()); showToast('Copied', absolutePath()); }}>
            <Clipboard size={13} />
            Copy Absolute Path
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}

// ── Search result item ───────────────────────────────────────────────────────

function SearchResultItem(props: { entry: FileEntry }) {
  const dirPart = () => {
    const idx = props.entry.path.lastIndexOf('/');
    return idx > 0 ? props.entry.path.substring(0, idx) : '';
  };
  const isSelected = () => selectedFile() === props.entry.path;

  return (
    <div
      class={`${styles.fileItem} ${isSelected() ? styles.fileItemSelected : ''}`}
      style={{ 'padding-left': '8px' }}
      onClick={() => setSelectedFile(props.entry.path)}
      title={props.entry.path}
    >
      <FileText size={14} class={styles.fileIcon} />
      <span class={styles.fileName}>{props.entry.name}</span>
      <Show when={dirPart()}>
        <span class={styles.searchResultPath}>{dirPart()}</span>
      </Show>
    </div>
  );
}

// ── Files view ────────────────────────────────────────────────────────────────

export function FilesView() {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchResults, setSearchResults] = createSignal<FileEntry[]>([]);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // Load the file tree when active worktree changes
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
    // Sort: directories first, then files, alphabetically
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setFileTree(nodes);
    setFilesCount(nodes.length);
  }));

  // Debounced search
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

      {/* Search results or file tree */}
      <Show
        when={isSearching()}
        fallback={
          <Show
            when={fileTree().length > 0}
            fallback={
              <div class={styles.emptyState}>
                <FileText size={24} />
                <span>No files loaded</span>
                <span style={{ 'font-size': '10px', opacity: '0.6' }}>
                  File tree will populate when a worktree is active
                </span>
              </div>
            }
          >
            <div class={styles.fileTree}>
              <For each={fileTree()}>
                {(node) => <FileTreeItem node={node} depth={0} />}
              </For>
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
              {(entry) => <SearchResultItem entry={entry} />}
            </For>
          </div>
        </Show>
      </Show>
    </>
  );
}
