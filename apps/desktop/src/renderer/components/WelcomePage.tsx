/**
 * WelcomePage Component
 * - No projects: shows Open Repository + Getting Started
 * - Has project but no worktrees: shows "Create your first worktree" form
 *
 * @author Subash Karki
 */
import {
  Button,
  Group,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  BookOpen,
  Download,
  FolderOpen,
  Gamepad2,
  GitBranch,
  LayoutPanelLeft,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePaneStore } from '@phantom-os/panes';

import {
  createWorktreeAtom,
  openRepositoryAtom,
  projectsAtom,
  refreshProjectsAtom,
  worktreesAtom,
} from '../atoms/worktrees';
import { type BranchesData, getProjectBranches } from '../lib/api';
import { showSystemNotification } from './notifications/SystemToast';
import { CloneRepoModal } from './sidebar/CloneRepoModal';

/** Call Electron's native folder picker via IPC */
const pickFolder = async (): Promise<string | null> => {
  try {
    const api = window.phantomOS;
    if (api?.invoke) return (await api.invoke('phantom:pick-folder')) as string | null;
    return window.prompt('Enter repository path:');
  } catch {
    return window.prompt('Enter repository path:');
  }
};

const slugify = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------
// Getting Started items
// ---------------------------------------------------------------------------

const GETTING_STARTED = [
  { icon: BookOpen, title: 'Open a repository', description: 'Browse and open any local git repo to start working' },
  { icon: GitBranch, title: 'Create a worktree', description: 'Each worktree is an isolated environment with its own branch' },
  { icon: LayoutPanelLeft, title: 'Split panes & terminals', description: 'Arrange editors, terminals, and dashboards side by side' },
  { icon: Gamepad2, title: 'Track XP & achievements', description: 'Earn XP, climb hunter ranks, and unlock achievements' },
];

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

// ---------------------------------------------------------------------------
// Create First Workspace Form
// ---------------------------------------------------------------------------

function CreateFirstWorktree({ projectId, projectName, defaultBranch }: { projectId: string; projectName: string; defaultBranch: string }) {
  const createWorktree = useSetAtom(createWorktreeAtom);
  const store = usePaneStore();
  const [name, setName] = useState('');
  const [baseBranch, setBaseBranch] = useState(defaultBranch);
  const [newBranch, setNewBranch] = useState('');
  const [branchEdited, setBranchEdited] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<BranchesData | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getProjectBranches(projectId)
      .then((data) => {
        if (!cancelled) {
          setBranches(data);
          if (data.defaultBranch) setBaseBranch(data.defaultBranch);
          else if (data.current) setBaseBranch(data.current);
        }
      })
      .catch(() => {
        if (!cancelled) setBranches({ local: [], remote: [], current: defaultBranch });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, defaultBranch]);

  useEffect(() => {
    if (!loading) setTimeout(() => nameRef.current?.focus(), 100);
  }, [loading]);

  useEffect(() => {
    if (!branchEdited && name.trim()) setNewBranch(slugify(name));
  }, [name, branchEdited]);

  const branchOptions = useMemo(() => {
    if (!branches) return [];
    const defaultBr = branches.defaultBranch ?? 'main';
    const all = [...(branches.local ?? []), ...(branches.remote ?? []).filter((r) => !(branches.local ?? []).includes(r))];
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
      const ws = await createWorktree({ projectId, name: wsName, branch, baseBranch });
      showSystemNotification('Worktree Created', `Created worktree "${wsName}"`, 'success');
      // Auto-open Claude session in the new worktree
      if (ws?.worktreePath) {
        setTimeout(() => {
          store.addPaneAsTab('terminal', { cwd: ws.worktreePath, initialCommand: 'claude --dangerously-skip-permissions' } as Record<string, unknown>, 'Claude');
        }, 500);
      }
    } catch {
      showSystemNotification('Error', 'Failed to create worktree', 'warning');
    } finally {
      setSubmitting(false);
    }
  }, [name, newBranch, baseBranch, projectId, createWorktree, submitting]);

  if (loading) {
    return (
      <Stack gap="md" maw={560}>
        <Skeleton height={40} radius="sm" />
        <Skeleton height={40} radius="sm" />
        <Skeleton height={36} radius="sm" width={120} />
      </Stack>
    );
  }

  return (
    <div style={{ maxWidth: 560, width: '100%' }}>
      <Text fz="xs" fw={600} c="var(--phantom-accent-glow)" tt="uppercase" mb={8} style={{ letterSpacing: '0.08em' }}>
        {projectName}
      </Text>
      <Text fz="1.5rem" fw={800} c="var(--phantom-text-primary)" mb={4}>
        Create a worktree
      </Text>
      <Text fz="sm" c="var(--phantom-text-muted)" mb={28}>
        Worktrees are isolated task environments backed by git worktrees.
      </Text>

      <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && baseBranch) handleSubmit(); }}>
        <Stack gap="lg">
          <TextInput
            ref={nameRef}
            label="Task"
            placeholder="e.g. Add dark mode, Fix checkout bug"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            size="md"
            disabled={submitting}
          />

          <TextInput
            label="Branch"
            description="Auto-generated from task name, editable"
            placeholder="auto-generated from task name"
            value={newBranch}
            onChange={(e) => { setNewBranch(e.currentTarget.value); setBranchEdited(true); }}
            size="md"
            disabled={submitting}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />

          <Select
            label="From branch"
            description="The existing branch to create the worktree from"
            data={branchOptions}
            value={baseBranch}
            onChange={(val) => setBaseBranch(val ?? defaultBranch)}
            searchable
            size="md"
            disabled={submitting}
          />

          <Group justify="flex-end">
            <Button
              type="submit"
              size="md"
              loading={submitting}
              disabled={!name.trim() || !baseBranch}
              rightSection={<span style={{ fontSize: 11, opacity: 0.6 }}>⌘↵</span>}
            >
              Continue
            </Button>
          </Group>
        </Stack>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main WelcomePage
