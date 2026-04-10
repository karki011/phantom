/**
 * ChangesView — git status file list for the active worktree
 * Shows modified, added, deleted, and untracked files grouped by status.
 * @author Subash Karki
 */
import { ScrollArea, Text } from '@mantine/core';
import { useAtomValue } from 'jotai';
import { FilePlus, FileX, FilePen, FileQuestion, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { usePaneStore } from '@phantom-os/panes';
import { activeWorktreeAtom } from '../../atoms/worktrees';
import type { GitFileChange, GitStatusResult } from '../../lib/api';
import { getGitStatus } from '../../lib/api';

const STATUS_CONFIG = {
  modified: { label: 'Modified', icon: FilePen, color: 'var(--phantom-accent-gold, #f59e0b)' },
  added: { label: 'Added', icon: FilePlus, color: 'var(--phantom-status-success, #22c55e)' },
  deleted: { label: 'Deleted', icon: FileX, color: 'var(--phantom-status-error, #ef4444)' },
  renamed: { label: 'Renamed', icon: FilePen, color: 'var(--phantom-accent-cyan, #06b6d4)' },
  untracked: { label: 'Untracked', icon: FileQuestion, color: 'var(--phantom-text-muted, #888)' },
} as const;

function FileRow({ file, worktreeId }: { file: GitFileChange; worktreeId: string }) {
  const store = usePaneStore();
  const config = STATUS_CONFIG[file.status];
  const Icon = config.icon;
  const fileName = file.path.split('/').pop() ?? file.path;
  const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

  const handleClick = useCallback(() => {
    if (file.status === 'deleted') return;
    store.addPaneAsTab(
      'editor',
      { filePath: file.path, worktreeId } as Record<string, unknown>,
      fileName,
    );
  }, [file, worktreeId, fileName, store]);

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        cursor: file.status === 'deleted' ? 'default' : 'pointer',
        borderRadius: 3,
        transition: 'background-color 100ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated, #2a2a2a)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
      }}
    >
      <Icon size={12} style={{ color: config.color, flexShrink: 0 }} />
      <Text fz="0.73rem" c="var(--phantom-text-primary)" truncate style={{ flex: 1 }}>
        {fileName}
      </Text>
      {dirPath && (
        <Text fz="0.6rem" c="var(--phantom-text-muted)" truncate style={{ maxWidth: 100 }}>
          {dirPath}
        </Text>
      )}
      <Text fz="0.6rem" fw={600} c={config.color} style={{ flexShrink: 0 }}>
        {file.code}
      </Text>
    </div>
  );
}

function StatusGroup({ label, files, color, worktreeId }: {
  label: string;
  files: GitFileChange[];
  color: string;
  worktreeId: string;
}) {
  if (files.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}>
        <Text fz="0.65rem" fw={700} tt="uppercase" c={color} style={{ letterSpacing: '0.05em' }}>
          {label}
        </Text>
        <Text fz="0.6rem" c="var(--phantom-text-muted)">
          {files.length}
        </Text>
      </div>
      {files.map((file) => (
        <FileRow key={file.path} file={file} worktreeId={worktreeId} />
      ))}
    </div>
  );
}

export function ChangesView() {
  const worktree = useAtomValue(activeWorktreeAtom);
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!worktree) return;
    setLoading(true);
    getGitStatus(worktree.id)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [worktree?.id]);

  // Fetch on mount + poll every 10s
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!worktree) {
    return (
      <Text fz="0.75rem" c="var(--phantom-text-muted)" ta="center" py="xl" px="sm">
        Select a worktree to view changes.
      </Text>
    );
  }

  const totalChanges = status
    ? status.added + status.modified + status.deleted + status.untracked
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderBottom: '1px solid var(--phantom-border-subtle)',
          flexShrink: 0,
        }}
      >
        <Text fz="0.7rem" fw={600} c="var(--phantom-text-secondary)" style={{ flex: 1 }}>
          {worktree.name}
        </Text>
        <Text fz="0.65rem" c="var(--phantom-text-muted)">
          {totalChanges} change{totalChanges !== 1 ? 's' : ''}
        </Text>
        <RefreshCw
          size={11}
          style={{
            color: 'var(--phantom-text-muted)',
            cursor: 'pointer',
            animation: loading ? 'spin 1s linear infinite' : 'none',
          }}
          onClick={refresh}
        />
      </div>

      {/* File list */}
      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
        <div style={{ padding: '4px 0' }}>
          {status && totalChanges > 0 ? (
            <>
              <StatusGroup
                label="Modified"
                files={status.files.filter((f) => f.status === 'modified' || f.status === 'renamed')}
                color={STATUS_CONFIG.modified.color}
                worktreeId={worktree.id}
              />
              <StatusGroup
                label="Added"
                files={status.files.filter((f) => f.status === 'added')}
                color={STATUS_CONFIG.added.color}
                worktreeId={worktree.id}
              />
              <StatusGroup
                label="Untracked"
                files={status.files.filter((f) => f.status === 'untracked')}
                color={STATUS_CONFIG.untracked.color}
                worktreeId={worktree.id}
              />
              <StatusGroup
                label="Deleted"
                files={status.files.filter((f) => f.status === 'deleted')}
                color={STATUS_CONFIG.deleted.color}
                worktreeId={worktree.id}
              />
            </>
          ) : status && totalChanges === 0 ? (
            <Text fz="0.75rem" c="var(--phantom-text-muted)" ta="center" py="xl" px="sm">
              Working tree clean
            </Text>
          ) : null}
        </div>
      </ScrollArea>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
