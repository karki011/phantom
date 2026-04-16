/**
 * RunningServersCard — shows running processes for the active worktree
 * @author Subash Karki
 */
import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { ExternalLink, Radio, Square, Wifi } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import type { RunningServer } from '../lib/api';
import { getRunningServers, stopServer } from '../lib/api';

const formatUptime = (startedAt: number): string => {
  const ms = Date.now() - startedAt;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
};

interface RunningServersCardProps {
  worktreeId: string;
}

export const RunningServersCard = memo(function RunningServersCard({ worktreeId }: RunningServersCardProps) {
  const [servers, setServers] = useState<RunningServer[]>([]);
  const [, setTick] = useState(0); // trigger re-render for uptime display

  const refresh = useCallback(() => {
    getRunningServers(worktreeId).then(setServers).catch(() => {});
  }, [worktreeId]);

  // Fetch on mount + SSE events for start/stop — no API polling
  useEffect(() => {
    refresh();

    const onServerChange = () => refresh();
    window.addEventListener('phantom:server-change', onServerChange);

    return () => {
      window.removeEventListener('phantom:server-change', onServerChange);
    };
  }, [refresh]);

  // Local timer to update uptime display every 10s (no API call)
  useEffect(() => {
    if (servers.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, [servers.length]);

  const handleStop = useCallback(async (termId: string) => {
    await stopServer(termId);
    refresh();
  }, [refresh]);

  const handleOpen = useCallback((port: number) => {
    window.open(`http://localhost:${port}`, '_blank');
  }, []);

  if (servers.length === 0) return null;

  return (
    <Paper
      p="md"
      bg="var(--phantom-surface-card)"
      radius="md"
      style={{ border: '1px solid var(--phantom-border-subtle)' }}
    >
      <Group gap="xs" mb="sm">
        <Wifi size={14} style={{ color: 'var(--phantom-status-active)' }} />
        <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">
          Running Servers
        </Text>
        <Badge
          size="xs"
          variant="light"
          color="green"
          radius="sm"
        >
          {servers.length}
        </Badge>
      </Group>
      <Stack gap={4}>
        {servers.map((server) => (
          <Group
            key={server.termId}
            gap="sm"
            wrap="nowrap"
            py={4}
            px={6}
            style={{
              borderRadius: 4,
              backgroundColor: 'var(--phantom-surface-elevated)',
            }}
          >
            <Radio size={8} style={{ color: 'var(--phantom-status-active)', flexShrink: 0 }} />
            <Text fz="0.75rem" fw={500} c="var(--phantom-text-primary)" style={{ minWidth: 50 }}>
              {server.recipeLabel}
            </Text>
            {server.port && (
              <Badge size="xs" variant="outline" color="blue" radius="sm">
                :{server.port}
              </Badge>
            )}
            <Text fz="0.65rem" c="var(--phantom-text-muted)" style={{ flex: 1 }}>
              {formatUptime(server.startedAt)}
            </Text>
            {server.port && (
              <Tooltip label="Open in browser" position="top">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  onClick={() => handleOpen(server.port!)}
                  aria-label="Open in browser"
                >
                  <ExternalLink size={12} style={{ color: 'var(--phantom-text-muted)' }} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="Stop server" position="top">
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => handleStop(server.termId)}
                aria-label="Stop server"
              >
                <Square size={10} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
});
