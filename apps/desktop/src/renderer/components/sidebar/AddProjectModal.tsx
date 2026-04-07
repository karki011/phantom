/**
 * AddProjectModal — add a new project (repo)
 *
 * @author Subash Karki
 */
import { Button, Group, Modal, TextInput } from '@mantine/core';
import { useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';
import { createProjectAtom } from '../../atoms/workspaces';

interface AddProjectModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AddProjectModal({ opened, onClose }: AddProjectModalProps) {
  const createProject = useSetAtom(createProjectAtom);

  const [repoPath, setRepoPath] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!repoPath.trim()) return;
    setSubmitting(true);
    try {
      await createProject({
        repoPath: repoPath.trim(),
        name: name.trim() || undefined,
      });
      onClose();
      setRepoPath('');
      setName('');
    } catch {
      // Error handled at atom level
    } finally {
      setSubmitting(false);
    }
  }, [repoPath, name, createProject, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add Project"
      size="sm"
      styles={{
        header: {
          backgroundColor: 'var(--phantom-surface-card)',
          borderBottom: '1px solid var(--phantom-border-subtle)',
        },
        body: { backgroundColor: 'var(--phantom-surface-bg)' },
        content: { backgroundColor: 'var(--phantom-surface-bg)' },
      }}
    >
      <TextInput
        label="Repository Path"
        placeholder="/path/to/repo"
        value={repoPath}
        onChange={(e) => setRepoPath(e.currentTarget.value)}
        required
        mb="sm"
      />
      <TextInput
        label="Display Name"
        placeholder="Auto-detected from repo"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        mb="md"
      />
      <Group justify="flex-end">
        <Button variant="subtle" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          loading={submitting}
          disabled={!repoPath.trim()}
        >
          Add Project
        </Button>
      </Group>
    </Modal>
  );
}
