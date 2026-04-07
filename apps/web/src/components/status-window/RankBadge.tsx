/**
 * RankBadge Component
 * Circular badge displaying hunter rank with tier-based coloring
 *
 * @author Subash Karki
 */
import { Box, Stack, Text } from '@mantine/core';

interface RankBadgeProps {
  rank: string;
  title: string;
}

const RANK_COLORS: Record<string, { bg: string; border: string; text: string; glow?: string }> = {
  E: { bg: '#6B728030', border: '#6B7280', text: '#9CA3AF' },
  D: { bg: '#22C55E20', border: '#22C55E', text: '#4ADE80' },
  C: { bg: '#3B82F620', border: '#3B82F6', text: '#60A5FA' },
  B: { bg: '#A855F720', border: '#A855F7', text: '#C084FC' },
  A: { bg: '#F9731620', border: '#F97316', text: '#FB923C' },
  S: { bg: '#EF444420', border: '#EF4444', text: '#F87171' },
  SS: { bg: '#F59E0B20', border: '#F59E0B', text: '#FBBF24', glow: '#F59E0B' },
  SSS: { bg: '#F59E0B30', border: '#F59E0B', text: '#FCD34D', glow: '#F59E0B' },
};

const getRankStyle = (rank: string) => {
  return RANK_COLORS[rank.toUpperCase()] ?? RANK_COLORS.E;
};

export const RankBadge = ({ rank, title }: RankBadgeProps) => {
  const colors = getRankStyle(rank);
  const hasGlow = colors.glow != null;

  return (
    <Stack align="center" gap="0.25rem">
      <Box
        w="3.5rem"
        h="3.5rem"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          border: `0.125rem solid ${colors.border}`,
          backgroundColor: colors.bg,
          boxShadow: hasGlow
            ? `0 0 0.75rem ${colors.glow}26, 0 0 1.5rem ${colors.glow}15`
            : 'none',
        }}
        role="img"
        aria-label={`Rank ${rank}`}
      >
        <Text
          ff="Orbitron, sans-serif"
          fz={rank.length > 1 ? '0.875rem' : '1.25rem'}
          fw={900}
          c={colors.text}
          lh={1}
        >
          {rank.toUpperCase()}
        </Text>
      </Box>
      <Text fz="0.75rem" c="var(--phantom-text-secondary)" ta="center">
        {title}
      </Text>
    </Stack>
  );
};
