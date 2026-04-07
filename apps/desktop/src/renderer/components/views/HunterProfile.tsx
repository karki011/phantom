/**
 * HunterProfile View
 * Full hunter profile page with editable name, rank, XP, stats, and lifetime metrics
 *
 * @author Subash Karki
 */
import {
  Box,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  Activity,
  CheckSquare,
  Coins,
  Flame,
  FolderGit2,
  ListChecks,
  User,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';

import { useHunter } from '../../hooks/useHunter';
import { useSessions } from '../../hooks/useSessions';
import { updateHunterName } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';
import { RankBadge } from '../status-window/RankBadge';
import { StatBar } from '../status-window/StatBar';
import { XPProgressBar } from '../status-window/XPProgressBar';

// ---------------------------------------------------------------------------
// Stat configuration
// ---------------------------------------------------------------------------

const STAT_CONFIG = [
  { key: 'strength', abbreviation: 'STR', label: 'Strength', color: 'red' },
  { key: 'intelligence', abbreviation: 'INT', label: 'Intelligence', color: 'blue' },
  { key: 'agility', abbreviation: 'AGI', label: 'Agility', color: 'green' },
  { key: 'vitality', abbreviation: 'VIT', label: 'Vitality', color: 'orange' },
  { key: 'perception', abbreviation: 'PER', label: 'Perception', color: 'grape' },
  { key: 'sense', abbreviation: 'SEN', label: 'Sense', color: 'cyan' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return dollars >= 0.01 ? `$${dollars.toFixed(2)}` : `$${dollars.toFixed(3)}`;
};

// ---------------------------------------------------------------------------
// Lifetime Stat Card
// ---------------------------------------------------------------------------

interface LifetimeStatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  color: string;
}

const LifetimeStatCard = ({ icon, value, label, color }: LifetimeStatCardProps) => (
  <Card
    p="md"
    bg="var(--phantom-surface-card)"
    style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
  >
    <Stack align="center" gap="xs">
      <Box style={{ color: `var(--mantine-color-${color}-6)` }}>
        {icon}
      </Box>
      <Text
        ff="Orbitron, sans-serif"
        fz="1.125rem"
        fw={700}
        c="var(--phantom-text-primary)"
        ta="center"
        lh={1.2}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
      <Text fz="0.75rem" c="var(--phantom-text-secondary)" ta="center">
        {label}
      </Text>
    </Stack>
  </Card>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const HunterProfile = () => {
  const { profile, stats, loading, refresh } = useHunter();
  const { recent } = useSessions();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const handleNameClick = useCallback(() => {
    if (profile) {
      setEditName(profile.name);
      setEditing(true);
    }
  }, [profile]);

  const handleNameSubmit = useCallback(async () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== profile?.name) {
      try {
        await updateHunterName(trimmed);
        refresh();
      } catch {
        // Silently fail -- name stays unchanged
      }
    }
    setEditing(false);
  }, [editName, profile?.name, refresh]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNameSubmit();
      }
      if (e.key === 'Escape') {
        setEditing(false);
      }
    },
    [handleNameSubmit],
  );

  // Compute lifetime token and cost totals from recent sessions
  const lifetimeTotals = (() => {
    let tokens = 0;
    let cost = 0;
    for (const s of recent) {
      tokens += s.inputTokens + s.outputTokens;
      cost += s.estimatedCostMicros;
    }
    return { tokens, cost };
  })();

  // Unique repos count
  const uniqueRepos = new Set(
    recent.filter((s) => s.repo != null).map((s) => s.repo),
  ).size;

  if (loading) {
    return (
      <Stack gap="lg">
        <ViewHeader
          title="Hunter Profile"
          icon={<User size={20} />}
          subtitle="Your System status"
        />
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Stack gap="md">
            <Skeleton circle h="7.5rem" w="7.5rem" mx="auto" />
            <Skeleton h="1.5rem" w="60%" mx="auto" />
            <Skeleton h="1rem" w="40%" mx="auto" />
            <Skeleton h="3.5rem" w="3.5rem" mx="auto" />
            <Skeleton h="2rem" />
          </Stack>
          <Stack gap="sm">
            <Skeleton h="1rem" w="4rem" />
            <Skeleton h="0.5rem" />
            <Skeleton h="0.5rem" />
            <Skeleton h="0.5rem" />
            <Skeleton h="0.5rem" />
            <Skeleton h="0.5rem" />
            <Skeleton h="0.5rem" />
          </Stack>
        </SimpleGrid>
      </Stack>
    );
  }

  if (!profile || !stats) {
    return (
      <Stack gap="lg">
        <ViewHeader
          title="Hunter Profile"
          icon={<User size={20} />}
          subtitle="Your System status"
        />
        <Text fz="0.875rem" c="var(--phantom-text-muted)" ta="center">
          Unable to load hunter data.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Hunter Profile"
        icon={<User size={20} />}
        subtitle="Your System status"
      />

      {/* Two-column layout */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* Left column: Identity */}
        <Card
          p="lg"
          bg="var(--phantom-surface-card)"
          style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
        >
          <Stack align="center" gap="md">
            {/* Avatar placeholder */}
            <Box
              w="7.5rem"
              h="7.5rem"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                border: '0.125rem solid var(--phantom-border-subtle)',
                backgroundColor: 'var(--phantom-surface-bg)',
              }}
              role="img"
              aria-label="Hunter avatar placeholder"
            >
              <User
                size={48}
                style={{ color: 'var(--phantom-text-muted)' }}
                aria-hidden="true"
              />
            </Box>
            <Text fz="0.6875rem" c="var(--phantom-text-muted)">
              Upload coming soon
            </Text>

            {/* Editable name */}
            {editing ? (
              <TextInput
                value={editName}
                onChange={(e) => setEditName(e.currentTarget.value)}
                onBlur={handleNameSubmit}
                onKeyDown={handleNameKeyDown}
                size="md"
                autoFocus
                aria-label="Edit hunter name"
                styles={{
                  input: {
                    fontFamily: 'Orbitron, sans-serif',
                    fontWeight: 700,
                    textAlign: 'center',
                  },
                }}
              />
            ) : (
              <Text
                ff="Orbitron, sans-serif"
                fz="1.25rem"
                fw={700}
                c="var(--phantom-text-primary)"
                onClick={handleNameClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleNameClick();
                }}
                tabIndex={0}
                role="button"
                aria-label={`Hunter name: ${profile.name}. Click to edit.`}
                style={{ cursor: 'pointer' }}
              >
                {profile.name}
              </Text>
            )}

            {/* Title */}
            <Text fz="0.875rem" c="var(--phantom-text-secondary)">
              {profile.title}
            </Text>

            {/* Rank Badge (large) */}
            <RankBadge rank={profile.rank} title={profile.title} />

            {/* Level */}
            <Text
              ff="Orbitron, sans-serif"
              fz="1.125rem"
              fw={700}
              c="var(--phantom-accent-gold)"
              aria-label={`Level ${profile.level}`}
            >
              Lv. {profile.level}
            </Text>

            {/* XP Bar */}
            <Box w="100%">
              <XPProgressBar
                current={profile.xp}
                required={profile.xpToNext}
                level={profile.level}
              />
            </Box>
          </Stack>
        </Card>

        {/* Right column: Stats */}
        <Card
          p="lg"
          bg="var(--phantom-surface-card)"
          style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
        >
          <Stack gap="md">
            <Text
              ff="Orbitron, sans-serif"
              fz="0.8125rem"
              fw={700}
              c="var(--phantom-text-secondary)"
              tt="uppercase"
              style={{ letterSpacing: '0.05em' }}
            >
              Stats
            </Text>

            <Stack gap="xs">
              {STAT_CONFIG.map(({ key, abbreviation, label, color }) => (
                <StatBar
                  key={key}
                  label={label}
                  abbreviation={abbreviation}
                  value={stats[key]}
                  color={color}
                />
              ))}
            </Stack>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Lifetime Stats */}
      <Stack gap="sm">
        <Text
          ff="Orbitron, sans-serif"
          fz="0.8125rem"
          fw={700}
          c="var(--phantom-text-secondary)"
          tt="uppercase"
          style={{ letterSpacing: '0.05em' }}
        >
          Lifetime Stats
        </Text>

        <SimpleGrid
          cols={{ base: 2, xs: 3, md: 6 }}
          spacing="md"
          role="region"
          aria-label="Lifetime statistics"
        >
          <LifetimeStatCard
            icon={<Activity size={20} aria-hidden="true" />}
            value={profile.totalSessions}
            label="Total Sessions"
            color="blue"
          />
          <LifetimeStatCard
            icon={<ListChecks size={20} aria-hidden="true" />}
            value={profile.totalTasks}
            label="Total Tasks"
            color="green"
          />
          <LifetimeStatCard
            icon={<FolderGit2 size={20} aria-hidden="true" />}
            value={profile.totalRepos > 0 ? profile.totalRepos : uniqueRepos}
            label="Total Repos"
            color="grape"
          />
          <LifetimeStatCard
            icon={<CheckSquare size={20} aria-hidden="true" />}
            value={formatTokens(lifetimeTotals.tokens)}
            label="Total Tokens"
            color="cyan"
          />
          <LifetimeStatCard
            icon={<Coins size={20} aria-hidden="true" />}
            value={formatCost(lifetimeTotals.cost)}
            label="Estimated Cost"
            color="orange"
          />
          <LifetimeStatCard
            icon={<Flame size={20} aria-hidden="true" />}
            value={profile.streakBest}
            label="Best Streak"
            color="red"
          />
        </SimpleGrid>
      </Stack>
    </Stack>
  );
};
