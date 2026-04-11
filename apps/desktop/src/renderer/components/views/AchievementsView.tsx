/**
 * AchievementsView Component
 * Full achievement collection grid with category filtering and unlock state
 *
 * @author Subash Karki
 */
import {
  Badge,
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import {
  CheckCircle,
  Clock,
  Crown,
  Flame,
  Ghost,
  GitBranch,
  Globe,
  Lock,
  Moon,
  Shield,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Swords,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';

import {
  achievementsAtom,
  refreshAchievementsAtom,
} from '../../atoms/achievements';
import type { AchievementData } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const ACHIEVEMENT_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  sparkles: Sparkles,
  ghost: Ghost,
  shield: Shield,
  'shield-check': ShieldCheck,
  flame: Flame,
  'git-branch': GitBranch,
  zap: Zap,
  clock: Clock,
  swords: Swords,
  users: Users,
  'check-circle': CheckCircle,
  moon: Moon,
  sunrise: Sunrise,
  globe: Globe,
  crown: Crown,
};

const getAchievementIcon = (iconName: string) =>
  ACHIEVEMENT_ICONS[iconName] ?? Trophy;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CategoryFilter = 'All' | 'Combat' | 'Exploration' | 'Mastery' | 'Dedication' | 'Milestone' | 'Rank';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AchievementsView = () => {
  const achievements = useAtomValue(achievementsAtom);
  const refresh = useSetAtom(refreshAchievementsAtom);
  const [loading, setLoading] = useState(achievements.length === 0);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');

  // Fetch on mount if empty
  useEffect(() => {
    if (achievements.length > 0) return;
    let active = true;
    setLoading(true);
    refresh().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [achievements.length, refresh]);

  const filtered = useMemo(() => {
    if (categoryFilter === 'All') return achievements;
    return achievements.filter(
      (a) => a.category?.toLowerCase() === categoryFilter.toLowerCase(),
    );
  }, [achievements, categoryFilter]);

  const unlockedCount = achievements.filter((a) => a.unlockedAt !== null).length;

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Achievements"
        icon={<Trophy size={20} />}
        subtitle="Your collection"
      />

      {/* Unlock count */}
      <Text fz="0.8125rem" c="var(--phantom-text-secondary)">
        {unlockedCount} of {achievements.length} Unlocked
      </Text>

      {/* Category filter */}
      <SegmentedControl
        value={categoryFilter}
        onChange={(value) => setCategoryFilter(value as CategoryFilter)}
        data={[
          { label: 'All', value: 'All' },
          { label: 'Combat', value: 'Combat' },
          { label: 'Exploration', value: 'Exploration' },
          { label: 'Mastery', value: 'Mastery' },
          { label: 'Dedication', value: 'Dedication' },
          { label: 'Milestone', value: 'Milestone' },
          { label: 'Rank', value: 'Rank' },
        ]}
        size="sm"
        aria-label="Filter achievements by category"
      />

      {/* Achievement grid */}
      {loading ? (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }} spacing="sm">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} h="10rem" radius="sm" />
          ))}
        </SimpleGrid>
      ) : filtered.length === 0 ? (
        <Card
          p="xl"
          bg="var(--phantom-surface-card)"
          style={{
            border: '0.0625rem solid var(--phantom-border-subtle)',
            textAlign: 'center',
          }}
        >
          <Text fz="0.875rem" c="var(--phantom-text-muted)">
            No achievements in this category.
          </Text>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }} spacing="sm">
          {filtered.map((achievement) => (
            <AchievementCard key={achievement.id} achievement={achievement} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// AchievementCard
// ---------------------------------------------------------------------------

const AchievementCard = ({ achievement }: { achievement: AchievementData }) => {
  const isUnlocked = achievement.unlockedAt !== null;
  const Icon = getAchievementIcon(achievement.icon);

  return (
    <Card
      p="md"
      bg="var(--phantom-surface-card)"
      style={{
        border: isUnlocked
          ? '0.0625rem solid var(--phantom-accent-gold)'
          : '0.0625rem solid var(--phantom-border-subtle)',
        boxShadow: isUnlocked
          ? '0 0 0.5rem rgba(255, 193, 7, 0.15)'
          : 'none',
        opacity: isUnlocked ? 1 : 0.5,
        filter: isUnlocked ? 'none' : 'grayscale(1)',
        position: 'relative',
      }}
      aria-label={`Achievement: ${achievement.name}. ${isUnlocked ? 'Unlocked' : 'Locked'}. ${achievement.xpReward} XP.`}
    >
      {/* Lock overlay for locked achievements */}
      {!isUnlocked && (
        <div
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
          }}
          aria-hidden="true"
        >
          <Lock size={14} style={{ color: 'var(--phantom-text-muted)' }} />
        </div>
      )}

      <Stack align="center" gap="sm">
        <Icon
          size={32}
          aria-hidden="true"
        />

        <Text
          fz="0.875rem"
          fw={600}
          c="var(--phantom-text-primary)"
          ta="center"
          lineClamp={1}
        >
          {achievement.name}
        </Text>

        <Text
          fz="0.75rem"
          c="var(--phantom-text-muted)"
          ta="center"
          lineClamp={2}
        >
          {achievement.description}
        </Text>

        <Group gap="xs" justify="center">
          <Badge size="xs" color="yellow" variant="light">
            +{achievement.xpReward} XP
          </Badge>
          {achievement.category != null && (
            <Badge size="xs" color="gray" variant="light">
              {achievement.category}
            </Badge>
          )}
        </Group>

        {isUnlocked && achievement.unlockedAt != null && (
          <Text fz="0.6875rem" c="var(--phantom-text-muted)">
            Unlocked {formatDate(achievement.unlockedAt)}
          </Text>
        )}
      </Stack>
    </Card>
  );
};
