/**
 * GitInitModal — prompt to initialize git when opening a non-git directory.
 * Offers to run `git init` and then add the project in one step.
 * Shows onboarding-style progress during initialization.
 *
 * @author Subash Karki
 */
import { Button, Group, Stack, Text } from '@mantine/core';
import { AlertTriangle, GitBranch } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSetAtom } from 'jotai';

import { openRepositoryAtom } from '../../atoms/worktrees';
import { gitInitRepository } from '../../lib/api';
import { showSystemNotification } from '../notifications/SystemToast';
import { PhantomModal } from '../PhantomModal';
import { ProgressLog, type ProgressEntry } from './ProgressLog';

interface GitInitModalProps {
  opened: boolean;
  onClose: () => void;
  folderPath: string | null;
}

export function GitInitModal({ opened, onClose, folderPath }: GitInitModalProps) {
  const openRepo = useSetAtom(openRepositoryAtom);

  const [initializing, setInitializing] = useState(false);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [done, setDone] = useState(false);

  const handleInitAndAdd = useCallback(async () => {
    if (!folderPath) return;

    const folderName = folderPath.split('/').pop() ?? folderPath;
    const steps: ProgressEntry[] = [
      { name: `git init ${folderName}`, status: 'pending' },
      { name: `Add ${folderName} to projects`, status: 'pending' },
    ];

    setEntries(steps);
    setCurrentIndex(0);
    setInitializing(true);
    setDone(false);

    // Step 1: git init
    try {
      await gitInitRepository(folderPath);
      steps[0].status = 'success';
    } catch {
      steps[0].status = 'error';
      setEntries([...steps]);
      setCurrentIndex(2);
      setDone(true);
      showSystemNotification('Error', 'Failed to initialize git', 'warning');
      return;
    }
    setEntries([...steps]);

    // Step 2: add project
    setCurrentIndex(1);
    try {
      await openRepo(folderPath);
      steps[1].status = 'success';
    } catch {
      steps[1].status = 'error';
    }
    setEntries([...steps]);
    setCurrentIndex(2);
    setDone(true);

    if (steps.every((s) => s.status === 'success')) {
      showSystemNotification(
        'Repository Initialized',
        `Initialized git and added ${folderName}`,
        'success',
      );
    }
  }, [folderPath, openRepo]);

  const handleClose = useCallback(() => {
    setInitializing(false);
    setEntries([]);
    setDone(false);
    onClose();
  }, [onClose]);

  const folderName = folderPath?.split('/').pop() ?? 'this folder';

  return (
    <PhantomModal
      opened={opened}
      onClose={handleClose}
      title={initializing ? 'Initializing Repository' : 'Not a Git Repository'}
      size="md"
      closeOnClickOutside={!initializing || done}
      closeOnEscape={!initializing || done}
    >
      {/* ── Progress Phase ── */}
      {initializing && (
        <ProgressLog
          title="INITIALIZING REPOSITORY"
          doneTitle="INITIALIZATION COMPLETE"
          entries={entries}
          currentIndex={currentIndex}
          done={done}
          accentColor="#f59e0b"
          onDone={handleClose}
        />
      )}

      {/* ── Prompt Phase ── */}
      {!initializing && (
        <Stack gap="lg">
          <Group gap="md" wrap="nowrap" align="flex-start">
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
            </div>
            <Stack gap={4}>
              <Text fz="sm" c="var(--phantom-text-primary)">
                <strong>{folderName}</strong> is not a git repository.
              </Text>
              <Text fz="xs" c="var(--phantom-text-muted)">
                PhantomOS requires git to track worktrees and manage your project.
                You can initialize a new repository and add it as a project.
              </Text>
            </Stack>
          </Group>

          <Text fz="xs" c="var(--phantom-text-muted)" ff="var(--mantine-font-family-monospace)">
            {folderPath}
          </Text>

          <Group justify="flex-end" gap="md" mt="xs">
            <Button variant="subtle" size="md" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="md"
              leftSection={<GitBranch size={16} />}
              onClick={handleInitAndAdd}
            >
              Initialize Git & Add Project
            </Button>
          </Group>
        </Stack>
      )}
    </PhantomModal>
  );
}
