/**
 * GradientBar Component
 * Reusable horizontal progress bar with gradient fill
 *
 * @author Subash Karki
 */
import { Box } from '@mantine/core';

export interface GradientBarProps {
  value: number; // 0-1
  height?: number;
  color?: string;
}

export const GradientBar = ({ value, height = 10, color }: GradientBarProps) => {
  const clampedValue = Math.max(0, Math.min(1, value));

  return (
    <Box
      style={{
        width: '100%',
        height,
        background: 'var(--phantom-surface-elevated)',
        overflow: 'hidden',
        borderRadius: 2,
      }}
    >
      <Box
        style={{
          width: `${clampedValue * 100}%`,
          height: '100%',
          background: color ?? 'linear-gradient(90deg, var(--phantom-accent-glow), var(--phantom-accent-gold))',
          transition: 'width 0.3s ease',
          borderRadius: 2,
        }}
      />
    </Box>
  );
};
