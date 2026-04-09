/**
 * HunterStatsView — Hunter Stats Dashboard container
 * Aggregates heatmap, lifetime stats, model breakdown, and session timeline.
 * @author Subash Karki
 */
import { SimpleGrid, Stack, Title, Group, Text, Loader, Center } from '@mantine/core';
import { BarChart3 } from 'lucide-react';

import { useHunterDashboard } from '../../hooks/useHunterDashboard';
import { ActivityHeatmap } from './ActivityHeatmap';
import { LifetimeStatsCards } from './LifetimeStatsCards';
import { ModelBreakdown } from './ModelBreakdown';
import { SessionTimeline } from './SessionTimeline';

export const HunterStatsView = () => {
  const { heatmap, lifetime, modelBreakdown, timeline, loading } = useHunterDashboard();

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

      {/* Model Breakdown + Session Timeline — side by side on large screens */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <ModelBreakdown data={modelBreakdown} />
        <SessionTimeline sessions={timeline} />
      </SimpleGrid>
    </Stack>
  );
};
