/**
 * ActivityBreakdown Component
 * Activity category breakdown with one-shot rates
 *
 * @author Subash Karki
 */
import { Badge, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { Target } from 'lucide-react';
import type { ActivityEntry } from '@phantom-os/shared';
import { ACTIVITY_LABELS } from '@phantom-os/shared';
import { GradientBar } from './GradientBar';

export interface ActivityBreakdownProps {
  items: ActivityEntry[];
}

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(2)}`;
};

const getOneShotColor = (rate: number | null): string => {
  if (rate === null) return 'var(--phantom-text-muted)';
  if (rate >= 0.8) return 'var(--phantom-status-active)';
  if (rate >= 0.5) return 'var(--phantom-accent-gold)';
  return 'var(--phantom-status-danger)';
};

const formatOneShotRate = (rate: number | null): string => {
  if (rate === null) return '--';
  return `${(rate * 100).toFixed(0)}%`;
};

export const ActivityBreakdown = ({ items }: ActivityBreakdownProps) => {
  const maxSessions = items.length > 0 ? Math.max(...items.map((i) => i.sessions)) : 1;

  return (
    <Stack gap="sm" style={{ flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <Group justify="space-between" align="center" style={{ flexShrink: 0 }}>
        <Group gap="xs" align="center">
          <Target size={14} color="var(--phantom-text-secondary)" />
          <Text
            ff="Orbitron, sans-serif"
            fz="sm"
            fw={600}
            c="var(--phantom-text-primary)"
          >
            By Activity
          </Text>
        </Group>
        <Badge
          size="xs"
          variant="outline"
          style={{
            borderColor: 'var(--phantom-border-subtle)',
            color: 'var(--phantom-text-muted)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
          }}
        >
          1-shot
        </Badge>
      </Group>

      {/* Items */}
      {items.length === 0 ? (
        <Text fz="0.75rem" c="var(--phantom-text-muted)" ta="center" py="md">
          No data
        </Text>
      ) : (
        <ScrollArea style={{ flex: 1 }} scrollbarSize={4}>
          <Stack gap="sm">
            {items.map((item) => (
              <Stack key={item.category} gap={4}>
                <Group justify="space-between" align="baseline" wrap="nowrap">
                  <Text
                    fz="0.75rem"
                    c="var(--phantom-text-secondary)"
                    ff="JetBrains Mono, monospace"
                  >
                    {ACTIVITY_LABELS[item.category]}
                  </Text>
                  <Group gap="sm" align="baseline">
                    <Text fz="0.75rem" c="var(--phantom-text-primary)" fw={600}>
                      {item.sessions} sessions
                    </Text>
                    <Text
                      fz="0.7rem"
                      fw={600}
                      style={{ color: getOneShotColor(item.oneShotRate) }}
                    >
                      {formatOneShotRate(item.oneShotRate)}
                    </Text>
                  </Group>
                </Group>
                <GradientBar
                  value={maxSessions > 0 ? item.sessions / maxSessions : 0}
                  height={6}
                />
              </Stack>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
};
