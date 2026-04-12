/**
 * TasksCard — shows live Claude task progress for the active worktree.
 * Polls tasks from active sessions whose cwd matches the worktree path.
 * @author Subash Karki
 */
import { Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { CheckCircle, Circle, Clock, Loader2, ListChecks, RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { getTasksByCwd, type TaskData } from '../lib/api';

const STATUS_ICON: Record<string, { icon: typeof Circle; color: string }> = {
  pending: { icon: Circle, color: 'var(--phantom-text-muted)' },
  in_progress: { icon: Loader2, color: 'var(--phantom-accent-cyan)' },
  completed: { icon: CheckCircle, color: 'var(--phantom-status-success, #22c55e)' },
};

const formatAge = (ts: number | null): string => {
  if (!ts) return '';
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
};

export const TasksCard = memo(function TasksCard({ cwd }: { cwd: string }) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(false);
  const lastHash = useRef('');

  const refresh = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true);
    getTasksByCwd(cwd)
      .then((data) => {
        const hash = (Array.isArray(data) ? data : []).map((t) => `${t.id}:${t.status}:${t.updatedAt}`).join(',');
        if (hash !== lastHash.current) {
          lastHash.current = hash;
          setTasks(data);
        }
      })
      .catch(() => {
        if (lastHash.current !== '') {
          lastHash.current = '';
          setTasks([]);
        }
      })
      .finally(() => { if (showLoading) setLoading(false); });
  }, [cwd]);

  useEffect(() => {
    refresh(true);
    const interval = setInterval(() => refresh(), 5_000); // poll every 5s for live task updates
    return () => clearInterval(interval);
  }, [refresh]);

  if (tasks.length === 0) return null;

  const completed = tasks.filter((t) => t.status === 'completed').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;

  return (
    <Paper
      p="md"
      bg="var(--phantom-surface-card)"
      radius="md"
      style={{ border: '1px solid var(--phantom-border-subtle)' }}
    >
      <Group gap="xs" mb="sm">
        <ListChecks size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
        <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Tasks</Text>
        <Text fz="xs" c="var(--phantom-text-muted)">{completed}/{tasks.length}</Text>
        {inProgress > 0 && (
          <Text fz="0.6rem" c="var(--phantom-accent-cyan)">
            {inProgress} running
          </Text>
        )}
        <Tooltip label="Refresh tasks" position="top" withArrow fz="xs">
          <RefreshCw
            size={11}
            style={{ color: 'var(--phantom-text-muted)', cursor: 'pointer', marginLeft: 'auto', animation: loading ? 'spin 1s linear infinite' : 'none' }}
            onClick={() => refresh(true)}
          />
        </Tooltip>
      </Group>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 2, backgroundColor: 'var(--phantom-surface-elevated)', overflow: 'hidden', marginBottom: 8 }}>
        <div style={{
          height: '100%',
          width: `${tasks.length > 0 ? (completed / tasks.length) * 100 : 0}%`,
          backgroundColor: 'var(--phantom-status-success, #22c55e)',
          borderRadius: 2,
          transition: 'width 300ms ease',
        }} />
      </div>

      <Stack gap={3} style={{ maxHeight: 200, overflowY: 'auto' }}>
        {tasks.map((task) => {
          const cfg = STATUS_ICON[task.status ?? 'pending'] ?? STATUS_ICON.pending;
          const Icon = cfg.icon;
          const isRunning = task.status === 'in_progress';

          return (
            <Group key={task.id} gap={6} wrap="nowrap" py={2} px={4}>
              <Icon
                size={12}
                style={{
                  color: cfg.color,
                  flexShrink: 0,
                  animation: isRunning ? 'spin 2s linear infinite' : 'none',
                }}
              />
              <Text
                fz="0.73rem"
                c={task.status === 'completed' ? 'var(--phantom-text-muted)' : 'var(--phantom-text-primary)'}
                truncate
                style={{
                  flex: 1,
                  textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                }}
              >
                {isRunning && task.activeForm ? task.activeForm : task.subject ?? `Task #${task.taskNum}`}
              </Text>
              {task.updatedAt && (
                <Text fz="0.6rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0 }}>
                  {formatAge(task.updatedAt)}
                </Text>
              )}
            </Group>
          );
        })}
      </Stack>
    </Paper>
  );
});
