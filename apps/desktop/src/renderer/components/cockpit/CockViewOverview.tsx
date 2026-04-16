/**
 * CockViewOverview Component
 * Overview banner with 4 stat cards and token breakdown
 *
 * @author Subash Karki
 */
import { SimpleGrid, Stack, Text } from '@mantine/core';
import { Activity, Database, Hash, Zap } from 'lucide-react';
import type { CockpitOverview } from '@phantom-os/shared';
import { CockpitStatCard } from './StatCard';

export interface CockViewOverviewProps {
  data: CockpitOverview;
}

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(2)}`;
};

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export const CockViewOverview = ({ data }: CockViewOverviewProps) => {
  const tokenBreakdown = [
    `${formatCount(data.inputTokens)} in`,
    `${formatCount(data.outputTokens)} out`,
    `${formatCount(data.cacheReadTokens)} cached`,
    `${formatCount(data.cacheWriteTokens)} written`,
  ].join(' · ');

  return (
    <Stack gap="xs">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <CockpitStatCard
          icon={<Hash size={16} />}
          value={formatCount(data.inputTokens + data.outputTokens)}
          label="Total Tokens"
          color="yellow"
          onClick={() => {}}
        />
        <CockpitStatCard
          icon={<Zap size={16} />}
          value={formatCount(data.totalCalls)}
          label="API Calls"
          color="cyan"
          onClick={() => {}}
        />
        <CockpitStatCard
          icon={<Activity size={16} />}
          value={data.totalSessions.toLocaleString()}
          label="Sessions"
          color="green"
          onClick={() => {}}
        />
        <CockpitStatCard
          icon={<Database size={16} />}
          value={`${(data.cacheHitRate * 100).toFixed(0)}%`}
          label="Cache Hit"
          color="grape"
          onClick={() => {}}
        />
      </SimpleGrid>
      <Text
        fz="0.7rem"
        c="var(--phantom-text-muted)"
        ff="JetBrains Mono, monospace"
        ta="center"
      >
        {tokenBreakdown}
      </Text>
    </Stack>
  );
};
