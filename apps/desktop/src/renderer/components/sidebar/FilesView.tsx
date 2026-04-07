/**
 * FilesView — file tree for the active workspace
 *
 * @author Subash Karki
 */
import { ScrollArea, Skeleton, Text } from '@mantine/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { usePaneStore } from '@phantom-os/panes';

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

  const fetchDirectory = useSetAtom(fetchDirectoryAtom);
  const toggleFolder = useSetAtom(toggleFolderAtom);
  const clearFileTree = useSetAtom(clearFileTreeAtom);

  const store = usePaneStore();

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
      store.addPane('editor', {
        filePath: entry.relativePath,
        workspaceId: activeWorkspace.id,
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
    <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
      <div style={{ padding: '4px 0' }}>
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
      </div>
    </ScrollArea>
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
            )}
            {entry.isDirectory && isExpanded && !childEntries && loading && (
              <div style={{ paddingLeft: (depth + 1) * 16 + 4, padding: '2px 0' }}>
                <Skeleton height={14} width="60%" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
