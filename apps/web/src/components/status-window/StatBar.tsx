/**
 * StatBar Component
 * Single stat display with abbreviation, progress bar, and value
 *
 * @author Subash Karki
 */
import { Group, Progress, Text } from '@mantine/core';

interface StatBarProps {
  label: string;
  abbreviation: string;
  value: number;
  maxValue?: number;
  color: string;
}

export const StatBar = ({
  label,
  abbreviation,
  value,
  maxValue = 100,
  color,
}: StatBarProps) => {
  // Dynamic scaling: once value exceeds the supplied maxValue, step up in
  // increments of 50 so the bar remains a useful visual indicator.
  const effectiveMax = Math.max(maxValue, Math.ceil(value / 50) * 50 + 50);
  const percentage = Math.min((value / effectiveMax) * 100, 100);

  return (
    <Group gap="xs" wrap="nowrap">
      <Text
        ff="Orbitron, sans-serif"
        fz="0.6875rem"
        fw={700}
        c="var(--phantom-text-secondary)"
        w="2.5rem"
        ta="right"
        style={{ flexShrink: 0 }}
      >
        {abbreviation}
      </Text>
      <Progress
        value={percentage}
        color={color}
        size="sm"
        radius="sm"
        style={{ flex: 1 }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={effectiveMax}
        aria-label={`${label}: ${value} out of ${effectiveMax}`}
      />
      <Text
        ff="Orbitron, sans-serif"
        fz="0.6875rem"
        fw={600}
        c="var(--phantom-text-primary)"
        w="2rem"
        ta="right"
        style={{ flexShrink: 0 }}
      >
        {value}
      </Text>
    </Group>
  );
};
