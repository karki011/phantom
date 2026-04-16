/**
 * FilesView — virtualized file tree for the active worktree
 *
 * Uses @tanstack/react-virtual to only render ~30 visible rows instead of
 * the entire tree. The recursive tree is flattened into a list first, then
 * the virtualizer renders only the visible items.
 *
 * @author Subash Karki
 */
import { Skeleton, Text, TextInput } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { usePaneStore } from '@phantom-os/panes';
import { Search, X } from 'lucide-react';

import {
  expandedFoldersAtom,
  fetchDirectoryAtom,
  fileTreeAtom,
  isDirLoadingAtom,
  selectedFileAtom,
  toggleFolderAtom,
} from '../../atoms/fileExplorer';
import { activeWorktreeAtom } from '../../atoms/worktrees';
import type { FileEntry } from '../../lib/api';
import { FileTreeItem } from './FileTreeItem';

// ---------------------------------------------------------------------------
// Tree flattening for virtualization
// ---------------------------------------------------------------------------

interface FlatTreeItem {
  entry: FileEntry;
  depth: number;
  /** Cache key for this entry's children if it's a directory */
  cacheKey: string;
}

/**
 * Walk the tree following expanded folders and produce a flat list suitable
 * for virtual scrolling. Directories sort before files, then alphabetical.
 */
