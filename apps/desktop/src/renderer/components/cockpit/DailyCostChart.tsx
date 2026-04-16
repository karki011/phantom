/**
 * DailyCostChart Component
 * Daily activity bar chart with cost and call count
 *
 * @author Subash Karki
 */
import { Group, Stack, Text } from '@mantine/core';
import { Calendar } from 'lucide-react';
import type { DailyEntry } from '@phantom-os/shared';
import { GradientBar } from './GradientBar';

export interface DailyCostChartProps {
  items: DailyEntry[];
}

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(2)}`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatCount = (n: number): string => {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export const DailyCostChart = ({ items }: DailyCostChartProps) => {
  const maxCalls = items.length > 0 ? Math.max(...items.map((i) => i.calls)) : 1;

  return (
    <Stack gap="sm">
      {/* Header */}
      <Group gap="xs" align="center">
        <Calendar size={14} color="var(--phantom-text-secondary)" />
        <Text
          ff="Orbitron, sans-serif"
          fz="sm"
          fw={600}
          c="var(--phantom-text-primary)"
        >
          Daily Activity
        </Text>
      </Group>

      {/* Items */}
      {items.length === 0 ? (
        <Text fz="0.75rem" c="var(--phantom-text-muted)" ta="center" py="md">
          No data
        </Text>
      ) : (
        items.map((item) => (
          <Stack key={item.date} gap={4}>
            <Group justify="space-between" align="baseline" wrap="nowrap">
              <Text
                fz="0.75rem"
                c="var(--phantom-text-secondary)"
                ff="JetBrains Mono, monospace"
              >
                {formatDate(item.date)}
              </Text>
              <Group gap="sm" align="baseline">
                <Text fz="0.75rem" c="var(--phantom-text-primary)" fw={600}>
                  {formatCount(item.calls)} calls
                </Text>
                <Text fz="0.65rem" c="var(--phantom-text-muted)">
                  {item.sessions} sessions
                </Text>
              </Group>
            </Group>
            <GradientBar
              value={maxCalls > 0 ? item.calls / maxCalls : 0}
              height={6}
            />
          </Stack>
        ))
      )}
    </Stack>
  );
};
