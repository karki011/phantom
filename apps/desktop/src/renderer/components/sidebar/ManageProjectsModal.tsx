/**
 * ManageProjectsModal — bulk remove projects from the sidebar.
 * Checkbox list lets the user select multiple projects to remove at once.
 * Shows onboarding-style progress during removal.
 *
 * @author Subash Karki
 */
import {
  Button,
  Checkbox,
  Group,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { FolderGit2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';

import {
  deleteProjectAtom,
  projectsAtom,
  refreshProjectsAtom,
  refreshWorktreesAtom,
} from '../../atoms/worktrees';
import { shortenPath } from '../../lib/paths';
import { showSystemNotification } from '../notifications/SystemToast';
import { PhantomModal } from '../PhantomModal';
import { ProgressLog, type ProgressEntry } from './ProgressLog';

interface ManageProjectsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function ManageProjectsModal({ opened, onClose }: ManageProjectsModalProps) {
  const projects = useAtomValue(projectsAtom);
  const deleteProject = useSetAtom(deleteProjectAtom);
  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorktrees = useSetAtom(refreshWorktreesAtom);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmStep, setConfirmStep] = useState(false);

  const [removing, setRemoving] = useState(false);
  const [removeEntries, setRemoveEntries] = useState<ProgressEntry[]>([]);
  const [removeIndex, setRemoveIndex] = useState(0);
  const [removeDone, setRemoveDone] = useState(false);

  // Reset on open
  useEffect(() => {
    if (opened) {
      setSelected(new Set());
      setConfirmStep(false);
      setRemoving(false);
      setRemoveEntries([]);
      setRemoveIndex(0);
      setRemoveDone(false);
    }
  }, [opened]);

  const toggleProject = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === projects.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(projects.map((p) => p.id)));
    }
  }, [projects, selected]);

  const handleRemove = useCallback(async () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }

    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const entries: ProgressEntry[] = ids.map((id) => ({
      name: projects.find((p) => p.id === id)?.name ?? id,
      status: 'pending' as const,
    }));

    setRemoveEntries(entries);
    setRemoveIndex(0);
    setRemoving(true);
    setRemoveDone(false);

    let removed = 0;
    let errors = 0;

    for (let i = 0; i < ids.length; i++) {
      setRemoveIndex(i);
      try {
        await deleteProject({ id: ids[i] });
        entries[i].status = 'success';
        removed++;
      } catch {
        entries[i].status = 'error';
        errors++;
      }
      setRemoveEntries([...entries]);
    }

    setRemoveIndex(ids.length);
    setRemoveDone(true);

    refreshProjects();
    refreshWorktrees();

    if (errors > 0) {
      showSystemNotification(
        'Removal Complete',
        `Removed ${removed} project${removed !== 1 ? 's' : ''}, ${errors} failed`,
        'warning',
      );
    } else {
      showSystemNotification(
        'Projects Removed',
        `Removed ${removed} project${removed !== 1 ? 's' : ''}`,
        'success',
      );
    }
  }, [selected, confirmStep, projects, deleteProject, refreshProjects, refreshWorktrees]);

  return (
    <PhantomModal
      opened={opened}
      onClose={onClose}
      title={removing ? 'Removing Projects' : 'Manage Projects'}
      closeOnClickOutside={!removing || removeDone}
      closeOnEscape={!removing || removeDone}
      size="lg"
    >
      <Stack gap="md">
        {/* ── Removal Progress Phase ── */}
        {removing && (
          <ProgressLog
            title="REMOVING PROJECTS"
            doneTitle="REMOVAL COMPLETE"
            entries={removeEntries}
            currentIndex={removeIndex}
            done={removeDone}
            accentColor="#ef4444"
            onDone={onClose}
          />
        )}

        {/* ── Selection Phase ── */}
        {!removing && projects.length === 0 && (
          <Text fz="sm" c="var(--phantom-text-muted)" ta="center" py="lg">
            No projects to manage.
          </Text>
        )}

        {!removing && projects.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Text fz="xs" c="var(--phantom-text-muted)">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
                {selected.size > 0 && ` — ${selected.size} selected`}
              </Text>
              <Button variant="subtle" size="xs" onClick={toggleAll}>
                {selected.size === projects.length ? 'Deselect all' : 'Select all'}
              </Button>
            </Group>

            <ScrollArea.Autosize mah={360}>
              <Stack gap={2}>
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => toggleProject(project.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      backgroundColor: selected.has(project.id)
                        ? 'var(--phantom-surface-hover)'
                        : 'transparent',
                      transition: 'background-color 100ms ease',
                    }}
                  >
                    <Checkbox
                      size="xs"
                      checked={selected.has(project.id)}
                      onChange={() => toggleProject(project.id)}
                      onClick={(e) => e.stopPropagation()}
                      styles={{ input: { cursor: 'pointer' } }}
                    />
                    <FolderGit2 size={14} style={{ color: 'var(--phantom-accent-cyan)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text fz="0.82rem" fw={500} c="var(--phantom-text-primary)" truncate>
                        {project.name}
                      </Text>
                      <Text fz="0.7rem" c="var(--phantom-text-muted)" truncate>
                        {shortenPath(project.repoPath)}
                      </Text>
                    </div>
                  </div>
                ))}
              </Stack>
            </ScrollArea.Autosize>

            {confirmStep && selected.size > 0 && (
              <Text fz="xs" c="var(--phantom-status-error)" ta="center">
                This will remove {selected.size} project{selected.size !== 1 ? 's' : ''} and their worktrees. Are you sure?
              </Text>
            )}

            <Group justify="flex-end" gap="md" mt="xs">
              <Button variant="subtle" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="md"
                color="red"
                disabled={selected.size === 0}
                onClick={handleRemove}
                leftSection={<Trash2 size={16} />}
              >
                {confirmStep
                  ? `Confirm Remove ${selected.size}`
                  : `Remove ${selected.size} Project${selected.size !== 1 ? 's' : ''}`}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </PhantomModal>
  );
}
