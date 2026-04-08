/**
 * RemoveProjectDialog — confirmation modal for removing a project
 * The ONLY modal in the entire sidebar flow
 *
 * @author Subash Karki
 */
import { Button, Checkbox, Group, Modal, Text } from '@mantine/core';
import { useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';
import { deleteProjectAtom } from '../../atoms/workspaces';
import { showSystemNotification } from '../notifications/SystemToast';

interface RemoveProjectDialogProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  workspaceCount: number;
}

export function RemoveProjectDialog({
  opened,
  onClose,
  projectId,
  projectName,
  workspaceCount,
}: RemoveProjectDialogProps) {
  const deleteProject = useSetAtom(deleteProjectAtom);
  const [deleteWorktrees, setDeleteWorktrees] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleRemove = useCallback(async () => {
    setSubmitting(true);
    try {
      await deleteProject({ id: projectId, deleteWorktrees });
      showSystemNotification(
        'Project Removed',
        `"${projectName}" has been removed.`,
        'success',
      );
      onClose();
      setDeleteWorktrees(false);
    } catch {
      showSystemNotification(
        'Error',
        `Failed to remove "${projectName}".`,
        'warning',
      );
    } finally {
      setSubmitting(false);
    }
  }, [projectId, projectName, deleteWorktrees, deleteProject, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Remove "${projectName}"?`}
      size="sm"
      centered
      padding="lg"
      radius="md"
      styles={{
        header: {
          backgroundColor: 'var(--phantom-surface-card)',
          borderBottom: '1px solid var(--phantom-border-subtle)',
          padding: '12px 20px',
        },
        title: {
          fontSize: '0.9rem',
          fontWeight: 600,
          color: 'var(--phantom-text-primary)',
        },
        body: {
          backgroundColor: 'var(--phantom-surface-bg)',
          padding: '20px',
        },
        content: {
          backgroundColor: 'var(--phantom-surface-bg)',
        },
      }}
    >
      {workspaceCount > 0 && (
        <Text fz="0.8rem" c="var(--phantom-text-secondary)" mb="md">
          {workspaceCount} workspace{workspaceCount !== 1 ? 's' : ''} will be
          removed.
        </Text>
      )}

      <Checkbox
        label="Also delete git worktrees from disk"
        checked={deleteWorktrees}
        onChange={(e) => setDeleteWorktrees(e.currentTarget.checked)}
        mb="lg"
        size="sm"
        styles={{
          label: {
            fontSize: '0.8rem',
            color: 'var(--phantom-text-secondary)',
          },
        }}
      />

      <Group justify="flex-end" gap="sm">
        <Button
          variant="subtle"
          size="xs"
          onClick={onClose}
          disabled={submitting}
          styles={{
            label: { color: 'var(--phantom-text-secondary)' },
          }}
        >
          Cancel
        </Button>
        <Button
          color="red"
          size="xs"
          onClick={handleRemove}
          loading={submitting}
        >
          Remove
        </Button>
      </Group>
    </Modal>
  );
}
