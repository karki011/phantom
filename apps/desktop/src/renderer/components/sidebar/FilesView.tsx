/**
 * FilesView — file tree for the active worktree
 *
 * @author Subash Karki
 */
import { ScrollArea, Skeleton, Text, TextInput } from '@mantine/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
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

export function FilesView() {
  const activeWorktree = useAtomValue(activeWorktreeAtom);
  const fileTree = useAtomValue(fileTreeAtom);
  const [expandedFolders, setExpandedFolders] = useAtom(expandedFoldersAtom);
  const isDirLoading = useAtomValue(isDirLoadingAtom);
  const [selectedFile, setSelectedFile] = useAtom(selectedFileAtom);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const fetchDirectory = useSetAtom(fetchDirectoryAtom);
  const toggleFolder = useSetAtom(toggleFolderAtom);

  const store = usePaneStore();

  // Auto-sync sidebar selection when active editor pane changes
  const activePane = store.getActivePane();
  const activeEditorPath = activePane?.kind === 'editor'
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

    // Fetch any unfetched parent directories
    for (const dirPath of parentPaths) {
      const cacheKey = `${activeWorktree.id}:${dirPath}`;
      if (!fileTree.has(cacheKey)) {
        fetchDirectory({ worktreeId: activeWorktree.id, path: dirPath });
      }
    }

    // Scroll the file into view after the tree renders
    setTimeout(() => {
      const el = document.querySelector(`[data-file-path="${CSS.escape(activeEditorPath)}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);
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

  const rootKey = `${activeWorktree.id}:/`;
  const rootEntries = fileTree.get(rootKey);

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

      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
        <div style={{ padding: '4px 0' }}>
          {searching ? (
            <Text fz="0.72rem" c="var(--phantom-text-muted)" ta="center" py="md">
              Searching...
            </Text>
          ) : searchResults ? (
            // Flat search results
            searchResults.length > 0 ? (
              searchResults.map((entry) => (
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
            // Normal tree view
            <FileTreeRecursive
              entries={rootEntries}
              depth={0}
              worktreeId={activeWorktree.id}
              fileTree={fileTree}
              expandedFolders={expandedFolders}
              selectedFile={selectedFile}
              isDirLoading={isDirLoading}
              onToggleFolder={handleToggleFolder}
              onFileClick={handleFileClick}
              basePath={activeWorktree.worktreePath}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive tree renderer
// ---------------------------------------------------------------------------

interface FileTreeRecursiveProps {
  entries: FileEntry[];
  depth: number;
  worktreeId: string;
  fileTree: Map<string, FileEntry[]>;
  expandedFolders: string[];
  selectedFile: string | null;
  isDirLoading: (path: string) => boolean;
  onToggleFolder: (path: string) => void;
  onFileClick: (entry: FileEntry) => void;
  basePath: string;
}

function FileTreeRecursive({
  entries,
  depth,
  worktreeId,
  fileTree,
  expandedFolders,
  selectedFile,
  isDirLoading,
  onToggleFolder,
  onFileClick,
  basePath,
}: FileTreeRecursiveProps) {
  // Sort: directories first, then alphabetical
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sorted.map((entry) => {
        const isExpanded = expandedFolders.includes(entry.relativePath);
        const cacheKey = `${worktreeId}:${entry.relativePath}`;
        const childEntries = fileTree.get(cacheKey);
        const loading = isDirLoading(cacheKey);

        return (
          <div key={entry.relativePath}>
            <FileTreeItem
              entry={entry}
              depth={depth}
              isExpanded={isExpanded}
              isSelected={selectedFile === entry.relativePath}
              isLoading={loading}
              onToggle={() => onToggleFolder(entry.relativePath)}
              onClick={() => onFileClick(entry)}
              basePath={basePath}
            />
            {entry.isDirectory && isExpanded && childEntries && (
              <div style={{ position: 'relative' }}>
                {/* Continuous indent guide line spanning all children */}
                <div
                  style={{
                    position: 'absolute',
                    left: depth * 20 + 14,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: 'var(--phantom-border-subtle)',
                    opacity: 0.4,
                  }}
                />
                <FileTreeRecursive
                  entries={childEntries}
                  depth={depth + 1}
                  worktreeId={worktreeId}
                  fileTree={fileTree}
                  expandedFolders={expandedFolders}
                  selectedFile={selectedFile}
                  isDirLoading={isDirLoading}
                  onToggleFolder={onToggleFolder}
                  onFileClick={onFileClick}
                  basePath={basePath}
                />
              </div>
            )}
            {entry.isDirectory && isExpanded && !childEntries && loading && (
              <div style={{ paddingLeft: (depth + 1) * 20 + 4, padding: '2px 0' }}>
                <Skeleton height={14} width="60%" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
