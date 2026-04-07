/**
 * NewWorkspaceModal — create a new workspace
 *
 * @author Subash Karki
 */
import { Button, Group, Modal, Select, TextInput } from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';
import { projectsAtom } from '../../atoms/workspaces';
import { createWorkspaceAtom } from '../../atoms/workspaces';

interface NewWorkspaceModalProps {
  opened: boolean;
  onClose: () => void;
  /** Pre-select a project */
  defaultProjectId?: string;
}

export function NewWorkspaceModal({
  opened,
  onClose,
  defaultProjectId,
}: NewWorkspaceModalProps) {
  const projects = useAtomValue(projectsAtom);
  const createWorkspace = useSetAtom(createWorkspaceAtom);

  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [branch, setBranch] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!projectId) return;
    setSubmitting(true);
    try {
      await createWorkspace({
        projectId,
        name: name || undefined,
        branch: branch || undefined,
      });
      onClose();
      // Reset form
      setProjectId(defaultProjectId ?? '');
      setBranch('');
      setName('');
    } catch {
      // Error is handled at the atom level
    } finally {
      setSubmitting(false);
    }
  }, [projectId, branch, name, createWorkspace, onClose, defaultProjectId]);

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="New Workspace"
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
      <Select
        label="Project"
        placeholder="Select a project"
        data={projectOptions}
        value={projectId}
        onChange={(val) => setProjectId(val ?? '')}
        required
        mb="sm"
      />
      <TextInput
        label="Workspace Name"
        placeholder="e.g. feature-auth"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        mb="sm"
      />
      <TextInput
        label="Branch"
        placeholder="e.g. feature/my-feature"
        value={branch}
        onChange={(e) => setBranch(e.currentTarget.value)}
        mb="md"
      />
      <Group justify="flex-end">
        <Button variant="subtle" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          loading={submitting}
          disabled={!projectId}
        >
          Create
        </Button>
      </Group>
    </Modal>
  );
}
