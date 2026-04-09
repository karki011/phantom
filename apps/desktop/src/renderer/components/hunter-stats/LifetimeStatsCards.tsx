/**
 * LifetimeStatsCards -- Grid of stat cards showing lifetime analytics
 * Displays key metrics like total sessions, tokens, cost, streaks, etc.
 *
 * @author Subash Karki
 */
import { Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  Activity,
  BarChart3,
  Calendar,
  Clock,
  Coins,
  Crown,
  Flame,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface LifetimeStats {
  totalSessions: number;
  totalTokens: number;
  totalCost: number;
  favoriteModel: string;
  longestSession: number;
  currentStreak: number;
  bestStreak: number;
  activeDays: number;
  peakHour: number;
  totalMessages: number;
  totalToolCalls: number;
}

export interface LifetimeStatsCardsProps {
  stats: LifetimeStats | null;
}

interface StatCardDef {
  key: string;
  icon: ReactNode;
  color: string;
  label: string;
  getValue: (s: LifetimeStats) => string;
  getSublabel?: (s: LifetimeStats) => string | undefined;
}

function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function formatCost(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars >= 1000) return `$${formatCompactNumber(Math.round(dollars))}`;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(4)}`;
}

const STAT_CARDS: StatCardDef[] = [
  {
    key: 'sessions',
    icon: <Activity size={20} />,
    color: 'cyan',
    label: 'Total Sessions',
    getValue: (s) => s.totalSessions.toLocaleString(),
  },
  {
    key: 'tokens',
    icon: <Zap size={20} />,
    color: 'violet',
    label: 'Total Tokens',
    getValue: (s) => formatCompactNumber(s.totalTokens),
  },
  {
    key: 'cost',
    icon: <Coins size={20} />,
    color: 'yellow',
    label: 'Total Cost',
    getValue: (s) => formatCost(s.totalCost),
  },
  {
    key: 'model',
    icon: <Crown size={20} />,
    color: 'orange',
    label: 'Favorite Model',
    getValue: (s) => s.favoriteModel || '--',
  },
  {
    key: 'longest',
    icon: <Clock size={20} />,
    color: 'teal',
    label: 'Longest Session',
    getValue: (s) => formatDuration(s.longestSession),
  },
  {
    key: 'streak',
    icon: <Flame size={20} />,
    color: 'red',
    label: 'Current Streak',
    getValue: (s) => `${s.currentStreak}d`,
    getSublabel: (s) => `best: ${s.bestStreak}d`,
  },
  {
    key: 'active',
    icon: <Calendar size={20} />,
    color: 'green',
    label: 'Active Days',
    getValue: (s) => s.activeDays.toLocaleString(),
  },
  {
    key: 'peak',
    icon: <Clock size={20} />,
    color: 'indigo',
    label: 'Peak Hour',
    getValue: (s) => formatHour(s.peakHour),
  },
];

const StatCard = ({
  icon,
  color,
  label,
  value,
  sublabel,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  value: string;
  sublabel?: string;
}) => (
  <Paper
    p="md"
    bg="var(--phantom-surface-card)"
    radius="md"
    style={{
      border: '1px solid var(--phantom-border-subtle)',
      transition: 'border-color 200ms ease, box-shadow 200ms ease',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = 'var(--phantom-accent-glow)';
      e.currentTarget.style.boxShadow = '0 0 12px rgba(0,200,255,0.15)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = 'var(--phantom-border-subtle)';
      e.currentTarget.style.boxShadow = 'none';
    }}
  >
    <Stack gap="xs">
      <Group gap="xs">
        <ThemeIcon size={32} variant="light" color={color} radius="md">
          {icon}
        </ThemeIcon>
        <Text fz="xs" fw={500} c="var(--phantom-text-secondary)" tt="uppercase">
          {label}
        </Text>
      </Group>
      <Text
        ff="'Orbitron', sans-serif"
        fz="1.5rem"
        fw={700}
        c="var(--phantom-text-primary)"
        lh={1.2}
      >
        {value}
      </Text>
      {sublabel && (
        <Text fz="xs" c="var(--phantom-text-muted)">
          {sublabel}
        </Text>
      )}
    </Stack>
  </Paper>
);

export const LifetimeStatsCards = ({ stats }: LifetimeStatsCardsProps) => {
  if (!stats) {
    return (
      <Paper
        p="md"
        bg="var(--phantom-surface-card)"
        radius="md"
        style={{ border: '1px solid var(--phantom-border-subtle)' }}
      >
        <Stack gap="md">
          <Group gap="xs">
            <BarChart3 size={18} color="var(--phantom-accent-glow)" />
            <Title order={4} c="var(--phantom-text-primary)">
              Lifetime Stats
            </Title>
          </Group>
          <Text fz="sm" c="var(--phantom-text-muted)" ta="center" py="xl">
            No stats available yet. Start a session to begin tracking.
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <Group gap="xs">
        <BarChart3 size={18} color="var(--phantom-accent-glow)" />
        <Title order={4} c="var(--phantom-text-primary)">
          Lifetime Stats
        </Title>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }}>
        {STAT_CARDS.map((card) => (
          <StatCard
            key={card.key}
            icon={card.icon}
            color={card.color}
            label={card.label}
            value={card.getValue(stats)}
            sublabel={card.getSublabel?.(stats)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
};
