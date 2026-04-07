/**
 * XPProgressBar Component
 * Animated XP progress bar with level and percentage display
 *
 * @author Subash Karki
 */
import { Group, Progress, Stack, Text } from '@mantine/core';

interface XPProgressBarProps {
  current: number;
  required: number;
  level: number;
}

export const XPProgressBar = ({ current, required, level }: XPProgressBarProps) => {
  const percentage = required > 0 ? Math.min((current / required) * 100, 100) : 0;
  const percentageLabel = `${Math.round(percentage)}%`;

  return (
    <Stack gap="0.25rem">
      <Group justify="space-between">
        <Text fz="0.75rem" c="var(--phantom-text-secondary)">
          XP: {current.toLocaleString()} / {required.toLocaleString()}
        </Text>
        <Text
          ff="Orbitron, sans-serif"
          fz="0.75rem"
          fw={600}
          c="var(--phantom-accent-glow)"
        >
          {percentageLabel}
        </Text>
      </Group>
      <Progress
        value={percentage}
        color="blue"
        size="md"
        radius="sm"
        animated
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={required}
        aria-label={`Level ${level} experience progress: ${current} of ${required} XP (${percentageLabel})`}
      />
    </Stack>
  );
};
