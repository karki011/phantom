/**
 * CloneRepoModal — modal form for cloning a remote repository.
 * Matches the New Worktree modal layout via PhantomModal.
 *
 * @author Subash Karki
 */
import {
  ActionIcon,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';

import { cloneRepositoryAtom } from '../../atoms/worktrees';
import { showSystemNotification } from '../notifications/SystemToast';
import { PhantomModal } from '../PhantomModal';

interface CloneRepoModalProps {
  opened: boolean;
  onClose: () => void;
}

const deriveRepoName = (url: string): string => {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  const lastSegment = cleaned.split('/').pop() || '';
  return lastSegment || 'repo';
};

const DEFAULT_BASE = '~/Projects';

export function CloneRepoModal({ opened, onClose }: CloneRepoModalProps) {
  const cloneRepo = useSetAtom(cloneRepositoryAtom);

  const [url, setUrl] = useState('');
  const [targetDir, setTargetDir] = useState('');
  const [dirEdited, setDirEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // Derive save location from URL when user hasn't manually edited it
  useEffect(() => {
    if (!dirEdited && url.trim()) {
      const repoName = deriveRepoName(url.trim());
      setTargetDir(`${DEFAULT_BASE}/${repoName}`);
    }
  }, [url, dirEdited]);

  // Reset state when modal opens + auto-focus
  useEffect(() => {
    if (opened) {
      setUrl('');
      setTargetDir('');
      setDirEdited(false);
      setSubmitting(false);
      setError(null);
      const timer = setTimeout(() => urlRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [opened]);

  const handlePickFolder = useCallback(async () => {
    try {
      const api = window.phantomOS;
      if (api?.invoke) {
        const result = await api.invoke('phantom:pick-folder');
        if (result) {
          setTargetDir(result as string);
          setDirEdited(true);
        }
      }
    } catch {
      // Silent — folder picker may not be available
    }
  }, []);

  const handleClone = useCallback(async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const dir = targetDir.trim() || undefined;
      const result = await cloneRepo({ url: trimmedUrl, targetDir: dir });
      if (result.alreadyExists) {
        showSystemNotification(
          'Repository Found',
          `${deriveRepoName(trimmedUrl)} already exists — added to projects`,
          'success',
        );
      } else {
        showSystemNotification(
          'Repository Cloned',
          `Cloned ${deriveRepoName(trimmedUrl)}`,
          'success',
        );
      }
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to clone repository';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [url, targetDir, cloneRepo, onClose, submitting]);

  const repoName = url.trim() ? deriveRepoName(url.trim()) : '';
  const previewPath = targetDir.trim()
    ? targetDir.trim()
    : repoName
      ? `${DEFAULT_BASE}/${repoName}`
      : '';

  return (
    <PhantomModal
      opened={opened}
      onClose={onClose}
      title="Clone Repository"
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) handleClone(); }}>
        <Stack gap="lg">
          <TextInput
            ref={urlRef}
            label="Repository URL"
            placeholder="https://github.com/user/repo.git"
            description="HTTPS or SSH URL of the git repository"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            size="md"
            disabled={submitting}
          />

          <TextInput
            label="Save Location"
            placeholder={`${DEFAULT_BASE}/${repoName || 'repo'}`}
            description="Directory where the repository will be cloned"
            value={targetDir}
            onChange={(e) => {
              setTargetDir(e.currentTarget.value);
              setDirEdited(true);
            }}
            size="md"
            disabled={submitting}
            rightSection={
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handlePickFolder}
                disabled={submitting}
                aria-label="Browse folder"
              >
                <FolderOpen
                  size={14}
                  style={{ color: 'var(--phantom-text-muted)' }}
                />
              </ActionIcon>
            }
          />

          {previewPath && (
            <Text fz="xs" c="var(--phantom-text-muted)">
              Will clone to: <strong>{previewPath}</strong>
            </Text>
          )}

          {error && (
            <Text fz="xs" c="red">
              {error}
            </Text>
          )}

          <Group justify="flex-end" gap="md" mt="xs">
            <Button variant="subtle" size="md" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="md"
              loading={submitting}
              disabled={!url.trim()}
            >
              Clone Repository
            </Button>
          </Group>
        </Stack>
      </form>
    </PhantomModal>
  );
}
