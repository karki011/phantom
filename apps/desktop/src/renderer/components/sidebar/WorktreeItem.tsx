/**
 * WorktreeItem — single worktree entry in the left sidebar
 * Supports inline rename (double-click), inline delete confirm, and context menu
 *
 * @author Subash Karki
 */
import { Button, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { AlertTriangle, GitFork } from 'lucide-react';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitStatusResult, WorktreeData } from '../../lib/api';
import { getGitStatus } from '../../lib/api';
import { deleteWorktreeAtom, updateWorktreeAtom } from '../../atoms/worktrees';
import { showSystemNotification } from '../notifications/SystemToast';
import { WorktreeContextMenu } from './WorktreeContextMenu';

interface WorktreeItemProps {
  worktree: WorktreeData;
  isActive: boolean;
  onSelect: (id: string) => void;
  isLast?: boolean;
}

export function WorktreeItem({
  worktree,
  isActive,
  onSelect,
  isLast,
}: WorktreeItemProps) {
  const deleteWorktree = useSetAtom(deleteWorktreeAtom);
  const updateWorktree = useSetAtom(updateWorktreeAtom);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(worktree.name);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Poll git status every 15s
  useEffect(() => {
    const fetch = () => getGitStatus(worktree.id).then(setGitStatus).catch(() => {});
    fetch();
    const interval = setInterval(fetch, 15_000);
    return () => clearInterval(interval);
  }, [worktree.id]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleStartRename = useCallback(() => {
    setRenameValue(worktree.name);
    setIsRenaming(true);
  }, [worktree.name]);

  const handleRenameSubmit = useCallback(async () => {
    const newName = renameValue.trim();
    if (!newName || newName === worktree.name) {
      setIsRenaming(false);
      return;
    }
    try {
      await updateWorktree({ id: worktree.id, data: { name: newName } });
    } catch {
      // Error handled at atom level
    }
    setIsRenaming(false);
  }, [renameValue, worktree.id, worktree.name, updateWorktree]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRenameSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsRenaming(false);
      }
    },
    [handleRenameSubmit],
  );

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteWorktree(worktree.id);
      showSystemNotification(
        'Worktree Deleted',
        `"${worktree.name}" has been deleted.`,
        'success',
      );
    } catch {
      showSystemNotification(
        'Error',
        `Failed to delete "${worktree.name}".`,
        'warning',
      );
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  }, [worktree.id, worktree.name, deleteWorktree]);

  const handleOpenTerminal = useCallback(() => {
    const api = window.phantomOS;
    if (api?.invoke) {
      api.invoke('phantom:open-terminal', { worktreeId: worktree.id });
    }
  }, [worktree.id]);

  // Inline delete confirmation
  if (isConfirmingDelete) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          height: 28,
          backgroundColor: 'rgba(255, 59, 48, 0.08)',
          borderRadius: 4,
        }}
      >
        <Text fz="0.7rem" c="red" fw={600} style={{ flex: 1 }}>
          Delete?
        </Text>
        <Button
          size="compact-xs"
          color="red"
          variant="filled"
          onClick={handleDelete}
          loading={isDeleting}
          styles={{ root: { height: 20, fontSize: '0.65rem', padding: '0 6px' } }}
        >
          Yes
        </Button>
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() => setIsConfirmingDelete(false)}
          disabled={isDeleting}
          styles={{
            root: { height: 20, fontSize: '0.65rem', padding: '0 6px' },
            label: { color: 'var(--phantom-text-muted)' },
          }}
        >
          No
        </Button>
      </div>
    );
  }

  // Inline rename mode
  if (isRenaming) {
    return (
      <div style={{ padding: '2px 8px' }}>
        <TextInput
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.currentTarget.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameSubmit}
          size="xs"
          styles={{
            input: {
              height: 28,
              minHeight: 28,
              fontSize: '0.75rem',
              backgroundColor: 'var(--phantom-surface-bg)',
              borderColor: 'var(--phantom-border-subtle)',
              color: 'var(--phantom-text-primary)',
            },
          }}
        />
      </div>
    );
  }

  return (
    <WorktreeContextMenu
      worktreePath={worktree.worktreePath ?? undefined}
      onRename={handleStartRename}
      onOpenTerminal={handleOpenTerminal}
      onDelete={() => setIsConfirmingDelete(true)}
    >
      <Tooltip
        label={[
          worktree.branch && `Branch: ${worktree.branch}`,
          worktree.baseBranch && worktree.baseBranch !== worktree.branch && `From: ${worktree.baseBranch}`,
          worktree.worktreePath && `Path: ${worktree.worktreePath}`,
        ].filter(Boolean).join('\n')}
        multiline
        position="right"
        withArrow
        openDelay={400}
        styles={{ tooltip: { whiteSpace: 'pre-line', fontSize: '0.7rem', maxWidth: 320 } }}
      >
      <UnstyledButton
        onClick={() => onSelect(worktree.id)}
        onDoubleClick={handleStartRename}
        py={5}
        px={8}
        style={{
          display: 'block',
          width: '100%',
          borderRadius: 4,
          marginBottom: 2,
          backgroundColor: isActive
            ? 'var(--phantom-surface-hover)'
            : 'transparent',
          transition: 'background-color 120ms ease',
        }}
        onMouseEnter={(e) => {
          if (!isActive)
            (e.currentTarget as HTMLElement).style.backgroundColor =
              'var(--phantom-surface-card)';
        }}
        onMouseLeave={(e) => {
          if (!isActive)
            (e.currentTarget as HTMLElement).style.backgroundColor =
              'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
          <GitFork
            size={12}
            style={{
              color: worktree.color || 'var(--phantom-accent-purple)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text
              fz="0.8rem"
              fw={isActive ? 500 : 400}
              c="var(--phantom-text-primary)"
              truncate
            >
              {worktree.name}
            </Text>
            {gitStatus && (gitStatus.added + gitStatus.modified + gitStatus.deleted + gitStatus.untracked > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--phantom-text-muted)' }}>
                  {gitStatus.files.length} file{gitStatus.files.length !== 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {gitStatus.modified > 0 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--phantom-accent-gold, #f59e0b)' }}>
                      ~{gitStatus.modified}
                    </span>
                  )}
                  {(gitStatus.added + gitStatus.untracked) > 0 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--phantom-status-success, #22c55e)' }}>
                      +{gitStatus.added + gitStatus.untracked}
                    </span>
                  )}
                  {gitStatus.deleted > 0 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--phantom-status-error, #ef4444)' }}>
                      -{gitStatus.deleted}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          {worktree.worktreeValid === false && (
            <AlertTriangle
              size={12}
              style={{ color: 'var(--phantom-status-warning)', flexShrink: 0 }}
              title="Worktree missing — click to re-create or delete"
            />
          )}
        </div>
      </UnstyledButton>
      </Tooltip>
    </WorktreeContextMenu>
  );
}
