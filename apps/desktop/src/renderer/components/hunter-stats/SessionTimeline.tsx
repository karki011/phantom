/**
 * SessionTimeline -- Scrollable list of recent sessions with duration bars
 * Shows model badge, first prompt, duration, tokens, cost, and a relative progress bar.
 *
 * @author Subash Karki
 */
import { useMemo } from 'react';
import { Badge, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core';
import { History } from 'lucide-react';

interface TimelineSession {
  id: string;
  model: string | null;
  startedAt: number;
  endedAt: number | null;
  duration: number;
  tokens: number;
  cost: number;
  taskCount: number;
  firstPrompt: string | null;
}

export interface SessionTimelineProps {
  sessions: TimelineSession[];
}

const MODEL_COLORS: Record<string, string> = {
  opus: '#a855f7',
  sonnet: '#3b82f6',
  haiku: '#22c55e',
};

function getModelColor(model: string | null): string {
  if (!model) return '#6b7280';
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#6b7280';
}

function getModelLabel(model: string | null): string {
  if (!model) return 'Unknown';
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return model.length > 12 ? `${model.slice(0, 12)}...` : model;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  if (dollars >= 0.01) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(4)}`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHrs = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

const MAX_DISPLAY = 20;

export const SessionTimeline = ({ sessions }: SessionTimelineProps) => {
  const displaySessions = useMemo(() => sessions.slice(0, MAX_DISPLAY), [sessions]);

  const maxDuration = useMemo(
    () => Math.max(1, ...displaySessions.map((s) => s.duration)),
    [displaySessions],
  );

  if (displaySessions.length === 0) {
    return (
      <Paper
        p="md"
        bg="var(--phantom-surface-card)"
        radius="md"
        style={{ border: '1px solid var(--phantom-border-subtle)' }}
      >
        <Stack gap="md">
          <Group gap="xs">
            <History size={18} color="var(--phantom-accent-glow)" />
            <Title order={4} c="var(--phantom-text-primary)">
              Recent Sessions
            </Title>
          </Group>
          <Text fz="sm" c="var(--phantom-text-muted)" ta="center" py="xl">
            No sessions recorded yet. Start coding to see your timeline.
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <Group gap="xs">
        <History size={18} color="var(--phantom-accent-glow)" />
        <Title order={4} c="var(--phantom-text-primary)">
          Recent Sessions
        </Title>
      </Group>

      <Stack
        gap="sm"
        style={{
          maxHeight: 400,
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {displaySessions.map((session) => {
          const modelColor = getModelColor(session.model);
          const durationPct = (session.duration / maxDuration) * 100;

          return (
            <Paper
              key={session.id}
              p="sm"
              bg="var(--phantom-surface-card)"
              radius="md"
              style={{
                border: '1px solid var(--phantom-border-subtle)',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--phantom-accent-glow)';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(0,200,255,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--phantom-border-subtle)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  {/* Left: model badge */}
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <Badge
                      size="sm"
                      variant="dot"
                      color={modelColor}
                      styles={{
                        root: {
                          flexShrink: 0,
                          borderColor: modelColor,
                          color: modelColor,
                        },
                      }}
                    >
                      {getModelLabel(session.model)}
                    </Badge>

                    {/* Center: first prompt */}
                    <Text
                      fz="sm"
                      c="var(--phantom-text-primary)"
                      truncate="end"
                      style={{ minWidth: 0, flex: 1 }}
                    >
                      {session.firstPrompt || 'Untitled Session'}
                    </Text>
                  </Group>

                  {/* Right: stats */}
                  <Group gap="md" wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Text fz="xs" c="var(--phantom-text-muted)">
                      {formatRelativeTime(session.startedAt)}
                    </Text>
                    <Text fz="xs" fw={600} c="var(--phantom-text-secondary)" ff="'Orbitron', sans-serif">
                      {formatDuration(session.duration)}
                    </Text>
                    <Text fz="xs" c="var(--phantom-text-muted)">
                      {formatTokens(session.tokens)}
                    </Text>
                    <Text fz="xs" c="var(--phantom-accent-gold)" ff="'Orbitron', sans-serif">
                      {formatCost(session.cost)}
                    </Text>
                  </Group>
                </Group>

                {/* Duration bar */}
                <Progress
                  value={durationPct}
                  color={modelColor}
                  size={4}
                  bg="var(--phantom-surface-elevated)"
                  radius="xl"
                />
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
};
