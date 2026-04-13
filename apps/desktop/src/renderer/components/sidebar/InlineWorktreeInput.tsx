/**
 * NewWorktreeModal — modal form for creating worktrees
 * Shows name, base branch selector, and new branch name.
 *
 * @author Subash Karki
 */
import {
  Button,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { PhantomModal } from '../PhantomModal';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWorktreeAtom } from '../../atoms/worktrees';
import { type BranchesData, getProjectBranches } from '../../lib/api';

interface InlineWorktreeInputProps {
  projectId: string;
  projectName?: string;
  defaultBranch?: string;
  onDone: () => void;
  /** Called after worktree is successfully created, before onDone */
  onCreated?: (worktree: { id: string; worktreePath: string | null }) => void;
}

/** Slugify a name into a branch-safe string (max 30 chars) */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
    .replace(/-$/, '');

export function InlineWorktreeInput({
  projectId,
  projectName,
  defaultBranch,
  onDone,
  onCreated,
}: InlineWorktreeInputProps) {
  const createWorktree = useSetAtom(createWorktreeAtom);
  const [name, setName] = useState('');
  const [baseBranch, setBaseBranch] = useState(defaultBranch ?? 'main');
  const [newBranch, setNewBranch] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
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

  // Auto-generate branch name from worktree name
  useEffect(() => {
    if (name.trim()) {
      setNewBranch(slugify(name));
    }
  }, [name]);

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
      const ws = await createWorktree({
        projectId,
        name: wsName,
        branch,
        baseBranch,
        ticketUrl: ticketUrl.trim() || undefined,
      });
      if (ws) {
        onCreated?.(ws);
        // Set global flag — WorktreeHome reads it on mount after the worktree switch
        if (ws.worktreePath) {
          console.log('[InlineWorktreeInput] Setting pending Claude for', ws.worktreePath);
          (window as any).__phantomPendingClaude = ws.worktreePath;
        }
      }
      onDone();
    } catch {
      // Error handled at atom level
    } finally {
      setSubmitting(false);
    }
  }, [name, newBranch, baseBranch, ticketUrl, projectId, createWorktree, onDone, onCreated, submitting]);

  return (
    <PhantomModal
      opened
      onClose={onDone}
      title={projectName ? `New Worktree — ${projectName}` : 'New Worktree'}
    >
      {loading ? (
        <Stack gap="md">
          <Skeleton height={36} radius="sm" />
          <Skeleton height={36} radius="sm" />
          <Skeleton height={36} radius="sm" />
        </Stack>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && baseBranch) handleSubmit(); }}>
          <Stack gap="lg">
            <TextInput
              ref={nameRef}
              label="Worktree Name"
              placeholder="e.g. auth-fix"
              description="This will also be used as the branch name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value.slice(0, 50))}
              size="md"
              maxLength={50}
              disabled={submitting}
            />

            {name.trim() && baseBranch && (
              <Text fz="xs" c="var(--phantom-text-muted)" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                Branch: <strong style={{ color: 'var(--phantom-accent-cyan, #00d4ff)' }}>{newBranch}</strong> from <strong>{baseBranch}</strong>
              </Text>
            )}

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
              label="Ticket Link"
              placeholder="https://jira.example.com/browse/PROJ-123"
              description="Optional — link a Jira or issue tracker ticket"
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.currentTarget.value)}
              size="md"
              disabled={submitting}
            />

            <Group justify="flex-end" gap="md" mt="xs">
              <Button variant="subtle" size="md" onClick={onDone} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="md"
                loading={submitting}
                disabled={!name.trim() || !baseBranch}
              >
                Create Worktree
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </PhantomModal>
  );
}
