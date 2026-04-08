/**
 * WorkspaceHome — "Hunter's Terminal"
 * Default pane content for workspace tabs. Shows rank, quick actions,
 * git status, daily quests, and a Solo Leveling quote.
 *
 * @author Subash Karki
 */
import {
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
import { useAtomValue } from 'jotai';
import { FileCode, GitBranch, Sword, Target, Terminal as TerminalIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { activeWorkspaceAtom } from '../atoms/workspaces';
import { useHunter } from '../hooks/useHunter';
import { useQuests } from '../hooks/useQuests';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
      p="lg"
      bg="var(--phantom-surface-card)"
      radius="md"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: '1px solid var(--phantom-border-subtle)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
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
      <Stack align="center" gap="xs">
        {icon}
        <Text fw={600} fz="sm" c="var(--phantom-text-primary)">{label}</Text>
        <Kbd fz="xs">{shortcut}</Kbd>
      </Stack>
    </Paper>
  );
}

function GitStatusCard({ status }: { status: GitStatus | null }) {
  if (!status) {
    return (
      <Paper p="md" bg="var(--phantom-surface-card)" radius="md" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
        <Group gap="xs" mb="xs">
          <GitBranch size={14} style={{ color: 'var(--phantom-text-muted)' }} />
          <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Git Status</Text>
        </Group>
        <Text fz="xs" c="var(--phantom-text-muted)">Loading...</Text>
      </Paper>
    );
  }

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
  const store = usePaneStore();
  const workspace = useAtomValue(activeWorkspaceAtom);

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  // Fetch git status via IPC
  useEffect(() => {
    if (!workspace?.repoPath) return;
    const isDesktop = window.phantomOS?.isDesktop;
    if (!isDesktop) return;

    window.phantomOS.invoke('phantom:git-status', workspace.repoPath)
      .then((result) => setGitStatus(result as GitStatus | null))
      .catch(() => setGitStatus(null));
  }, [workspace?.repoPath]);

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

  const openTerminal = useCallback(() => store.addPane('terminal'), [store]);
  const openEditor = useCallback(() => store.addPane('editor'), [store]);

  return (
    <Center h="100%" style={{ overflow: 'auto' }}>
      <Stack align="center" gap="xl" maw={560} w="100%" px="md" py="xl">
        {/* Rank Header */}
        <RankHeader profile={profile} />

        {/* Quick Actions */}
        <SimpleGrid cols={{ base: 2, sm: 3 }} w="100%" spacing="md">
          <QuickActionCard
            icon={<TerminalIcon size={24} style={{ color: 'var(--phantom-accent-glow)' }} />}
            label="Terminal"
            shortcut="Ctrl+`"
            onClick={openTerminal}
          />
          <QuickActionCard
            icon={<FileCode size={24} style={{ color: 'var(--phantom-accent-glow)' }} />}
            label="Editor"
            shortcut="Ctrl+N"
            onClick={openEditor}
          />
          <QuickActionCard
            icon={<Sword size={24} style={{ color: 'var(--phantom-accent-gold)' }} />}
            label="New Quest"
            shortcut="Ctrl+Q"
            onClick={openTerminal}
          />
        </SimpleGrid>

        {/* Info Cards */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} w="100%" spacing="md">
          <GitStatusCard status={gitStatus} />
          <DailyQuestsCard quests={questSummary} />
        </SimpleGrid>

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
    </Center>
  );
}
