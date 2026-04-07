/**
 * StreakView Component
 * Displays current/best streak stats and last 30 days activity log
 *
 * @author Subash Karki
 */
import { Badge, Card, Group, Paper, Skeleton, Stack, Text } from '@mantine/core';
import { Flame, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';

import { useHunter } from '../../hooks/useHunter';
import { useSessions } from '../../hooks/useSessions';
import type { SessionData } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DayActivity {
  date: string;
  sessionCount: number;
  totalTokens: number;
}

const buildLast30Days = (sessions: SessionData[]): DayActivity[] => {
  const dayMap = new Map<string, { count: number; tokens: number }>();

  for (const session of sessions) {
    const date = new Date(session.startedAt).toISOString().slice(0, 10);
    const existing = dayMap.get(date) ?? { count: 0, tokens: 0 };
    existing.count += 1;
    existing.tokens += session.inputTokens + session.outputTokens;
    dayMap.set(date, existing);
  }

  const today = new Date();
  const days: DayActivity[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = dayMap.get(dateStr);
    days.push({
      date: dateStr,
      sessionCount: entry?.count ?? 0,
      totalTokens: entry?.tokens ?? 0,
    });
  }

  return days;
};

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StreakView = () => {
  const { profile, loading: hunterLoading } = useHunter();
  const { recent, loading: sessionsLoading } = useSessions();

  const loading = hunterLoading || sessionsLoading;

  const last30Days = useMemo(() => buildLast30Days(recent), [recent]);

  return (
    <Stack gap="lg">
      <ViewHeader title="Streak & Activity" icon={<Flame size={20} />} />

      {/* Streak stat cards */}
      {loading ? (
        <Group gap="md">
          <Skeleton h="6rem" style={{ flex: 1 }} radius="sm" />
          <Skeleton h="6rem" style={{ flex: 1 }} radius="sm" />
        </Group>
      ) : (
        <Group gap="md" grow>
          <Paper
            p="lg"
            bg="var(--phantom-surface-card)"
            radius="sm"
            style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
          >
            <Stack align="center" gap="xs">
              <Flame
                size={24}
                style={{ color: 'var(--phantom-accent-gold)' }}
                aria-hidden="true"
              />
              <Text
                ff="Orbitron, sans-serif"
                fz="1.75rem"
                fw={700}
                c="var(--phantom-accent-gold)"
                aria-label={`Current streak: ${profile?.streakCurrent ?? 0} days`}
              >
                {profile?.streakCurrent ?? 0}
              </Text>
              <Text fz="0.8125rem" c="var(--phantom-text-secondary)">
                Current Streak (days)
              </Text>
            </Stack>
          </Paper>

          <Paper
            p="lg"
            bg="var(--phantom-surface-card)"
            radius="sm"
            style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
          >
            <Stack align="center" gap="xs">
              <TrendingUp
                size={24}
                style={{ color: 'var(--phantom-status-active)' }}
                aria-hidden="true"
              />
              <Text
                ff="Orbitron, sans-serif"
                fz="1.75rem"
                fw={700}
                c="var(--phantom-status-active)"
                aria-label={`Best streak: ${profile?.streakBest ?? 0} days`}
              >
                {profile?.streakBest ?? 0}
              </Text>
              <Text fz="0.8125rem" c="var(--phantom-text-secondary)">
                Best Streak (days)
              </Text>
            </Stack>
          </Paper>
        </Group>
      )}

      {/* Last 30 Days activity */}
      <Stack gap="sm">
        <Text
          ff="Orbitron, sans-serif"
          fz="0.875rem"
          fw={600}
          c="var(--phantom-text-secondary)"
        >
          Last 30 Days
        </Text>

        {loading ? (
          <Stack gap="xs" role="status" aria-label="Loading activity history">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} h="2rem" radius="sm" />
            ))}
          </Stack>
        ) : (
          <Stack gap="0.125rem">
            {last30Days.map((day) => {
              const isActive = day.sessionCount > 0;
              return (
                <Group
                  key={day.date}
                  justify="space-between"
                  wrap="nowrap"
                  px="sm"
                  py="0.375rem"
                  style={{
                    borderRadius: '0.25rem',
                    backgroundColor: isActive
                      ? 'var(--phantom-surface-card)'
                      : 'transparent',
                    opacity: isActive ? 1 : 0.45,
                  }}
                >
                  <Text
                    fz="0.8125rem"
                    c={
                      isActive
                        ? 'var(--phantom-text-primary)'
                        : 'var(--phantom-text-muted)'
                    }
                    fw={isActive ? 500 : 400}
                  >
                    {formatDate(day.date)}
                  </Text>

                  <Group gap="xs" wrap="nowrap">
                    {isActive ? (
                      <>
                        <Badge size="xs" color="blue" variant="light">
                          {day.sessionCount}{' '}
                          {day.sessionCount === 1 ? 'session' : 'sessions'}
                        </Badge>
                        {day.totalTokens > 0 && (
                          <Badge size="xs" color="cyan" variant="light">
                            {formatTokens(day.totalTokens)} tokens
                          </Badge>
                        )}
                      </>
                    ) : (
                      <Text fz="0.75rem" c="var(--phantom-text-muted)">
                        --
                      </Text>
                    )}
                  </Group>
                </Group>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};
