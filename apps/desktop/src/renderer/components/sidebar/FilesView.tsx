/**
 * FilesView — file tree for the active workspace
 *
 * @author Subash Karki
 */
import { ScrollArea, Skeleton, Text, TextInput } from '@mantine/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import { usePaneStore } from '@phantom-os/panes';
import { Search, X } from 'lucide-react';

import {
  clearFileTreeAtom,
  expandedFoldersAtom,
  fetchDirectoryAtom,
  fileTreeAtom,
  isDirLoadingAtom,
  selectedFileAtom,
  toggleFolderAtom,
} from '../../atoms/fileExplorer';
import { activeWorkspaceAtom } from '../../atoms/workspaces';
import type { FileEntry } from '../../lib/api';
import { FileTreeItem } from './FileTreeItem';

export function FilesView() {
  const activeWorkspace = useAtomValue(activeWorkspaceAtom);
  const fileTree = useAtomValue(fileTreeAtom);
  const expandedFolders = useAtomValue(expandedFoldersAtom);
  const isDirLoading = useAtomValue(isDirLoadingAtom);
  const [selectedFile, setSelectedFile] = useAtom(selectedFileAtom);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const fetchDirectory = useSetAtom(fetchDirectoryAtom);
  const toggleFolder = useSetAtom(toggleFolderAtom);
  const clearFileTree = useSetAtom(clearFileTreeAtom);

  const store = usePaneStore();

  // Debounced server-side file search
  useEffect(() => {
    if (!activeWorkspace || !searchQuery.trim()) {
      setSearchResults(null);
      setSearchError(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(() => {
      fetch(`/api/workspaces/${activeWorkspace.id}/files/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then((r) => r.json())
        .then((data: { entries: FileEntry[] }) => setSearchResults(data.entries))
        .catch(() => { setSearchResults([]); setSearchError(true); })
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, activeWorkspace?.id]);

  // Fetch root when workspace changes
  useEffect(() => {
    if (activeWorkspace) {
      clearFileTree();
      fetchDirectory({ workspaceId: activeWorkspace.id, path: '/' });
    }
  }, [activeWorkspace?.id, fetchDirectory, clearFileTree]);

  // When a folder is expanded, fetch its children
  const handleToggleFolder = useCallback(
    (path: string) => {
      if (!activeWorkspace) return;
      toggleFolder(path);
      const cacheKey = `${activeWorkspace.id}:${path}`;
      if (!fileTree.has(cacheKey)) {
        fetchDirectory({ workspaceId: activeWorkspace.id, path });
      }
    },
    [activeWorkspace, toggleFolder, fetchDirectory, fileTree],
  );

  const handleFileClick = useCallback(
    (entry: FileEntry) => {
      if (!activeWorkspace) return;
      setSelectedFile(entry.relativePath);
      store.addPaneAsTab('editor', {
        filePath: entry.relativePath,
        workspaceId: activeWorkspace.id,
        repoPath: activeWorkspace.worktreePath,
      } as Record<string, unknown>, entry.name);
    },
    [activeWorkspace, setSelectedFile, store],
  );

  if (!activeWorkspace) {
    return (
      <Text
        fz="0.75rem"
        c="var(--phantom-text-muted)"
        ta="center"
        py="xl"
        px="sm"
      >
        Select a workspace to explore files.
      </Text>
    );
  }

  if (activeWorkspace.worktreeValid === false) {
    return (
      <Text fz="0.75rem" c="var(--phantom-status-warning)" ta="center" py="xl" px="sm">
        Worktree missing. Cannot browse files.
      </Text>
    );
  }

  const rootKey = `${activeWorkspace.id}:/`;
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
              workspaceId={activeWorkspace.id}
              fileTree={fileTree}
              expandedFolders={expandedFolders}
              selectedFile={selectedFile}
              isDirLoading={isDirLoading}
              onToggleFolder={handleToggleFolder}
              onFileClick={handleFileClick}
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
  workspaceId: string;
  fileTree: Map<string, FileEntry[]>;
  expandedFolders: string[];
  selectedFile: string | null;
  isDirLoading: (path: string) => boolean;
  onToggleFolder: (path: string) => void;
  onFileClick: (entry: FileEntry) => void;
}

function FileTreeRecursive({
  entries,
  depth,
  workspaceId,
  fileTree,
  expandedFolders,
  selectedFile,
  isDirLoading,
  onToggleFolder,
  onFileClick,
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
        const cacheKey = `${workspaceId}:${entry.relativePath}`;
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
                  workspaceId={workspaceId}
                  fileTree={fileTree}
                  expandedFolders={expandedFolders}
                  selectedFile={selectedFile}
                  isDirLoading={isDirLoading}
                  onToggleFolder={onToggleFolder}
                  onFileClick={onFileClick}
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
