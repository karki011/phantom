/**
 * NewWorkspaceModal — modal form for creating workspaces
 * Shows name, base branch selector, and new branch name.
 *
 * @author Subash Karki
 */
import {
  Button,
  Group,
  Modal,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWorkspaceAtom } from '../../atoms/workspaces';
import { type BranchesData, getProjectBranches } from '../../lib/api';

interface InlineWorkspaceInputProps {
  projectId: string;
  defaultBranch?: string;
  onDone: () => void;
}

/** Slugify a name into a branch-safe string */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/^-|-$/g, '');

export function InlineWorkspaceInput({
  projectId,
  defaultBranch,
  onDone,
}: InlineWorkspaceInputProps) {
  const createWorkspace = useSetAtom(createWorkspaceAtom);
  const [name, setName] = useState('');
  const [baseBranch, setBaseBranch] = useState(defaultBranch ?? 'main');
  const [newBranch, setNewBranch] = useState('');
  const [branchEdited, setBranchEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<BranchesData | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Fetch branches on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProjectBranches(projectId)
      .then((data) => {
        if (!cancelled) {
          setBranches(data);
          if (data.defaultBranch) setBaseBranch(data.defaultBranch);
          else if (data.current) setBaseBranch(data.current);
        }
      })
      .catch(() => {
        if (!cancelled) setBranches({ local: [], remote: [], current: 'main' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  // Auto-focus name input once loaded
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => nameRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // Auto-generate branch name from workspace name
  useEffect(() => {
    if (!branchEdited && name.trim()) {
      setNewBranch(slugify(name));
    }
  }, [name, branchEdited]);

  const branchOptions = useMemo(() => {
    if (!branches) return [];
    const defaultBr = branches.defaultBranch ?? 'main';
    const all = [...branches.local, ...branches.remote.filter((r) => !branches.local.includes(r))];
    return all.map((b) => ({
      value: b,
      label: b === defaultBr ? `★ ${b} (default)` : b,
    }));
  }, [branches]);

  const handleSubmit = useCallback(async () => {
    const wsName = name.trim();
    const branch = newBranch.trim() || slugify(wsName);
    if (!wsName || !branch || submitting) return;
    setSubmitting(true);
    try {
      await createWorkspace({
        projectId,
        name: wsName,
        branch,
        baseBranch,
      });
      onDone();
    } catch {
      // Error handled at atom level
    } finally {
      setSubmitting(false);
    }
  }, [name, newBranch, baseBranch, projectId, createWorkspace, onDone, submitting]);

  return (
    <Modal
      opened
      onClose={onDone}
      title="New Workspace"
      size="md"
      centered
      padding="xl"
      radius="md"
      styles={{
        header: {
          backgroundColor: 'var(--phantom-surface-card)',
          borderBottom: '1px solid var(--phantom-border-subtle)',
          padding: '16px 24px',
        },
        body: { backgroundColor: 'var(--phantom-surface-bg)', padding: '24px' },
        content: { backgroundColor: 'var(--phantom-surface-bg)' },
      }}
    >
      {loading ? (
        <Stack gap="md">
          <Skeleton height={36} radius="sm" />
          <Skeleton height={36} radius="sm" />
          <Skeleton height={36} radius="sm" />
        </Stack>
      ) : (
        <Stack gap="lg">
          <TextInput
            ref={nameRef}
            label="Workspace Name"
            placeholder="e.g. auth-fix"
            description="A display name for this workspace"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            size="md"
            disabled={submitting}
          />

          <Select
            label="From Branch"
            placeholder="Select base branch"
            description="The existing branch to create the worktree from"
            data={branchOptions}
            value={baseBranch}
            onChange={(val) => setBaseBranch(val ?? 'main')}
            searchable
            size="md"
            disabled={submitting}
          />

          <TextInput
            label="New Branch"
            placeholder="auto-generated from name"
            description="A new git branch will be created for this workspace"
            value={newBranch}
            onChange={(e) => {
              setNewBranch(e.currentTarget.value);
              setBranchEdited(true);
            }}
            size="md"
            disabled={submitting}
          />

          {newBranch && baseBranch && (
            <Text fz="xs" c="var(--phantom-text-muted)">
              Will run: git worktree add -b <strong>{newBranch}</strong> ... <strong>{baseBranch}</strong>
            </Text>
          )}

          <Group justify="flex-end" gap="md" mt="xs">
            <Button variant="subtle" size="md" onClick={onDone} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="md"
              onClick={handleSubmit}
              loading={submitting}
              disabled={!name.trim() || !baseBranch}
            >
              Create Workspace
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
