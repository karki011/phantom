/**
 * WorktreeHome — "Hunter's Terminal"
 * Default pane content for worktree tabs. Shows rank, quick actions,
 * git status, daily quests, and a Solo Leveling quote.
 *
 * @author Subash Karki
 */
import {
  ActionIcon,
  Button,
  Center,
  Group,
  Kbd,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tabs,
} from '@mantine/core';
import { usePaneStore } from '@phantom-os/panes';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  AlertTriangle, FileCode, GitBranch,
  MessageSquare, Pencil, Play, Plus, Sparkles,
  Star, Terminal as TerminalIcon, Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { activeWorktreeAtom, deleteWorktreeAtom, projectsAtom } from '../atoms/worktrees';
import type { CustomRecipe } from '../atoms/recipes';
import { useProjectProfile } from '../hooks/useProjectProfile';
import { useRecipes, type EnrichedRecipe } from '../hooks/useRecipes';
import { useRouter } from '../hooks/useRouter';
import { PlansCard } from './PlansCard';
import { RecipeFormModal } from './RecipeFormModal';
import { RunningServersCard } from './RunningServersCard';
import { TasksCard } from './TasksCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const formatRelativeTime = (ts: number): string => {
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
};

const QUOTES = [
  'I alone level up.',
  'Arise.',
  'Every day I get stronger.',
  'I am the Shadow Monarch.',
  'The System has awakened.',
  'This is just the beginning.',
  'I will not run away anymore.',
  'The weak have no right to choose how they die.',
];

interface GitStatus {
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QuickActionCard({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <Paper
      p="sm"
      bg="var(--phantom-surface-card)"
      radius="md"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: '1px solid var(--phantom-border-subtle)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        minHeight: '4.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--phantom-accent-glow)';
        e.currentTarget.style.boxShadow = '0 0 12px color-mix(in srgb, var(--phantom-accent-glow) 30%, transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--phantom-border-subtle)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <Stack align="center" gap={4}>
        {icon}
        <Text fw={600} fz="sm" c="var(--phantom-text-primary)">{label}</Text>
        <Kbd fz="0.65rem">{shortcut}</Kbd>
      </Stack>
    </Paper>
  );
}

type GitStatusState = 'loading' | 'unavailable' | 'error' | GitStatus;

