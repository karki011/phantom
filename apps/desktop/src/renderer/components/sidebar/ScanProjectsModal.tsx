/**
 * ScanProjectsModal — scan a parent directory for git repos and batch-import them.
 * Shows onboarding-style progress during import.
 *
 * @author Subash Karki
 */
import {
  Button,
  Checkbox,
  Group,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { FolderSearch, GitBranch } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';

import {
  type ScannedRepo,
  bulkAddProjects,
  scanDirectory,
} from '../../lib/api';
import { pickFolder } from '../../lib/electron';
import { shortenPath } from '../../lib/paths';
import { pendingProjectsAtom, refreshProjectsAtom, refreshWorktreesAtom } from '../../atoms/worktrees';
import { showSystemNotification, updateSystemNotification } from '../notifications/SystemToast';
import { PhantomModal } from '../PhantomModal';

interface ScanProjectsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function ScanProjectsModal({ opened, onClose }: ScanProjectsModalProps) {
  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorktrees = useSetAtom(refreshWorktreesAtom);

  const [scanning, setScanning] = useState(false);
  const [scannedDir, setScannedDir] = useState<string | null>(null);
  const [repos, setRepos] = useState<ScannedRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);

  const [scanLines, setScanLines] = useState<string[]>([]);
  const scanLogRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (opened) {
      setScanning(false);
      setScannedDir(null);
      setRepos([]);
      setSelected(new Set());
      setImporting(false);
      setScanLines([]);
    }
  }, [opened]);

  useEffect(() => {
    scanLogRef.current?.scrollTo({ top: scanLogRef.current.scrollHeight, behavior: 'smooth' });
  }, [scanLines.length]);

  const handleScan = useCallback(async () => {
    const folder = await pickFolder();
    if (!folder) return;

    setScanning(true);
    setScannedDir(folder);
    setRepos([]);
    setSelected(new Set());

    const lines: string[] = [
      `$ cd ${shortenPath(folder)}`,
      '$ scanning for git repositories...',
    ];
    setScanLines([...lines]);

    try {
      const result = await scanDirectory(folder, 2);
      for (const repo of result.repos) {
        lines.push(`  found: ${repo.name}${repo.alreadyAdded ? ' (already added)' : ''}`);
      }
      if (result.repos.length === 0) {
        lines.push('  no git repositories found.');
      } else {
        lines.push(`  ── ${result.repos.length} repositories discovered ──`);
      }
      setScanLines([...lines]);

      setRepos(result.repos);
      const newRepos = new Set(
        result.repos.filter((r) => !r.alreadyAdded).map((r) => r.path),
      );
      setSelected(newRepos);
    } catch {
      lines.push('  ✗ scan failed');
      setScanLines([...lines]);
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

  const setPendingProjects = useSetAtom(pendingProjectsAtom);

  const handleImport = useCallback(async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;

    const pending = paths.map((p) => ({
      name: p.split('/').pop() ?? p,
      repoPath: p,
    }));
    setPendingProjects(pending);
    onClose();

    const toastId = showSystemNotification(
      'Adding Projects',
      `Processing ${paths.length} project${paths.length !== 1 ? 's' : ''}...`,
      'info',
      { persistent: true },
    );

    const poll = setInterval(() => {
      refreshProjects();
      refreshWorktrees(true);
    }, 3000);

    try {
      const result = await bulkAddProjects(paths);
      const added = result.projects.length;
      const errors = paths.length - added;

      refreshProjects();
      refreshWorktrees();
      setPendingProjects([]);

      if (errors > 0) {
        updateSystemNotification(toastId, 'Import Complete', `Added ${added}, ${errors} skipped`, 'warning');
      } else {
        updateSystemNotification(toastId, 'Projects Added', `${added} project${added !== 1 ? 's' : ''} ready`, 'success');
      }
    } catch {
      setPendingProjects([]);
      updateSystemNotification(toastId, 'Import Failed', 'Bulk import failed', 'warning');
    } finally {
      clearInterval(poll);
    }
  }, [selected, refreshProjects, refreshWorktrees, setPendingProjects, onClose]);

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

        {/* ── Scan Prompt ── */}
        {!importing && !scannedDir && !scanning && (
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

        {/* ── Scanning State (onboarding terminal style) ── */}
        {!importing && scanning && (
          <div style={{
            padding: '16px 0',
            fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
          }}>
            <Text
              fz="0.8rem"
              fw={700}
              mb={8}
              style={{ color: '#00d4ff', textShadow: '0 0 8px rgba(0,212,255,0.4)' }}
            >
              SCANNING FILESYSTEM
            </Text>

            <Progress
              value={100}
              size="sm"
              radius="xs"
              color="#00d4ff"
              animated
              styles={{
                root: { backgroundColor: 'rgba(0,212,255,0.1)' },
                section: { boxShadow: '0 0 12px rgba(0,212,255,0.4)' },
              }}
            />

            <div
              ref={scanLogRef}
              style={{
                marginTop: 12,
                maxHeight: 220,
                overflow: 'auto',
                backgroundColor: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(0,212,255,0.15)',
                borderRadius: 8,
                padding: '10px 12px',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--phantom-border-subtle) transparent',
              }}
            >
              <Stack gap={2}>
                {scanLines.map((line, i) => (
                  <Text
                    key={i}
                    fz="0.72rem"
                    c={line.startsWith('  found:') ? '#22c55e' : line.includes('✗') ? '#ef4444' : 'var(--phantom-text-muted)'}
                    style={{
                      textShadow: line.startsWith('  found:')
                        ? '0 0 6px rgba(34,197,94,0.3)'
                        : line.startsWith('$')
                          ? '0 0 6px rgba(0,212,255,0.3)'
                          : 'none',
                      color: line.startsWith('$') ? '#00d4ff' : undefined,
                    }}
                  >
                    {line}
                  </Text>
                ))}
                <Text fz="0.72rem" c="var(--phantom-text-muted)" style={{ animation: 'blink 1s step-end infinite' }}>
                  ▌
                </Text>
              </Stack>
            </div>

            <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
          </div>
        )}

        {/* ── Results (onboarding terminal style) ── */}
        {!importing && !scanning && scannedDir && (
          <div style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>
            <Group justify="space-between" align="center" mb={8}>
              <Text fz="0.75rem" style={{ color: '#00d4ff', textShadow: '0 0 6px rgba(0,212,255,0.3)' }}>
                {repos.length} REPOSITORIES DISCOVERED
              </Text>
              <Group gap="xs">
                {selectableCount > 0 && (
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={toggleAll}
                    styles={{ root: { color: '#f59e0b', fontFamily: 'inherit', fontSize: '0.7rem' } }}
                  >
                    [{selected.size === selectableCount ? 'Deselect All' : 'Select All'}]
                  </Button>
                )}
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={handleScan}
                  styles={{ root: { color: 'var(--phantom-text-muted)', fontFamily: 'inherit', fontSize: '0.7rem' } }}
                >
                  [Rescan]
                </Button>
              </Group>
            </Group>

            <Text fz="0.65rem" c="var(--phantom-text-muted)" mb={10}>
              {shortenPath(scannedDir)} · {selected.size} selected
            </Text>

            {repos.length === 0 ? (
              <Text fz="0.8rem" c="var(--phantom-text-muted)" ta="center" py="lg">
                No git repositories found. Try a different directory.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={340} scrollbarSize={4}>
                <Stack gap={3}>
                  {repos.map((repo) => {
                    const isSelected = selected.has(repo.path);
                    return (
                      <div
                        key={repo.path}
                        onClick={() => !repo.alreadyAdded && toggleRepo(repo.path)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          borderRadius: 6,
                          cursor: repo.alreadyAdded ? 'default' : 'pointer',
                          backgroundColor: isSelected
                            ? 'rgba(0,212,255,0.08)'
                            : 'rgba(0,0,0,0.2)',
                          border: `1px solid ${isSelected ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)'}`,
                          opacity: repo.alreadyAdded ? 0.35 : 1,
                          transition: 'all 120ms ease',
                        }}
                      >
                        <Checkbox
                          size="xs"
                          checked={isSelected || repo.alreadyAdded}
                          disabled={repo.alreadyAdded}
                          onChange={() => toggleRepo(repo.path)}
                          onClick={(e) => e.stopPropagation()}
                          styles={{
                            input: {
                              cursor: repo.alreadyAdded ? 'default' : 'pointer',
                              backgroundColor: isSelected ? 'rgba(0,212,255,0.2)' : 'rgba(0,0,0,0.3)',
                              borderColor: isSelected ? '#00d4ff' : 'rgba(255,255,255,0.1)',
                            },
                          }}
                        />
                        <GitBranch
                          size={14}
                          style={{
                            color: isSelected ? '#00d4ff' : 'var(--phantom-text-muted)',
                            flexShrink: 0,
                            filter: isSelected ? 'drop-shadow(0 0 3px rgba(0,212,255,0.4))' : 'none',
                          }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Text
                            fz="0.8rem"
                            fw={600}
                            truncate
                            style={{
                              color: isSelected ? '#00d4ff' : 'var(--phantom-text-secondary)',
                              textShadow: isSelected ? '0 0 6px rgba(0,212,255,0.2)' : 'none',
                            }}
                          >
                            {repo.name}
                          </Text>
                          <Text fz="0.65rem" c="var(--phantom-text-muted)" truncate>
                            {shortenPath(repo.path)}
                            {repo.alreadyAdded && ' — already added'}
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                </Stack>
              </ScrollArea.Autosize>
            )}

            <Group justify="flex-end" gap="md" mt="md">
              <Button
                variant="subtle"
                size="md"
                onClick={onClose}
                styles={{ root: { fontFamily: 'inherit' } }}
              >
                Cancel
              </Button>
              <Button
                size="md"
                disabled={selected.size === 0}
                onClick={handleImport}
                styles={{
                  root: {
                    fontFamily: 'inherit',
                    backgroundColor: '#00d4ff',
                    color: '#0a0a14',
                    boxShadow: selected.size > 0 ? '0 0 16px rgba(0,212,255,0.3)' : 'none',
                  },
                }}
              >
                [ Add {selected.size} Project{selected.size !== 1 ? 's' : ''} ]
              </Button>
            </Group>
          </div>
        )}
      </Stack>
    </PhantomModal>
  );
}
