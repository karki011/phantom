/**
 * Cockpit Component
 * Main dashboard view with stat cards grid and live activity feed
 *
 * @author Subash Karki
 */
import { SimpleGrid, Stack } from '@mantine/core';
import { useAtomValue } from 'jotai';
import {
  Activity,
  CheckSquare,
  Coins,
  Flame,
  Scroll,
  Shield,
  Target,
  Trophy,
} from 'lucide-react';

import { achievementsAtom } from '../../atoms/achievements';
import { useHunter } from '../../hooks/useHunter';
import { usePreferences } from '../../hooks/usePreferences';
import { useQuests } from '../../hooks/useQuests';
import { useRouter } from '../../hooks/useRouter';
import { useSessions } from '../../hooks/useSessions';
import { LiveFeed } from './LiveFeed';
import { CockpitStatCard } from './StatCard';

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(2)}`;
};

export const Cockpit = () => {
  const { navigate } = useRouter();
  const { profile } = useHunter();
  const { active } = useSessions();
  const { quests } = useQuests();
  const achievements = useAtomValue(achievementsAtom);
  const { isEnabled } = usePreferences();
  const showGamification = isEnabled('gamification');

  const totalTokens = active.reduce(
    (sum, s) => sum + s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheWriteTokens,
    0,
  );
  const totalCostMicros = active.reduce((sum, s) => sum + s.estimatedCostMicros, 0);
  const totalTasks = profile?.totalTasks ?? 0;
  const unlockedCount = achievements.filter((a) => a.unlockedAt !== null).length;
  const completedQuests = quests.filter((q) => q.completed > 0).length;

  return (
    <Stack gap="lg" data-testid="cockpit-view">
      <SimpleGrid
        cols={{ base: 2, sm: 2, md: 4, lg: 4 }}
        spacing="md"
        role="region"
        aria-label="Cockpit statistics"
      >
        <CockpitStatCard
          icon={<Activity size={26} aria-hidden="true" />}
          value={active.length}
          label="sessions"
          color="orange"
          onClick={() => navigate('sessions')}
        />
        <CockpitStatCard
          icon={<Scroll size={26} aria-hidden="true" />}
          value={profile?.totalSessions ?? 0}
          label="total"
          color="blue"
          onClick={() => navigate('history')}
        />
        <CockpitStatCard
          icon={<Coins size={26} aria-hidden="true" />}
          value={formatTokens(totalTokens)}
          label="tokens"
          sublabel={formatCost(totalCostMicros)}
          color="cyan"
          onClick={() => navigate('tokens')}
        />
        {showGamification && (
          <CockpitStatCard
            icon={<Shield size={26} aria-hidden="true" />}
            value={profile?.rank ?? 'E'}
            label="rank"
            sublabel={`Lv.${profile?.level ?? 1}`}
            color="yellow"
            onClick={() => navigate('profile')}
          />
        )}
        {showGamification && (
          <CockpitStatCard
            icon={<Flame size={26} aria-hidden="true" />}
            value={profile?.streakCurrent ?? 0}
            label="streak"
            sublabel={`best: ${profile?.streakBest ?? 0}`}
            color="red"
            onClick={() => navigate('streak')}
          />
        )}
        <CockpitStatCard
          icon={<CheckSquare size={26} aria-hidden="true" />}
          value={totalTasks}
          label="complete"
          color="green"
          onClick={() => navigate('tasks')}
        />
        {showGamification && (
          <CockpitStatCard
            icon={<Trophy size={26} aria-hidden="true" />}
            value={`${unlockedCount}/${achievements.length}`}
            label="achievements"
            color="yellow"
            onClick={() => navigate('achievements')}
          />
        )}
        {showGamification && (
          <CockpitStatCard
            icon={<Target size={26} aria-hidden="true" />}
            value={`${completedQuests}/${quests.length}`}
            label="daily quests"
            color="grape"
            onClick={() => navigate('quests')}
          />
        )}
      </SimpleGrid>

      <LiveFeed />
    </Stack>
  );
};
