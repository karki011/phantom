/**
 * ActiveSessions View
 * Live session cards with model badge, duration, context bar, and action buttons
 * @author Subash Karki
 */
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Progress,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import { Activity, Clock, Eye, Play, Square, Terminal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { usePaneStore } from '@phantom-os/panes';

import { viewingSessionIdAtom } from '../../atoms/sessionViewer';
import { activeWorktreeAtom } from '../../atoms/worktrees';
import { useSessions } from '../../hooks/useSessions';
import { useRouter } from '../../hooks/useRouter';
import { stopSession } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

const MODEL_COLORS: Record<string, string> = {
  opus: '#a855f7',
  sonnet: '#3b82f6',
  haiku: '#22c55e',
};

const getModelColor = (model: string | null): string => {
  if (!model) return '#71717a';
  const key = Object.keys(MODEL_COLORS).find((k) => model.toLowerCase().includes(k));
  return key ? MODEL_COLORS[key] : '#71717a';
};

const getModelLabel = (model: string | null): string => {
  if (!model) return 'unknown';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model.split('-').pop() ?? model;
};

const formatDuration = (startedAt: number): string => {
  const ms = Date.now() - startedAt;
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(min / 60);
  if (hr > 0) return `${hr}h ${min % 60}m`;
  return `${min}m`;
};

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

export const ActiveSessions = () => {
  const { active, loading, refresh } = useSessions();
  const { navigate } = useRouter();
  const setViewingSession = useSetAtom(viewingSessionIdAtom);
  const store = usePaneStore();
  const worktree = useAtomValue(activeWorktreeAtom);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  // Live timer update every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleView = useCallback(
    (sessionId: string) => {
      setViewingSession(sessionId);
      navigate('session-viewer');
    },
    [setViewingSession, navigate],
  );

  const handleStop = useCallback(
    async (sessionId: string) => {
      setStoppingId(sessionId);
      try {
        await stopSession(sessionId);
        refresh();
      } catch {
        // Failed to stop
      } finally {
        setStoppingId(null);
      }
    },
    [refresh],
  );

  const handleRelaunch = useCallback(
    (cwd: string | null) => {
      const targetCwd = cwd || worktree?.worktreePath;
      if (!targetCwd) return;
      store.addPaneAsTab(
        'terminal',
        { cwd: targetCwd, initialCommand: 'claude --dangerously-skip-permissions' } as Record<string, unknown>,
        'Claude',
      );
    },
    [store, worktree],
  );

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Active Sessions"
        icon={<Activity size={20} />}
        subtitle={`${active.length} currently running`}
      />

      {loading ? (
        <Stack gap="sm">
          <Skeleton h="7rem" radius="sm" />
          <Skeleton h="7rem" radius="sm" />
        </Stack>
      ) : active.length === 0 ? (
        <Card
          p="xl"
          bg="var(--phantom-surface-card)"
          style={{ border: '1px solid var(--phantom-border-subtle)', textAlign: 'center' }}
        >
          <Stack align="center" gap="md">
            <Terminal size={32} style={{ color: 'var(--phantom-text-muted)' }} />
            <Text fz="sm" c="var(--phantom-text-muted)">
              No active sessions
            </Text>
            <Button
              variant="light"
              size="sm"
              leftSection={<Play size={14} />}
              onClick={() => handleRelaunch(null)}
            >
              Launch Claude
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="md">
          {active.map((session) => {
            const tokens = session.inputTokens + session.outputTokens;
            const ctxPct = session.contextUsedPct ?? 0;

            return (
              <Card
                key={session.id}
                p="md"
                bg="var(--phantom-surface-card)"
                style={{ border: '1px solid var(--phantom-border-subtle)' }}
              >
                <Stack gap="sm">
                  {/* Top row: model badge + repo + duration */}
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <Badge
                        size="sm"
                        variant="dot"
                        style={{ '--badge-dot-color': getModelColor(session.model) } as React.CSSProperties}
                      >
                        {getModelLabel(session.model)}
                      </Badge>
                      <Text fz="sm" fw={600} c="var(--phantom-text-primary)" truncate>
                        {session.repo ?? session.name ?? session.id.slice(0, 8)}
                      </Text>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Clock size={12} style={{ color: 'var(--phantom-text-muted)' }} />
                      <Text fz="xs" c="var(--phantom-text-muted)" ff="'Orbitron', sans-serif">
                        {formatDuration(session.startedAt)}
                      </Text>
                    </Group>
                  </Group>

                  {/* Context usage bar */}
                  <div>
                    <Group justify="space-between" mb={4}>
                      <Text fz="xs" c="var(--phantom-text-muted)">Context</Text>
                      <Text fz="xs" c="var(--phantom-text-muted)">{ctxPct}%</Text>
                    </Group>
                    <Progress
                      value={ctxPct}
                      size="xs"
                      radius="xl"
                      color={ctxPct > 80 ? 'var(--phantom-status-danger)' : ctxPct > 50 ? 'var(--phantom-status-warning)' : 'var(--phantom-accent-glow)'}
                      bg="var(--phantom-surface-elevated)"
                    />
                  </div>

                  {/* Stats row */}
                  <Group gap="lg">
                    <Text fz="xs" c="var(--phantom-text-secondary)">
                      {formatTokens(tokens)} tokens
                    </Text>
                    <Text fz="xs" c="var(--phantom-text-secondary)">
                      {session.taskCount ?? 0} tasks
                    </Text>
                    {session.firstPrompt && (
                      <Text fz="xs" c="var(--phantom-text-muted)" truncate style={{ flex: 1 }}>
                        {session.firstPrompt}
                      </Text>
                    )}
                  </Group>

                  {/* Action buttons */}
                  <Group gap="xs" justify="flex-end">
                    <Tooltip label="View conversation">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={() => handleView(session.id)}
                        aria-label="View session"
                      >
                        <Eye size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Stop session">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        loading={stoppingId === session.id}
                        onClick={() => handleStop(session.id)}
                        aria-label="Stop session"
                      >
                        <Square size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Re-launch in new tab">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={() => handleRelaunch(session.cwd)}
                        aria-label="Re-launch session"
                      >
                        <Play size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
};