// ---------------------------------------------------------------------------

export function WelcomePage() {
  const projects = useAtomValue(projectsAtom);
  const worktrees = useAtomValue(worktreesAtom);
  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const openRepo = useSetAtom(openRepositoryAtom);

  const [cloneOpen, setCloneOpen] = useState(false);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  const handleOpenProject = useCallback(async () => {
    const folder = await pickFolder();
    if (!folder) return;
    try {
      await openRepo(folder);
      showSystemNotification('Repository Opened', `Opened ${folder.split('/').pop() ?? folder}`, 'success');
    } catch {
      showSystemNotification('Error', 'Failed to open repository.', 'warning');
    }
  }, [openRepo]);

  // If we have a project but no worktrees → show "Create first worktree"
  const firstProject = projects[0];
  const hasWorktrees = worktrees.length > 0;

  if (firstProject && !hasWorktrees) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', backgroundColor: 'var(--phantom-surface-bg)' }}>
        <div style={{ padding: '48px 32px' }}>
          <CreateFirstWorktree projectId={firstProject.id} projectName={firstProject.name} defaultBranch={firstProject.defaultBranch ?? 'main'} />
        </div>
      </div>
    );
  }

  // No projects → show full welcome page
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', backgroundColor: 'var(--phantom-surface-bg)' }}>
      <div style={{ maxWidth: 720, width: '100%', padding: '48px 32px' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Text ff="Orbitron, sans-serif" fz="2rem" fw={900} c="var(--phantom-text-primary)" tt="uppercase" style={{ letterSpacing: '0.12em', textShadow: '0 0 0.75rem var(--phantom-accent-glow)' }}>
            PhantomOS
          </Text>
          <Text fz="0.95rem" c="var(--phantom-text-muted)" mt={4} style={{ letterSpacing: '0.04em' }}>
            The System Awakens
          </Text>
        </div>

        {/* Action buttons */}
        <Group justify="center" gap="md" mb={40}>
          <Button variant="light" size="md" leftSection={<FolderOpen size={18} />} onClick={handleOpenProject}
            styles={{ root: { backgroundColor: 'var(--phantom-surface-card)', color: 'var(--phantom-text-primary)', border: '1px solid var(--phantom-border-subtle)' } }}>
            Open Project
          </Button>
          <Button variant="light" size="md" leftSection={<Download size={18} />} onClick={() => setCloneOpen(true)}
            styles={{ root: { backgroundColor: 'var(--phantom-surface-card)', color: 'var(--phantom-text-primary)', border: '1px solid var(--phantom-border-subtle)' } }}>
            Clone Repository
          </Button>
        </Group>

        <CloneRepoModal opened={cloneOpen} onClose={() => setCloneOpen(false)} />

        {/* Two-column layout */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
          <div>
            <Text fz="0.85rem" fw={700} c="var(--phantom-text-primary)" mb={8}>Recent Projects</Text>
            <div style={{ borderTop: '1px solid var(--phantom-border-subtle)', paddingTop: 8 }}>
              {projects.length === 0 ? (
                <Text fz="0.78rem" c="var(--phantom-text-muted)" py="sm">
                  No projects yet. Open a repository to get started.
                </Text>
              ) : (
                <Stack gap={2}>
                  {projects.slice(0, 8).map((project) => (
                    <UnstyledButton key={project.id} onClick={() => openRepo(project.repoPath)} py={6} px={8} style={{ borderRadius: 6 }}>
                      <Text fz="0.82rem" fw={500} c="var(--phantom-accent-cyan)">{project.name}</Text>
                      <Text fz="0.7rem" c="var(--phantom-text-muted)">{shortenPath(project.repoPath)}</Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              )}
            </div>
          </div>
          <div>
            <Text fz="0.85rem" fw={700} c="var(--phantom-text-primary)" mb={8}>Getting Started</Text>
            <div style={{ borderTop: '1px solid var(--phantom-border-subtle)', paddingTop: 8 }}>
              <Stack gap={12}>
                {GETTING_STARTED.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Group key={item.title} gap={10} align="flex-start" wrap="nowrap">
                      <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: 'var(--phantom-surface-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <Icon size={14} style={{ color: 'var(--phantom-accent-purple)' }} />
                      </div>
                      <div>
                        <Text fz="0.8rem" fw={500} c="var(--phantom-text-primary)">{item.title}</Text>
                        <Text fz="0.72rem" c="var(--phantom-text-muted)">{item.description}</Text>
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
