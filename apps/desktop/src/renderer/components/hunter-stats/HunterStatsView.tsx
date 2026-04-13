/**
 * HunterStatsView — Hunter Stats Dashboard container
 * Aggregates heatmap, lifetime stats, model breakdown, and session timeline.
 * @author Subash Karki
 */
import { Badge, Paper, SimpleGrid, Stack, Title, Group, Text, Loader, Center } from '@mantine/core';
import { BarChart3, Trophy } from 'lucide-react';
import { useAtomValue } from 'jotai';

import { useHunterDashboard } from '../../hooks/useHunterDashboard';
import { useRouter } from '../../hooks/useRouter';
import { achievementsAtom, unlockedCountAtom } from '../../atoms/achievements';
import { ActivityHeatmap } from './ActivityHeatmap';
import { LifetimeStatsCards } from './LifetimeStatsCards';
import { ModelBreakdown } from './ModelBreakdown';
import { SessionTimeline } from './SessionTimeline';

export const HunterStatsView = () => {
  const { heatmap, lifetime, modelBreakdown, timeline, loading } = useHunterDashboard();
  const { navigate } = useRouter();
  const achievements = useAtomValue(achievementsAtom);
  const unlockedCount = useAtomValue(unlockedCountAtom);

  if (loading && !lifetime) {
    return (
      <Center h={300}>
        <Stack align="center" gap="md">
          <Loader color="var(--phantom-accent-glow)" size="lg" />
          <Text c="var(--phantom-text-muted)" fz="sm">Loading Hunter Stats...</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="xl">
      {/* Page Header */}
      <Group gap="sm">
        <BarChart3 size={24} style={{ color: 'var(--phantom-accent-glow)' }} />
        <Title order={2} c="var(--phantom-text-primary)" ff="'Orbitron', sans-serif">
          Hunter Stats
        </Title>
      </Group>

      {/* Activity Heatmap — full width */}
      <ActivityHeatmap data={heatmap} />

      {/* Lifetime Stats Cards — full width grid */}
      <LifetimeStatsCards stats={lifetime} />

      {/* Achievements Summary — clickable card */}
      <Paper
        p="md"
        bg="var(--phantom-surface-card)"
        style={{
          border: '1px solid var(--phantom-border-subtle)',
          cursor: 'pointer',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--phantom-accent-gold, #f59e0b)';
          e.currentTarget.style.boxShadow = '0 0 0.5rem rgba(245, 158, 11, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--phantom-border-subtle)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        onClick={() => navigate('achievements')}
      >
        <Group justify="space-between">
          <Group gap="sm">
            <Trophy size={20} style={{ color: 'var(--phantom-accent-gold, #f59e0b)' }} />
            <div>
              <Text fz="0.875rem" fw={600} c="var(--phantom-text-primary)">
                Achievements
              </Text>
              <Text fz="0.75rem" c="var(--phantom-text-secondary)">
                {unlockedCount} of {achievements.length} unlocked
              </Text>
            </div>
          </Group>
          <Badge size="lg" color="yellow" variant="light">
            {unlockedCount}/{achievements.length}
          </Badge>
        </Group>
      </Paper>

      {/* Model Breakdown + Session Timeline — side by side on large screens */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <ModelBreakdown data={modelBreakdown} />
        <SessionTimeline sessions={timeline} />
      </SimpleGrid>
    </Stack>
  );
};
