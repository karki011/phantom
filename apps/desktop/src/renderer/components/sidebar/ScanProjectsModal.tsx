/**
 * ScanProjectsModal — scan a parent directory for git repos and batch-import them.
 *
 * @author Subash Karki
 */
import {
  Button,
  Checkbox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { FolderSearch, GitBranch } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';

import {
  type ScannedRepo,
  batchOpenRepositories,
  scanDirectory,
} from '../../lib/api';
import { refreshProjectsAtom, refreshWorktreesAtom } from '../../atoms/worktrees';
import { showSystemNotification } from '../notifications/SystemToast';
import { PhantomModal } from '../PhantomModal';

interface ScanProjectsModalProps {
  opened: boolean;
  onClose: () => void;
}

/** Call Electron's native folder picker via IPC */
const pickFolder = async (): Promise<string | null> => {
  try {
    const api = window.phantomOS;
    if (api?.invoke) {
      return (await api.invoke('phantom:pick-folder')) as string | null;
    }
    return window.prompt('Enter directory path:');
  } catch {
    return window.prompt('Enter directory path:');
  }
};

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

export function ScanProjectsModal({ opened, onClose }: ScanProjectsModalProps) {
  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorktrees = useSetAtom(refreshWorktreesAtom);

  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scannedDir, setScannedDir] = useState<string | null>(null);
  const [repos, setRepos] = useState<ScannedRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset on open
  useEffect(() => {
    if (opened) {
      setScanning(false);
      setImporting(false);
      setScannedDir(null);
      setRepos([]);
      setSelected(new Set());
    }
  }, [opened]);

  const handleScan = useCallback(async () => {
    const folder = await pickFolder();
    if (!folder) return;

    setScanning(true);
    setScannedDir(folder);
    setRepos([]);
    setSelected(new Set());

    try {
      const result = await scanDirectory(folder, 2);
      setRepos(result.repos);
      // Pre-select repos not already added
      const newRepos = new Set(
        result.repos.filter((r) => !r.alreadyAdded).map((r) => r.path),
      );
      setSelected(newRepos);
    } catch {
      showSystemNotification('Error', 'Failed to scan directory', 'warning');
    } finally {
      setScanning(false);
    }
  }, []);

  const toggleRepo = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const selectable = repos.filter((r) => !r.alreadyAdded);
    if (selected.size === selectable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((r) => r.path)));
    }
  }, [repos, selected]);

  const handleImport = useCallback(async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;

    setImporting(true);
    try {
      const result = await batchOpenRepositories(paths);
      const added = result.results.filter((r) => r.project && !r.error).length;
      const errors = result.results.filter((r) => r.error).length;

      refreshProjects();
      refreshWorktrees();

      if (errors > 0) {
        showSystemNotification(
          'Import Complete',
          `Added ${added} project${added !== 1 ? 's' : ''}, ${errors} failed`,
          'warning',
        );
      } else {
        showSystemNotification(
          'Projects Added',
          `Added ${added} project${added !== 1 ? 's' : ''} successfully`,
          'success',
        );
      }
      onClose();
    } catch {
      showSystemNotification('Error', 'Failed to import projects', 'warning');
    } finally {
      setImporting(false);
    }
  }, [selected, refreshProjects, refreshWorktrees, onClose]);

  const selectableCount = repos.filter((r) => !r.alreadyAdded).length;

  return (
    <PhantomModal
      opened={opened}
      onClose={onClose}
      title="Scan for Projects"
      closeOnClickOutside={!importing}
      closeOnEscape={!importing}
      size="lg"
    >
      <Stack gap="md">
        {/* Scan prompt */}
        {!scannedDir && !scanning && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              padding: '32px 16px',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: 'var(--phantom-surface-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderSearch size={28} style={{ color: 'var(--phantom-accent-purple)' }} />
            </div>
            <Text fz="sm" c="var(--phantom-text-muted)" ta="center" maw={360}>
              Choose a parent directory (e.g. ~/Projects) and we'll find all git
              repositories inside it.
            </Text>
            <Button
              variant="light"
              size="md"
              leftSection={<FolderSearch size={18} />}
              onClick={handleScan}
              styles={{
                root: {
                  backgroundColor: 'var(--phantom-surface-card)',
                  color: 'var(--phantom-text-primary)',
                  border: '1px solid var(--phantom-border-subtle)',
                },
              }}
            >
              Choose Directory
            </Button>
          </div>
        )}

        {/* Scanning state */}
        {scanning && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: '32px 16px',
            }}
          >
            <Loader size="sm" color="var(--phantom-accent-cyan)" />
            <Text fz="sm" c="var(--phantom-text-muted)">
              Scanning {shortenPath(scannedDir ?? '')}...
            </Text>
          </div>
        )}

        {/* Results */}
        {!scanning && scannedDir && (
          <>
            <Group justify="space-between" align="center">
              <Text fz="xs" c="var(--phantom-text-muted)">
                Found {repos.length} repo{repos.length !== 1 ? 's' : ''} in{' '}
                <strong>{shortenPath(scannedDir)}</strong>
              </Text>
              <Group gap="xs">
                {selectableCount > 0 && (
                  <Button variant="subtle" size="xs" onClick={toggleAll}>
                    {selected.size === selectableCount ? 'Deselect all' : 'Select all'}
                  </Button>
                )}
                <Button variant="subtle" size="xs" onClick={handleScan}>
                  Rescan
                </Button>
              </Group>
            </Group>

            {repos.length === 0 ? (
              <Text fz="sm" c="var(--phantom-text-muted)" ta="center" py="lg">
                No git repositories found. Try a different directory.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={340}>
                <Stack gap={2}>
                  {repos.map((repo) => (
                    <div
                      key={repo.path}
                      onClick={() => !repo.alreadyAdded && toggleRepo(repo.path)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 6,
                        cursor: repo.alreadyAdded ? 'default' : 'pointer',
                        backgroundColor: selected.has(repo.path)
                          ? 'var(--phantom-surface-hover)'
                          : 'transparent',
                        opacity: repo.alreadyAdded ? 0.5 : 1,
                        transition: 'background-color 100ms ease',
                      }}
                    >
                      <Checkbox
                        size="xs"
                        checked={selected.has(repo.path) || repo.alreadyAdded}
                        disabled={repo.alreadyAdded}
                        onChange={() => toggleRepo(repo.path)}
                        onClick={(e) => e.stopPropagation()}
                        styles={{
                          input: {
                            cursor: repo.alreadyAdded ? 'default' : 'pointer',
                          },
                        }}
                      />
                      <GitBranch size={14} style={{ color: 'var(--phantom-accent-cyan)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Text fz="0.82rem" fw={500} c="var(--phantom-text-primary)" truncate>
                          {repo.name}
                        </Text>
                        <Text fz="0.7rem" c="var(--phantom-text-muted)" truncate>
                          {shortenPath(repo.path)}
                          {repo.alreadyAdded && ' — already added'}
                        </Text>
                      </div>
                    </div>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            )}

            <Group justify="flex-end" gap="md" mt="xs">
              <Button variant="subtle" size="md" onClick={onClose} disabled={importing}>
                Cancel
              </Button>
              <Button
                size="md"
                loading={importing}
                disabled={selected.size === 0}
                onClick={handleImport}
              >
                Add {selected.size} Project{selected.size !== 1 ? 's' : ''}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </PhantomModal>
  );
}
