/**
 * TaskRow Component
 * Terminal-style task line showing status prefix, crew, and subject
 *
 * @author Subash Karki
 */
import { Group, Text } from '@mantine/core';

import type { TaskData } from '../../lib/api';

interface TaskRowProps {
  task: TaskData;
}

const STATUS_PREFIX: Record<string, { symbol: string; color: string }> = {
  completed:   { symbol: '✓', color: 'var(--phantom-status-active)' },
  in_progress: { symbol: '▸', color: 'var(--phantom-status-warning)' },
  pending:     { symbol: '○', color: 'var(--phantom-text-muted)' },
  cancelled:   { symbol: '✗', color: 'var(--phantom-status-danger)' },
};

export const TaskRow = ({ task }: TaskRowProps) => {
  const prefix = STATUS_PREFIX[task.status] ?? STATUS_PREFIX.pending;

  return (
    <Group
      gap="0.375rem"
      wrap="nowrap"
      py="0.125rem"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      <Text
        fz="0.8125rem"
        fw={700}
        c={prefix.color}
        style={{ flexShrink: 0, width: '0.875rem', textAlign: 'center' }}
        aria-label={task.status}
      >
        {prefix.symbol}
      </Text>

      {task.crew != null && (
        <Text fz="0.8125rem" fw={600} c="var(--phantom-accent-glow)" style={{ flexShrink: 0 }}>
          [{task.crew}]
        </Text>
      )}

      <Text
        fz="0.8125rem"
        c={task.status === 'completed' ? 'var(--phantom-text-muted)' : 'var(--phantom-text-primary)'}
        truncate="end"
        style={{
          flex: 1,
          minWidth: 0,
          textDecoration: task.status === 'cancelled' ? 'line-through' : 'none',
        }}
      >
        {task.subject}
      </Text>

      {task.status === 'in_progress' && task.activeForm != null && (
        <Text fz="0.5625rem" c="var(--phantom-text-muted)" truncate="end" style={{ maxWidth: '12rem', flexShrink: 1 }}>
          {task.activeForm}
        </Text>
      )}
    </Group>
  );
};