function GitStatusCard({ state }: { state: GitStatusState }) {
  if (state === 'loading' || state === 'unavailable' || state === 'error') {
    const message =
      state === 'loading'
        ? 'Loading...'
        : state === 'unavailable'
          ? 'No git repository'
          : 'Git status unavailable';
    return (
      <Paper p="md" bg="var(--phantom-surface-card)" radius="md" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
        <Group gap="xs" mb="xs">
          <GitBranch size={14} style={{ color: 'var(--phantom-text-muted)' }} />
          <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Git Status</Text>
        </Group>
        <Text fz="xs" c="var(--phantom-text-muted)">{message}</Text>
      </Paper>
    );
  }
  const status = state;

  const isDirty = status.staged > 0 || status.modified > 0 || status.untracked > 0;
  const dotColor = isDirty ? 'var(--phantom-status-warning)' : 'var(--phantom-status-active)';

  return (
    <Paper p="md" bg="var(--phantom-surface-card)" radius="md" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
      <Group gap="xs" mb="xs">
        <GitBranch size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
        <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Git Status</Text>
      </Group>
      <Group gap="xs">
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor }} />
        <Text fz="sm" fw={600} c="var(--phantom-text-primary)">{status.branch}</Text>
        {status.ahead > 0 && (
          <Text fz="xs" c="var(--phantom-accent-glow)">+{status.ahead} ahead</Text>
        )}
        {status.behind > 0 && (
          <Text fz="xs" c="var(--phantom-status-warning)">{status.behind} behind</Text>
        )}
      </Group>
      <Text fz="xs" c="var(--phantom-text-muted)" mt={4}>
        {status.staged} staged &middot; {status.modified} modified &middot; {status.untracked} untracked
      </Text>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorktreeHome() {
  const { navigate } = useRouter();
  const store = usePaneStore();
  const worktree = useAtomValue(activeWorktreeAtom);
  const projects = useAtomValue(projectsAtom);
  const deleteWorktree = useSetAtom(deleteWorktreeAtom);

  const project = worktree
    ? projects.find((p) => p.id === worktree.projectId) ?? null
    : null;
  const { profile: projectProfile } = useProjectProfile(project?.id ?? null);

  // Recipe favorites + custom recipes
  const { allRecipes, favoriteRecipes, toggleFavorite, addCustomRecipe, editCustomRecipe, deleteCustomRecipe } = useRecipes(project?.id ?? null, projectProfile);
  const [activeRecipeTab, setActiveRecipeTab] = useState<string | null>('all');
  const hasSetInitialTab = useRef(false);
  useEffect(() => {
    if (!hasSetInitialTab.current && favoriteRecipes.length > 0) {
      setActiveRecipeTab('favorites');
      hasSetInitialTab.current = true;
    }
  }, [favoriteRecipes.length]);
  const [recipeModal, setRecipeModal] = useState<{
    opened: boolean;
    mode: 'create' | 'edit';
    recipeId?: string;
    initialValues?: { label: string; command: string; category: CustomRecipe['category'] };
  }>({ opened: false, mode: 'create' });

  const handleCreateRecipe = useCallback((label: string, command: string, category: CustomRecipe['category']) => {
    addCustomRecipe(label, command, category);
  }, [addCustomRecipe]);

  const handleEditRecipe = useCallback((label: string, command: string, category: CustomRecipe['category']) => {
    if (recipeModal.recipeId) {
      editCustomRecipe(recipeModal.recipeId, { label, command, category });
    }
  }, [editCustomRecipe, recipeModal.recipeId]);

  const openEditModal = useCallback((recipe: EnrichedRecipe) => {
    setRecipeModal({
      opened: true,
      mode: 'edit',
      recipeId: recipe.id,
      initialValues: { label: recipe.label, command: recipe.command, category: recipe.category },
    });
  }, []);

  // Prefer worktreePath (the checked-out path for this worktree), fall back to
  // the project's bare repoPath. Either is a valid git directory for IPC.
  const gitPath = worktree?.worktreePath ?? project?.repoPath ?? null;

  const [gitStatusState, setGitStatusState] = useState<GitStatusState>('loading');
  const [recentChats, setRecentChats] = useState<{ id: string; title: string; updatedAt: number }[]>([]);
  const [setupStatus, setSetupStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');

  // Fetch recent chats for this worktree
  useEffect(() => {
    if (!worktree?.id) return;
    fetch(`/api/chat/conversations?worktreeId=${worktree.id}&limit=5`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((convs) => { if (Array.isArray(convs)) setRecentChats(convs); })
      .catch(() => {});
  }, [worktree?.id]);

  // Listen for auto-setup SSE events
  useEffect(() => {
    if (!worktree?.id) return;
    const eventSource = new EventSource('/events');
    eventSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'worktree:setup-start' && msg.data?.worktreeId === worktree.id) {
          setSetupStatus('running');
        }
        if (msg.type === 'worktree:setup-done' && msg.data?.worktreeId === worktree.id) {
          setSetupStatus(msg.data.success ? 'done' : 'failed');
          // Auto-clear after 5 seconds
          setTimeout(() => setSetupStatus('idle'), 5000);
        }
      } catch { /* ignore parse errors */ }
    };
    return () => eventSource.close();
  }, [worktree?.id]);

  // Fetch git status via IPC
  useEffect(() => {
    if (!gitPath) {
      setGitStatusState('unavailable');
      return;
    }
    const isDesktop = window.phantomOS?.isDesktop;
    if (!isDesktop) {
      setGitStatusState('unavailable');
      return;
    }

    const fetchStatus = () => {
      // Only show loading on initial fetch — prevents flash on subsequent polls
      setGitStatusState((prev) => (prev && prev !== 'unavailable' && prev !== 'error') ? prev : 'loading');
      window.phantomOS.invoke('phantom:git-status', gitPath)
        .then((result) => {
          setGitStatusState(result ? (result as GitStatus) : 'unavailable');
        })
        .catch(() => setGitStatusState('error'));
    };

    fetchStatus();

    // Poll every 60s — quiet background fetch + status refresh
    const poll = setInterval(() => {
      fetch(`/api/worktrees/${worktree?.id}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch' }),
      }).catch(() => {});
      // Refresh status after a short delay for fetch to complete
      setTimeout(fetchStatus, 3000);
    }, 60_000);

    // Re-fetch when git actions happen (branch switch, pull, fetch, push)
    const handler = () => fetchStatus();
    window.addEventListener('phantom:git-refresh', handler);
    return () => {
      clearInterval(poll);
      window.removeEventListener('phantom:git-refresh', handler);
    };
  }, [gitPath, worktree?.id]);

  // Random quote (stable per mount)
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  const openTerminal = useCallback(() => store.addPaneAsTab('terminal', { cwd: worktree?.worktreePath } as Record<string, unknown>, 'Terminal'), [store, worktree]);
  const openEditor = useCallback(() => store.addPaneAsTab('editor', {} as Record<string, unknown>, 'Editor'), [store]);
  const openClaude = useCallback(() => store.addPaneAsTab('terminal', { cwd: worktree?.worktreePath, initialCommand: 'claude --dangerously-skip-permissions' } as Record<string, unknown>, 'Claude'), [store, worktree]);
  const openChat = useCallback(() => store.addPaneAsTab('chat', { cwd: worktree?.worktreePath } as Record<string, unknown>, 'Chat'), [store, worktree]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'j':
            e.preventDefault();
            openClaude();
            break;
          case 'h':
            e.preventDefault();
            navigate('hunter-stats');
            break;
          case 'n':
            e.preventDefault();
            openEditor();
            break;
          case 'k':
            e.preventDefault();
            openChat();
            break;
          case '`':
            e.preventDefault();
            openTerminal();
            break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openClaude, openTerminal, openEditor, openChat, navigate]);

  // Guard: worktree was deleted externally
  if (worktree && worktree.worktreeValid === false) {
    return (
      <Center h="100%">
        <Stack align="center" gap="md" maw={420} px="md">
          <AlertTriangle size={40} style={{ color: 'var(--phantom-status-warning)' }} />
          <Title order={3} c="var(--phantom-text-primary)" ta="center">
            Worktree Not Found
          </Title>
          <Text fz="sm" c="var(--phantom-text-secondary)" ta="center">
            The git worktree for this worktree was deleted externally.
          </Text>
          <Text fz="xs" c="var(--phantom-text-muted)" ta="center" ff="monospace">
            Path: {worktree.worktreePath}
          </Text>
          <Button
            variant="light"
            color="red"
            size="sm"
            leftSection={<Trash2 size={14} />}
            mt="sm"
            onClick={() => deleteWorktree(worktree.id)}
          >
            Delete Worktree
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px' }}>
      <Stack align="center" gap="lg" maw={1400} w="100%" mx="auto">
        {/* Two-column layout: Recipes | Tools + Info */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 3fr) minmax(240px, 2fr)',
            gap: 'var(--mantine-spacing-lg)',
            width: '100%',
            alignItems: 'start',
          }}
          className="phantom-home-grid"
        >
          {/* LEFT COLUMN — Project Recipes */}
          <Stack gap="md">
            {setupStatus === 'running' && (
              <Paper p="sm" bg="color-mix(in srgb, var(--phantom-accent-glow) 10%, var(--phantom-surface-card))" radius="md" style={{ border: '1px solid var(--phantom-accent-glow)' }}>
                <Group gap="xs">
                  <Loader size={14} color="var(--phantom-accent-glow)" />
                  <Text fz="xs" c="var(--phantom-accent-glow)">Installing dependencies...</Text>
                </Group>
              </Paper>
            )}
            {setupStatus === 'failed' && (
              <Paper p="sm" bg="color-mix(in srgb, var(--phantom-status-warning) 10%, var(--phantom-surface-card))" radius="md" style={{ border: '1px solid var(--phantom-status-warning)' }}>
                <Text fz="xs" c="var(--phantom-status-warning)">Setup failed — check terminal for details</Text>
              </Paper>
            )}
            {allRecipes.length > 0 && (
              <Paper
                p="md"
                bg="var(--phantom-surface-card)"
                radius="md"
                style={{ border: '1px solid var(--phantom-border-subtle)' }}
              >
                <Group gap="xs" mb="sm" justify="space-between">
                  <Group gap="xs">
                    <Text fz="xs" fw={600} c="var(--phantom-accent-glow)" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                      {projectProfile?.type} · {projectProfile?.buildSystem}
                    </Text>
                    <Text fz="xs" c="var(--phantom-text-muted)">
                      {allRecipes.length} commands
                    </Text>
                  </Group>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="teal"
                    onClick={() => setRecipeModal({ opened: true, mode: 'create' })}
                    title="Create custom recipe"
                    data-testid="create-recipe-button"
                  >
                    <Plus size={14} />
                  </ActionIcon>
                </Group>

                <Tabs value={activeRecipeTab} onChange={setActiveRecipeTab}>
                  <Tabs.List
                    style={{
                      borderBottom: '1px solid var(--phantom-border-subtle)',
                      '--tabs-list-border-size': '0px',
                    } as React.CSSProperties}
                  >
                    <Tabs.Tab
                      value="all"
                      fz="xs"
                      c={activeRecipeTab === 'all' ? 'var(--phantom-accent-glow)' : 'var(--phantom-text-muted)'}
                      style={{ borderBottom: activeRecipeTab === 'all' ? '2px solid var(--phantom-accent-glow)' : 'none' }}
                    >
                      All ({allRecipes.length})
                    </Tabs.Tab>
                    <Tabs.Tab
                      value="favorites"
                      fz="xs"
                      c={activeRecipeTab === 'favorites' ? 'var(--phantom-accent-glow)' : 'var(--phantom-text-muted)'}
                      style={{ borderBottom: activeRecipeTab === 'favorites' ? '2px solid var(--phantom-accent-glow)' : 'none' }}
                    >
                      <Group gap={4}>
                        <Star size={12} />
                        Favorites ({favoriteRecipes.length})
                      </Group>
                    </Tabs.Tab>
                  </Tabs.List>

                  <Tabs.Panel value="all">
                    <Stack gap={2} style={{ maxHeight: '60vh', overflowY: 'auto' }} mt="xs">
                      {allRecipes.map((recipe) => (
                        <Group
                          key={recipe.id}
                          gap="sm"
                          wrap="nowrap"
                          py={5}
                          px={8}
                          style={{
                            borderRadius: 4,
                            cursor: 'pointer',
                            transition: 'background-color 100ms ease',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                          }}
                        >
                          <ActionIcon
                            size="xs"
                            variant="transparent"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(recipe.id);
                            }}
                            style={{ flexShrink: 0 }}
                          >
                            <Star
                              size={14}
                              fill={recipe.favorite ? 'var(--phantom-accent-glow)' : 'none'}
                              color={recipe.favorite ? 'var(--phantom-accent-glow)' : 'var(--phantom-text-muted)'}
                            />
                          </ActionIcon>
                          <ActionIcon
                            size="xs"
                            variant="filled"
                            color="green"
                            radius="xl"
                            style={{ flexShrink: 0 }}
                            onClick={() => {
                              store.addPaneAsTab('terminal', {
                                cwd: worktree?.worktreePath ?? project?.repoPath,
                                initialCommand: recipe.command,
                                worktreeId: worktree?.id,
                                projectId: project?.id,
                                recipeCommand: recipe.command,
                                recipeLabel: recipe.label,
                                recipeCategory: recipe.category,
                              } as Record<string, unknown>, recipe.label);
                            }}
                          >
                            <Play size={10} />
                          </ActionIcon>
                          <Text fz="0.78rem" fw={500} c="var(--phantom-text-primary)" style={{ minWidth: 80 }}>
                            {recipe.label}
                          </Text>
                          <Text fz="0.7rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace" truncate style={{ flex: 1 }}>
                            {recipe.command}
                          </Text>
                          {!recipe.auto && (
                            <Group gap={2} style={{ flexShrink: 0 }}>
                              <ActionIcon size="xs" variant="transparent" onClick={(e) => { e.stopPropagation(); openEditModal(recipe); }}>
                                <Pencil size={12} color="var(--phantom-text-muted)" />
                              </ActionIcon>
                              <ActionIcon size="xs" variant="transparent" onClick={(e) => { e.stopPropagation(); deleteCustomRecipe(recipe.id); }}>
                                <Trash2 size={12} color="var(--phantom-text-muted)" />
                              </ActionIcon>
                            </Group>
                          )}
                        </Group>
                      ))}
                    </Stack>
                  </Tabs.Panel>

                  <Tabs.Panel value="favorites">
                    <Stack gap={2} style={{ maxHeight: '60vh', overflowY: 'auto' }} mt="xs">
                      {favoriteRecipes.length > 0 ? (
                        favoriteRecipes.map((recipe) => (
                          <Group
                            key={recipe.id}
                            gap="sm"
                            wrap="nowrap"
                            py={5}
                            px={8}
                            style={{
                              borderRadius: 4,
                              cursor: 'pointer',
                              transition: 'background-color 100ms ease',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated)';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                            }}
                          >
                            <ActionIcon
                              size="xs"
                              variant="transparent"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(recipe.id);
                              }}
                              style={{ flexShrink: 0 }}
                            >
                              <Star
                                size={14}
                                fill="var(--phantom-accent-glow)"
                                color="var(--phantom-accent-glow)"
                              />
                            </ActionIcon>
                            <ActionIcon
                              size="xs"
                              variant="filled"
                              color="green"
                              radius="xl"
                              style={{ flexShrink: 0 }}
                              onClick={() => {
                                store.addPaneAsTab('terminal', {
                                  cwd: worktree?.worktreePath ?? project?.repoPath,
                                  initialCommand: recipe.command,
                                  worktreeId: worktree?.id,
                                  projectId: project?.id,
                                  recipeCommand: recipe.command,
                                  recipeLabel: recipe.label,
                                  recipeCategory: recipe.category,
                                } as Record<string, unknown>, recipe.label);
                              }}
                            >
                              <Play size={10} />
                            </ActionIcon>
                            <Text fz="0.78rem" fw={500} c="var(--phantom-text-primary)" style={{ minWidth: 80 }}>
                              {recipe.label}
                            </Text>
                            <Text fz="0.7rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace" truncate style={{ flex: 1 }}>
                              {recipe.command}
                            </Text>
                            {!recipe.auto && (
                              <Group gap={2} style={{ flexShrink: 0 }}>
                                <ActionIcon size="xs" variant="transparent" onClick={(e) => { e.stopPropagation(); openEditModal(recipe); }}>
                                  <Pencil size={12} color="var(--phantom-text-muted)" />
                                </ActionIcon>
                                <ActionIcon size="xs" variant="transparent" onClick={(e) => { e.stopPropagation(); deleteCustomRecipe(recipe.id); }}>
                                  <Trash2 size={12} color="var(--phantom-text-muted)" />
                                </ActionIcon>
                              </Group>
                            )}
                          </Group>
                        ))
                      ) : (
                        <Text fz="xs" c="var(--phantom-text-muted)" ta="center" py="lg">
                          Star a recipe to pin it here
                        </Text>
                      )}
                    </Stack>
                  </Tabs.Panel>
                </Tabs>
              </Paper>
            )}

            {/* Recent Chats */}
            {recentChats.length > 0 && (
              <Paper
                p="md"
                bg="var(--phantom-surface-card)"
                radius="md"
                style={{ border: '1px solid var(--phantom-border-subtle)' }}
              >
                <Group gap="xs" mb="sm">
                  <MessageSquare size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
                  <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Recent Chats</Text>
                </Group>
                <Stack gap={4}>
                  {recentChats.map((chat) => (
                    <Group
                      key={chat.id}
                      gap="sm"
                      py={4}
                      px={6}
                      style={{
                        cursor: 'pointer',
                        borderRadius: 4,
                        transition: 'background-color 100ms ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                      onClick={() => {
                        store.addPaneAsTab('chat', { cwd: worktree?.worktreePath, conversationId: chat.id } as Record<string, unknown>, 'Chat');
                      }}
                    >
                      <MessageSquare size={12} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />
                      <Text fz="0.78rem" c="var(--phantom-text-primary)" lineClamp={1} style={{ flex: 1 }}>
                        {chat.title}
                      </Text>
                      <Text fz="0.65rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0 }}>
                        {formatRelativeTime(chat.updatedAt)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            )}
          </Stack>

          {/* RIGHT COLUMN — Tools + Info */}
          <Stack gap="md">
            {/* Tools */}
            <Paper
              p="md"
              bg="var(--phantom-surface-card)"
              radius="md"
              style={{ border: '1px solid var(--phantom-border-subtle)' }}
            >
              <Text fz="xs" fw={600} c="var(--phantom-text-muted)" tt="uppercase" mb="sm" style={{ letterSpacing: '0.08em' }}>
                Tools
              </Text>
              <SimpleGrid cols={2} spacing="sm">
                <QuickActionCard
                  icon={<TerminalIcon size={20} style={{ color: 'var(--phantom-accent-glow)' }} />}
                  label="Terminal"
                  shortcut="Ctrl+`"
                  onClick={openTerminal}
                />
                <QuickActionCard
                  icon={<FileCode size={20} style={{ color: 'var(--phantom-accent-glow)' }} />}
                  label="Editor"
                  shortcut="Ctrl+N"
                  onClick={openEditor}
                />
                <QuickActionCard
                  icon={<Sparkles size={20} style={{ color: 'var(--phantom-accent-gold)' }} />}
                  label="New Session"
                  shortcut="Ctrl+J"
                  onClick={openClaude}
                />
                <QuickActionCard
                  icon={<MessageSquare size={20} style={{ color: 'var(--phantom-accent-glow)' }} />}
                  label="Chat"
                  shortcut="Ctrl+K"
                  onClick={openChat}
                />
              </SimpleGrid>
            </Paper>

            {/* Running Servers */}
            {worktree?.id && <RunningServersCard worktreeId={worktree.id} />}

            {/* Live Tasks */}
            {worktree?.worktreePath && <TasksCard cwd={worktree.worktreePath} />}

            {/* Plans */}
            {worktree?.id && <PlansCard worktreeId={worktree.id} />}

            {/* Git Status + Daily Quests */}
            <GitStatusCard state={gitStatusState} />
          </Stack>
        </div>

        {/* Quote */}
        <Text
          fz="sm"
          c="var(--phantom-text-muted)"
          fs="italic"
          ta="center"
          mt="md"
        >
          &ldquo;{quote}&rdquo;
        </Text>
      </Stack>

      <RecipeFormModal
        opened={recipeModal.opened}
        onClose={() => setRecipeModal({ opened: false, mode: 'create' })}
        onSubmit={recipeModal.mode === 'create' ? handleCreateRecipe : handleEditRecipe}
        mode={recipeModal.mode}
        initialValues={recipeModal.initialValues}
      />
    </div>
  );
}
