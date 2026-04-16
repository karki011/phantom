/**
 * BreakdownPanel Component
 * Generic ranked list panel with gradient bars
 *
 * @author Subash Karki
 */
import { Group, ScrollArea, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { GradientBar } from './GradientBar';

export interface BreakdownItem {
  name: string;
  value: number; // 0-1 relative to max
  label: string;
  sublabel?: string;
}

export interface BreakdownPanelProps {
  title: string;
  icon: ReactNode;
  items: BreakdownItem[];
  barColor?: string;
}

export const BreakdownPanel = ({ title, icon, items, barColor }: BreakdownPanelProps) => {
  const maxValue = items.length > 0 ? Math.max(...items.map((i) => i.value)) : 1;

  return (
    <Stack gap="sm" style={{ flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <Group gap="xs" align="center" style={{ flexShrink: 0 }}>
        {icon}
        <Text
          ff="Orbitron, sans-serif"
          fz="sm"
          fw={600}
          c="var(--phantom-text-primary)"
        >
          {title}
        </Text>
      </Group>

      {/* Items */}
      {items.length === 0 ? (
        <Text
          fz="0.75rem"
          c="var(--phantom-text-muted)"
          ta="center"
          py="md"
        >
          No data
        </Text>
      ) : (
        <ScrollArea style={{ flex: 1 }} scrollbarSize={4}>
          <Stack gap="sm">
            {items.map((item) => (
              <Stack key={item.name} gap={4}>
                <Group justify="space-between" align="baseline" wrap="nowrap">
                  <Text
                    fz="0.75rem"
                    c="var(--phantom-text-secondary)"
                    ff="JetBrains Mono, monospace"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '60%',
                    }}
                  >
                    {item.name}
                  </Text>
                  <Group gap={4} align="baseline">
                    <Text fz="0.75rem" c="var(--phantom-text-primary)" fw={600}>
                      {item.label}
                    </Text>
                    {item.sublabel && (
                      <Text fz="0.65rem" c="var(--phantom-text-muted)">
                        {item.sublabel}
                      </Text>
                    )}
                  </Group>
                </Group>
                <GradientBar
                  value={maxValue > 0 ? item.value / maxValue : 0}
                  height={6}
                  color={barColor}
                />
              </Stack>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
};
