/**
 * WorkspaceItem — single workspace entry in the left sidebar
 * Supports inline rename (double-click), inline delete confirm, and context menu
 *
 * @author Subash Karki
 */
import { Badge, Button, Group, Text, TextInput, UnstyledButton } from '@mantine/core';
import { GitBranch } from 'lucide-react';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceData } from '../../lib/api';
import { deleteWorkspaceAtom, updateWorkspaceAtom } from '../../atoms/workspaces';
import { showSystemNotification } from '../notifications/SystemToast';
import { WorkspaceContextMenu } from './WorkspaceContextMenu';

interface WorkspaceItemProps {
  workspace: WorkspaceData;
  isActive: boolean;
  onSelect: (id: string) => void;
}

export function WorkspaceItem({
  workspace,
  isActive,
  onSelect,
}: WorkspaceItemProps) {
  const deleteWorkspace = useSetAtom(deleteWorkspaceAtom);
  const updateWorkspace = useSetAtom(updateWorkspaceAtom);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace.name);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleStartRename = useCallback(() => {
    setRenameValue(workspace.name);
    setIsRenaming(true);
  }, [workspace.name]);

  const handleRenameSubmit = useCallback(async () => {
    const newName = renameValue.trim();
    if (!newName || newName === workspace.name) {
      setIsRenaming(false);
      return;
    }
    try {
      await updateWorkspace({ id: workspace.id, data: { name: newName } });
    } catch {
      // Error handled at atom level
    }
    setIsRenaming(false);
  }, [renameValue, workspace.id, workspace.name, updateWorkspace]);

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
      await deleteWorkspace(workspace.id);
      showSystemNotification(
        'Workspace Deleted',
        `"${workspace.name}" has been deleted.`,
        'success',
      );
    } catch {
      showSystemNotification(
        'Error',
        `Failed to delete "${workspace.name}".`,
        'warning',
      );
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  }, [workspace.id, workspace.name, deleteWorkspace]);

  const handleOpenTerminal = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).phantomOS;
    if (api?.invoke) {
      api.invoke('phantom:open-terminal', { workspaceId: workspace.id });
    }
  }, [workspace.id]);

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
    <WorkspaceContextMenu
      workspacePath={workspace.worktreePath ?? undefined}
      onRename={handleStartRename}
      onOpenTerminal={handleOpenTerminal}
      onDelete={() => setIsConfirmingDelete(true)}
    >
      <UnstyledButton
        onClick={() => onSelect(workspace.id)}
        onDoubleClick={handleStartRename}
        py={4}
        px="sm"
        style={{
          display: 'block',
          width: '100%',
          borderRadius: 4,
          height: 28,
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
        <Group gap={8} wrap="nowrap">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: workspace.color || 'var(--phantom-accent-cyan)',
              flexShrink: 0,
            }}
          />
          <Text
            fz="0.8rem"
            c={
              isActive
                ? 'var(--phantom-text-primary)'
                : 'var(--phantom-text-secondary)'
            }
            truncate
            style={{ flex: 1 }}
          >
            {workspace.name}
          </Text>
          {workspace.branch && workspace.branch !== workspace.name && (
            <Badge
              size="xs"
              variant="light"
              color="gray"
              leftSection={
                workspace.type === 'worktree' ? (
                  <GitBranch size={9} style={{ marginRight: 2 }} />
                ) : undefined
              }
              style={{ flexShrink: 0 }}
            >
              {workspace.branch}
            </Badge>
          )}
        </Group>
      </UnstyledButton>
    </WorkspaceContextMenu>
  );
}
