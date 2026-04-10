/**
 * WorkspaceHome — "Hunter's Terminal"
 * Default pane content for workspace tabs. Shows rank, quick actions,
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
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { usePaneStore } from '@phantom-os/panes';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  AlertTriangle, BarChart3, Beaker, Braces, FileCode, GitBranch,
  Hammer, MessageSquare, Package, Play, Rocket, Settings2, Sparkles,
  Target, Terminal as TerminalIcon, Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { activeWorkspaceAtom, deleteWorkspaceAtom, projectsAtom } from '../atoms/workspaces';
import { useHunter } from '../hooks/useHunter';
import { useProjectProfile } from '../hooks/useProjectProfile';
import { useQuests } from '../hooks/useQuests';
import { useRouter } from '../hooks/useRouter';
import { RunningServersCard } from './RunningServersCard';

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

const RECIPE_ICONS: Record<string, React.ReactNode> = {
  test: <Beaker size={20} />,
  lint: <Braces size={20} />,
  build: <Hammer size={20} />,
  serve: <Play size={20} />,
  deploy: <Rocket size={20} />,
  setup: <Package size={20} />,
  custom: <Settings2 size={20} />,
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

function RankHeader({ profile }: {
  profile: { rank: string; title: string; level: number; xp: number; xpToNext: number } | null;
}) {
  if (!profile) return null;
  const xpPercent = profile.xpToNext > 0 ? (profile.xp / profile.xpToNext) * 100 : 0;

  return (
    <Stack align="center" gap={4}>
      <Title
        order={1}
        ff="'Orbitron', sans-serif"
        fw={900}
        fz="2.5rem"
        c="var(--phantom-accent-glow)"
        style={{ textShadow: '0 0 20px var(--phantom-accent-glow), 0 0 40px var(--phantom-accent-glow)' }}
      >
        {profile.rank}-RANK
      </Title>
      <Text fz="sm" c="var(--phantom-text-secondary)">
        {profile.title} &middot; Lv.{profile.level}
      </Text>
      <Progress
        value={xpPercent}
        color="var(--phantom-accent-glow)"
        size="xs"
        w={200}
        bg="var(--phantom-surface-elevated)"
        radius="xl"
      />
      <Text fz="xs" c="var(--phantom-text-muted)">
        {profile.xp} / {profile.xpToNext} XP
      </Text>
    </Stack>
  );
}

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
      p="md"
      bg="var(--phantom-surface-card)"
      radius="md"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: '1px solid var(--phantom-border-subtle)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        minHeight: '5.5rem',
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
      <Stack align="center" gap="sm">
        {icon}
        <Text fw={600} fz="md" c="var(--phantom-text-primary)">{label}</Text>
        <Kbd fz="xs">{shortcut}</Kbd>
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

function DailyQuestsCard({ quests }: { quests: { total: number; completed: number; availableXp: number } }) {
  const percent = quests.total > 0 ? (quests.completed / quests.total) * 100 : 0;

  return (
    <Paper p="md" bg="var(--phantom-surface-card)" radius="md" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
      <Group gap="xs" mb="xs">
        <Target size={14} style={{ color: 'var(--phantom-accent-gold)' }} />
        <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Daily Quests</Text>
      </Group>
      <Group gap="xs">
        <Text fz="sm" fw={600} c="var(--phantom-text-primary)">
          {quests.completed}/{quests.total} complete
        </Text>
      </Group>
      <Progress
        value={percent}
        color="var(--phantom-accent-gold)"
        size="xs"
        bg="var(--phantom-surface-elevated)"
        radius="xl"
        mt={6}
      />
      {quests.availableXp > 0 && (
        <Text fz="xs" c="var(--phantom-accent-gold)" mt={4}>
          +{quests.availableXp} XP available
        </Text>
      )}
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkspaceHome() {
  const { profile } = useHunter();
  const { quests } = useQuests();
  const { navigate } = useRouter();
  const store = usePaneStore();
  const workspace = useAtomValue(activeWorkspaceAtom);
  const projects = useAtomValue(projectsAtom);
  const deleteWorkspace = useSetAtom(deleteWorkspaceAtom);

  const project = workspace
    ? projects.find((p) => p.id === workspace.projectId) ?? null
    : null;
  const { profile: projectProfile } = useProjectProfile(project?.id ?? null);

  // Prefer worktreePath (the checked-out path for this workspace), fall back to
  // the project's bare repoPath. Either is a valid git directory for IPC.
  const gitPath = workspace?.worktreePath ?? project?.repoPath ?? null;

  const [gitStatusState, setGitStatusState] = useState<GitStatusState>('loading');
  const [recentChats, setRecentChats] = useState<{ id: string; title: string; updatedAt: number }[]>([]);

  // Fetch recent chats for this workspace
  useEffect(() => {
    if (!workspace?.id) return;
    fetch(`/api/chat/conversations?workspaceId=${workspace.id}&limit=5`)
      .then((r) => r.json())
      .then((convs) => setRecentChats(convs))
      .catch(() => {});
  }, [workspace?.id]);

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

    setGitStatusState('loading');
    window.phantomOS.invoke('phantom:git-status', gitPath)
      .then((result) => {
        setGitStatusState(result ? (result as GitStatus) : 'unavailable');
      })
      .catch(() => setGitStatusState('error'));
  }, [gitPath]);

  // Random quote (stable per mount)
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  // Quest summary
  const questSummary = useMemo(() => {
    const total = quests.length;
    const completed = quests.filter((q) => q.completed).length;
    const availableXp = quests
      .filter((q) => !q.completed)
      .reduce((sum, q) => sum + q.xpReward, 0);
    return { total, completed, availableXp };
  }, [quests]);

  const openTerminal = useCallback(() => store.addPaneAsTab('terminal', { cwd: workspace?.worktreePath } as Record<string, unknown>, 'Terminal'), [store, workspace]);
  const openEditor = useCallback(() => store.addPaneAsTab('editor', {} as Record<string, unknown>, 'Editor'), [store]);
  const openClaude = useCallback(() => store.addPaneAsTab('terminal', { cwd: workspace?.worktreePath, initialCommand: 'claude --dangerously-skip-permissions' } as Record<string, unknown>, 'Claude'), [store, workspace]);
  const openChat = useCallback(() => store.addPaneAsTab('chat', { cwd: workspace?.worktreePath } as Record<string, unknown>, 'Chat'), [store, workspace]);

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
  if (workspace && workspace.worktreeValid === false) {
    return (
      <Center h="100%">
        <Stack align="center" gap="md" maw={420} px="md">
          <AlertTriangle size={40} style={{ color: 'var(--phantom-status-warning)' }} />
          <Title order={3} c="var(--phantom-text-primary)" ta="center">
            Worktree Not Found
          </Title>
          <Text fz="sm" c="var(--phantom-text-secondary)" ta="center">
            The git worktree for this workspace was deleted externally.
          </Text>
          <Text fz="xs" c="var(--phantom-text-muted)" ta="center" ff="monospace">
            Path: {workspace.worktreePath}
          </Text>
          <Button
            variant="light"
            color="red"
            size="sm"
            leftSection={<Trash2 size={14} />}
            mt="sm"
            onClick={() => deleteWorkspace(workspace.id)}
          >
            Delete Workspace
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px' }}>
      <Stack align="center" gap="lg" maw={1400} w="100%" mx="auto">
        {/* Rank Header */}
        <RankHeader profile={profile} />

        {/* Two-column layout: Recipes | Tools + Info */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
            gap: 'var(--mantine-spacing-lg)',
            width: '100%',
            alignItems: 'start',
          }}
        >
          {/* LEFT COLUMN — Project Recipes */}
          <Stack gap="md">
            {projectProfile && projectProfile.recipes.length > 0 && (
              <Paper
                p="md"
                bg="var(--phantom-surface-card)"
                radius="md"
                style={{ border: '1px solid var(--phantom-border-subtle)' }}
              >
                <Group gap="xs" mb="sm">
                  <Text fz="xs" fw={600} c="var(--phantom-accent-glow)" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                    {projectProfile.type} · {projectProfile.buildSystem}
                  </Text>
                  <Text fz="xs" c="var(--phantom-text-muted)">
                    {projectProfile.recipes.length} commands
                  </Text>
                </Group>
                <Stack gap={2} style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {projectProfile.recipes.map((recipe) => (
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
                      onClick={() => {
                        const port = recipe.category === 'serve' ? workspace?.portBase : null;
                        store.addPaneAsTab('terminal', {
                          cwd: workspace?.worktreePath ?? project?.repoPath,
                          initialCommand: recipe.command,
                          workspaceId: workspace?.id,
                          projectId: project?.id,
                          recipeCommand: recipe.command,
                          recipeLabel: recipe.label,
                          recipeCategory: recipe.category,
                          port,
                        } as Record<string, unknown>, recipe.label);
                      }}
                    >
                      <ActionIcon
                        size="xs"
                        variant="filled"
                        color="green"
                        radius="xl"
                        style={{ flexShrink: 0 }}
                      >
                        <Play size={10} />
                      </ActionIcon>
                      <Text fz="0.78rem" fw={500} c="var(--phantom-text-primary)" style={{ minWidth: 80 }}>
                        {recipe.label}
                      </Text>
                      <Text fz="0.7rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace" truncate style={{ flex: 1 }}>
                        {recipe.command}
                      </Text>
                    </Group>
                  ))}
                </Stack>
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
                        store.addPaneAsTab('chat', { cwd: workspace?.worktreePath, conversationId: chat.id } as Record<string, unknown>, 'Chat');
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
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
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
                  icon={<BarChart3 size={20} style={{ color: 'var(--phantom-accent-glow)' }} />}
                  label="Hunter Stats"
                  shortcut="Ctrl+H"
                  onClick={() => navigate('hunter-stats')}
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
            {workspace?.id && <RunningServersCard workspaceId={workspace.id} />}

            {/* Git Status + Daily Quests */}
            <GitStatusCard state={gitStatusState} />
            <DailyQuestsCard quests={questSummary} />
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
    </div>
  );
}