function flattenTree(
  entries: FileEntry[],
  depth: number,
  worktreeId: string,
  fileTree: Map<string, FileEntry[]>,
  expandedFolders: string[],
): FlatTreeItem[] {
  const result: FlatTreeItem[] = [];
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    const cacheKey = `${worktreeId}:${entry.relativePath}`;
    result.push({ entry, depth, cacheKey });

    if (entry.isDirectory && expandedFolders.includes(entry.relativePath)) {
      const children = fileTree.get(cacheKey);
      if (children) {
        result.push(
          ...flattenTree(children, depth + 1, worktreeId, fileTree, expandedFolders),
        );
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------

export function FilesView() {
  const activeWorktree = useAtomValue(activeWorktreeAtom);
  const fileTree = useAtomValue(fileTreeAtom);
  const deferredFileTree = useDeferredValue(fileTree);
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom);
  const isDirLoading = useAtomValue(isDirLoadingAtom);
  const [selectedFile, setSelectedFile] = useAtom(selectedFileAtom);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null);
  const deferredSearchResults = useDeferredValue(searchResults);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const isStale = deferredFileTree !== fileTree || deferredSearchResults !== searchResults;

  const fetchDirectory = useSetAtom(fetchDirectoryAtom);
  const toggleFolder = useSetAtom(toggleFolderAtom);

  const store = usePaneStore();

  // Auto-sync sidebar selection when active pane changes (editor or diff)
  const activePane = store.getActivePane();
  const activeEditorPath = (activePane?.kind === 'editor' || activePane?.kind === 'diff')
    ? (activePane.data?.filePath as string | undefined) ?? null
    : null;
  const prevEditorPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeEditorPath || !activeWorktree) return;
    // Skip if same file (avoid unnecessary updates)
    if (activeEditorPath === prevEditorPathRef.current) return;
    prevEditorPathRef.current = activeEditorPath;

    setSelectedFile(activeEditorPath);

    // Expand parent directories so the file is visible in the tree
    const normalized = activeEditorPath.replace(/^\//, '');
    const parts = normalized.split('/');
    const parentPaths: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      parentPaths.push(parts.slice(0, i).join('/'));
    }

    setExpandedFolders((prev) => {
      const toAdd = parentPaths.filter((p) => !prev.includes(p));
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });

    // Fetch any unfetched parent directories so the tree can render the file
    const fetches: Promise<void>[] = [];
    for (const dirPath of parentPaths) {
      const cacheKey = `${activeWorktree.id}:${dirPath}`;
      if (!fileTree.has(cacheKey)) {
        fetches.push(fetchDirectory({ worktreeId: activeWorktree.id, path: dirPath }));
      }
    }

    // Scroll the file into view — wait for directory fetches to complete first
    const scrollToFile = () => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-file-path="${CSS.escape(activeEditorPath)}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    };

    if (fetches.length > 0) {
      Promise.all(fetches).then(scrollToFile);
    } else {
      scrollToFile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditorPath, activeWorktree?.id]);

  // Debounced server-side file search
  useEffect(() => {
    if (!activeWorktree || !searchQuery.trim()) {
      setSearchResults(null);
      setSearchError(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(() => {
      fetch(`/api/worktrees/${activeWorktree.id}/files/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then((r) => r.json())
        .then((data: { entries: FileEntry[] }) => setSearchResults(data.entries))
        .catch(() => { setSearchResults([]); setSearchError(true); })
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, activeWorktree?.id]);

  // File tree clear + root prefetch is handled by RightSidebar (always
  // mounted). Clear search when worktree changes.
  useEffect(() => { setSearchQuery(''); }, [activeWorktree?.id]);

  // When a folder is expanded, fetch its children
  const handleToggleFolder = useCallback(
    (path: string) => {
      if (!activeWorktree) return;
      toggleFolder(path);
      const cacheKey = `${activeWorktree.id}:${path}`;
      if (!fileTree.has(cacheKey)) {
        fetchDirectory({ worktreeId: activeWorktree.id, path });
      }
    },
    [activeWorktree, toggleFolder, fetchDirectory, fileTree],
  );

  const handleFileClick = useCallback(
    (entry: FileEntry) => {
      if (!activeWorktree) return;
      setSelectedFile(entry.relativePath);
      store.addPaneAsTab('editor', {
        filePath: entry.relativePath,
        worktreeId: activeWorktree.id,
        repoPath: activeWorktree.worktreePath,
      } as Record<string, unknown>, entry.name);
    },
    [activeWorktree, setSelectedFile, store],
  );

  // Compute root entries (safe when activeWorktree is null)
  const rootKey = activeWorktree ? `${activeWorktree.id}:/` : '';
  const rootEntries = rootKey ? deferredFileTree.get(rootKey) : undefined;

  // Flatten the tree for virtualization — runs only when expanded state or
  // tree data changes. Returns an empty list when there are no root entries.
  const flatItems = useMemo(
    () =>
      rootEntries && activeWorktree
        ? flattenTree(rootEntries, 0, activeWorktree.id, deferredFileTree, expandedFolders)
        : [],
    [rootEntries, activeWorktree, deferredFileTree, expandedFolders],
  );

  // Ref for the scrollable container (plain div, not Mantine ScrollArea)
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  if (!activeWorktree) {
    return (
      <Text
        fz="0.75rem"
        c="var(--phantom-text-muted)"
        ta="center"
        py="xl"
        px="sm"
      >
        Select a worktree to explore files.
      </Text>
    );
  }

  if (activeWorktree.worktreeValid === false) {
    return (
      <Text fz="0.75rem" c="var(--phantom-status-warning)" ta="center" py="xl" px="sm">
        Worktree missing. Cannot browse files.
      </Text>
    );
  }

  if (!rootEntries) {
    return (
      <div style={{ padding: '8px 12px' }}>
        <Skeleton height={16} mb={6} />
        <Skeleton height={16} mb={6} />
        <Skeleton height={16} mb={6} />
        <Skeleton height={16} mb={6} />
        <Skeleton height={16} mb={6} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Search input */}
      <div style={{ padding: '6px 8px', flexShrink: 0 }}>
        <TextInput
          size="xs"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          leftSection={<Search size={12} style={{ color: 'var(--phantom-text-muted)' }} />}
          rightSection={
            searchQuery ? (
              <X
                size={12}
                style={{ color: 'var(--phantom-text-muted)', cursor: 'pointer' }}
                onClick={() => setSearchQuery('')}
              />
            ) : null
          }
          styles={{
            input: {
              backgroundColor: 'var(--phantom-surface-elevated)',
              borderColor: 'var(--phantom-border-subtle)',
              color: 'var(--phantom-text-primary)',
              fontSize: '0.75rem',
              '&:focus': { borderColor: 'var(--phantom-accent-glow)' },
            },
          }}
        />
      </div>

      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--phantom-border-subtle) transparent',
        }}
      >
        <div style={{ padding: '4px 0', opacity: isStale ? 0.7 : 1, transition: 'opacity 150ms' }}>
          {searching ? (
            <Text fz="0.72rem" c="var(--phantom-text-muted)" ta="center" py="md">
              Searching...
            </Text>
          ) : deferredSearchResults ? (
            // Flat search results (not virtualized — typically a small list)
            deferredSearchResults.length > 0 ? (
              deferredSearchResults.map((entry) => (
                <FileTreeItem
                  key={entry.relativePath}
                  entry={entry}
                  depth={0}
                  isExpanded={false}
                  isSelected={selectedFile === entry.relativePath}
                  isLoading={false}
                  onToggle={() => {}}
                  onClick={() => handleFileClick(entry)}
                  basePath={activeWorktree.worktreePath}
                />
              ))
            ) : searchError ? (
              <Text fz="0.72rem" c="var(--phantom-status-danger)" ta="center" py="md">
                Search failed. Try again.
              </Text>
            ) : (
              <Text fz="0.72rem" c="var(--phantom-text-muted)" ta="center" py="md">
                No files match &ldquo;{searchQuery}&rdquo;
              </Text>
            )
          ) : (
            // Virtualized tree view
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = flatItems[virtualRow.index];
                const isExpanded = expandedFolders.includes(item.entry.relativePath);
                const loading = isDirLoading(item.cacheKey);

                return (
                  <div
                    key={item.entry.relativePath}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <FileTreeItem
                      entry={item.entry}
                      depth={item.depth}
                      isExpanded={isExpanded}
                      isSelected={selectedFile === item.entry.relativePath}
                      isLoading={loading}
                      onToggle={() => handleToggleFolder(item.entry.relativePath)}
                      onClick={() => handleFileClick(item.entry)}
                      basePath={activeWorktree.worktreePath}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

