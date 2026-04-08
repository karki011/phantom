/**
 * WelcomePage Component
 * Centered start page shown when Workspace tab is active but no workspace is selected.
 * Inspired by Cursor/VS Code welcome pages.
 *
 * @author Subash Karki
 */
import {
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  BookOpen,
  FolderOpen,
  Gamepad2,
  GitBranch,
  LayoutPanelLeft,
} from 'lucide-react';
import { useCallback, useEffect } from 'react';

import {
  openRepositoryAtom,
  projectsAtom,
  refreshProjectsAtom,
} from '../atoms/workspaces';
import { showSystemNotification } from './notifications/SystemToast';

/** Call Electron's native folder picker via IPC */
const pickFolder = async (): Promise<string | null> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).phantomOS;
    if (api?.invoke) {
      const result = await api.invoke('phantom:pick-folder');
      return result as string | null;
    }
    return window.prompt('Enter repository path:');
  } catch {
    return window.prompt('Enter repository path:');
  }
};

interface GettingStartedItem {
  icon: typeof BookOpen;
  title: string;
  description: string;
}

const GETTING_STARTED: GettingStartedItem[] = [
  {
    icon: BookOpen,
    title: 'Open a repository',
    description: 'Browse and open any local git repo to start working',
  },
  {
    icon: GitBranch,
    title: 'Create a workspace',
    description: 'Each workspace is an isolated worktree with its own branch',
  },
  {
    icon: LayoutPanelLeft,
    title: 'Split panes & terminals',
    description: 'Arrange editors, terminals, and dashboards side by side',
  },
  {
    icon: Gamepad2,
    title: 'Track XP & achievements',
    description: 'Earn XP, climb hunter ranks, and unlock achievements',
  },
];

/** Shorten a path for display: ~/foo/bar */
const shortenPath = (fullPath: string): string => {
  const home = '/Users/';
  const idx = fullPath.indexOf(home);
  if (idx >= 0) {
    const rest = fullPath.slice(idx + home.length);
    const parts = rest.split('/');
    if (parts.length > 1) {
      return `~/${parts.slice(1).join('/')}`;
    }
    return `~/${rest}`;
  }
  return fullPath;
};

export function WelcomePage() {
  const projects = useAtomValue(projectsAtom);
  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const openRepo = useSetAtom(openRepositoryAtom);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const handleOpenProject = useCallback(async () => {
    const folder = await pickFolder();
    if (!folder) return;
    try {
      await openRepo(folder);
      showSystemNotification(
        'Repository Opened',
        `Opened ${folder.split('/').pop() ?? folder}`,
        'success',
      );
    } catch {
      showSystemNotification('Error', 'Failed to open repository.', 'warning');
    }
  }, [openRepo]);

  const handleCloneRepo = useCallback(() => {
    showSystemNotification('Clone Repo', 'Coming soon', 'info');
  }, []);

  const handleRecentClick = useCallback(
    async (repoPath: string) => {
      try {
        await openRepo(repoPath);
        showSystemNotification(
          'Repository Opened',
          `Opened ${repoPath.split('/').pop() ?? repoPath}`,
          'success',
        );
      } catch {
        showSystemNotification('Error', 'Failed to open repository.', 'warning');
      }
    },
    [openRepo],
  );

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        backgroundColor: 'var(--phantom-surface-bg)',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: '100%',
          padding: '48px 32px',
        }}
      >
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Text
            ff="Orbitron, sans-serif"
            fz="2rem"
            fw={900}
            c="var(--phantom-text-primary)"
            tt="uppercase"
            style={{
              letterSpacing: '0.12em',
              textShadow: '0 0 0.75rem var(--phantom-accent-glow)',
            }}
          >
            PhantomOS
          </Text>
          <Text
            fz="0.95rem"
            c="var(--phantom-text-muted)"
            mt={4}
            style={{ letterSpacing: '0.04em' }}
          >
            The System Awakens
          </Text>
        </div>

        {/* Action buttons */}
        <Group justify="center" gap="md" mb={40}>
          <Button
            variant="light"
            size="md"
            leftSection={<FolderOpen size={18} />}
            onClick={handleOpenProject}
            styles={{
              root: {
                backgroundColor: 'var(--phantom-surface-card)',
                color: 'var(--phantom-text-primary)',
                border: '1px solid var(--phantom-border-subtle)',
                '&:hover': {
                  backgroundColor: 'var(--phantom-surface-hover)',
                },
              },
            }}
          >
            Open Project
          </Button>
          <Button
            variant="light"
            size="md"
            leftSection={<GitBranch size={18} />}
            onClick={handleCloneRepo}
            styles={{
              root: {
                backgroundColor: 'var(--phantom-surface-card)',
                color: 'var(--phantom-text-primary)',
                border: '1px solid var(--phantom-border-subtle)',
                '&:hover': {
                  backgroundColor: 'var(--phantom-surface-hover)',
                },
              },
            }}
          >
            Clone Repo
          </Button>
        </Group>

        {/* Two-column: Recent Projects + Getting Started */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
          {/* Recent Projects */}
          <div>
            <Text
              fz="0.85rem"
              fw={700}
              c="var(--phantom-text-primary)"
              mb={8}
            >
              Recent Projects
            </Text>
            <div
              style={{
                borderTop: '1px solid var(--phantom-border-subtle)',
                paddingTop: 8,
              }}
            >
              {projects.length === 0 ? (
                <Text fz="0.78rem" c="var(--phantom-text-muted)" py="sm">
                  No projects yet. Open a repository to get started.
                </Text>
              ) : (
                <Stack gap={2}>
                  {projects.slice(0, 8).map((project) => (
                    <UnstyledButton
                      key={project.id}
                      onClick={() => handleRecentClick(project.repoPath)}
                      py={6}
                      px={8}
                      style={{
                        borderRadius: 6,
                        transition: 'background-color 120ms ease',
                        '&:hover': {
                          backgroundColor: 'var(--phantom-surface-hover)',
                        },
                      }}
                    >
                      <Text
                        fz="0.82rem"
                        fw={500}
                        c="var(--phantom-accent-cyan)"
                        style={{ cursor: 'pointer' }}
                      >
                        {project.name}
                      </Text>
                      <Text fz="0.7rem" c="var(--phantom-text-muted)">
                        {shortenPath(project.repoPath)}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              )}
            </div>
          </div>

          {/* Getting Started */}
          <div>
            <Text
              fz="0.85rem"
              fw={700}
              c="var(--phantom-text-primary)"
              mb={8}
            >
              Getting Started
            </Text>
            <div
              style={{
                borderTop: '1px solid var(--phantom-border-subtle)',
                paddingTop: 8,
              }}
            >
              <Stack gap={12}>
                {GETTING_STARTED.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Group key={item.title} gap={10} align="flex-start" wrap="nowrap">
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          backgroundColor: 'var(--phantom-surface-card)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        <Icon
                          size={14}
                          style={{ color: 'var(--phantom-accent-purple)' }}
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <Text fz="0.8rem" fw={500} c="var(--phantom-text-primary)">
                          {item.title}
                        </Text>
                        <Text fz="0.72rem" c="var(--phantom-text-muted)">
                          {item.description}
                        </Text>
                      </div>
                    </Group>
                  );
                })}
              </Stack>
            </div>
          </div>
        </SimpleGrid>
      </div>
    </div>
  );
}
