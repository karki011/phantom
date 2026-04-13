/**
 * ManageProjectsModal — bulk remove projects from the sidebar.
 * Checkbox list lets the user select multiple projects to remove at once.
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
import { showSystemNotification } from '../notifications/SystemToast';
import { PhantomModal } from '../PhantomModal';

interface ManageProjectsModalProps {
  opened: boolean;
  onClose: () => void;
}

const shortenPath = (fullPath: string): string => {
  const home = '/Users/';
  const idx = fullPath.indexOf(home);
  if (idx >= 0) {
    const rest = fullPath.slice(idx + home.length);
    const parts = rest.split('/');
    return parts.length > 1 ? `~/${parts.slice(1).join('/')}` : `~/${rest}`;
  }
  return fullPath;
};

export function ManageProjectsModal({ opened, onClose }: ManageProjectsModalProps) {
  const projects = useAtomValue(projectsAtom);
  const deleteProject = useSetAtom(deleteProjectAtom);
  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorktrees = useSetAtom(refreshWorktreesAtom);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);

  // Reset on open
  useEffect(() => {
    if (opened) {
      setSelected(new Set());
      setRemoving(false);
      setConfirmStep(false);
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

    setRemoving(true);
    let removed = 0;
    let errors = 0;

    for (const id of ids) {
      try {
        await deleteProject({ id });
        removed++;
      } catch {
        errors++;
      }
    }

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

    setRemoving(false);
    onClose();
  }, [selected, confirmStep, deleteProject, refreshProjects, refreshWorktrees, onClose]);

  return (
    <PhantomModal
      opened={opened}
      onClose={onClose}
      title="Manage Projects"
      closeOnClickOutside={!removing}
      closeOnEscape={!removing}
      size="lg"
    >
      <Stack gap="md">
        {projects.length === 0 ? (
          <Text fz="sm" c="var(--phantom-text-muted)" ta="center" py="lg">
            No projects to manage.
          </Text>
        ) : (
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
              <Button variant="subtle" size="md" onClick={onClose} disabled={removing}>
                Cancel
              </Button>
              <Button
                size="md"
                color="red"
                loading={removing}
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
