/**
 * TaskHistory View
 * Flat list of all tasks across sessions with search and status filtering
 *
 * @author Subash Karki
 */
import {
  Badge,
  Card,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import {
  CheckCircle,
  CheckSquare,
  Circle,
  ClipboardList,
  Loader,
  Search,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { useSessions } from '../../hooks/useSessions';
import type { SessionData, TaskData } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskStatusFilter = 'all' | 'completed' | 'in_progress' | 'pending';

interface FlatTask extends TaskData {
  sessionName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Circle; color: string; label: string }
> = {
  completed: { icon: CheckCircle, color: 'green', label: 'Completed' },
  in_progress: { icon: Loader, color: 'orange', label: 'In Progress' },
  pending: { icon: Circle, color: 'gray', label: 'Pending' },
  cancelled: { icon: X, color: 'red', label: 'Cancelled' },
};

const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

const flattenTasks = (sessions: SessionData[]): FlatTask[] => {
  const flat: FlatTask[] = [];
  for (const session of sessions) {
    const sessionName =
      session.name ?? session.repo ?? session.id.slice(0, 8);
    for (const task of session.tasks ?? []) {
      flat.push({ ...task, sessionName });
    }
  }
  flat.sort((a, b) => b.updatedAt - a.updatedAt);
  return flat;
};

const formatRelativeTime = (timestamp: number): string => {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TaskHistory = () => {
  const { recent, loading } = useSessions();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all');

  const allTasks = useMemo(() => flattenTasks(recent), [recent]);

  const filtered = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    return allTasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (trimmed && !task.subject.toLowerCase().includes(trimmed)) return false;
      return true;
    });
  }, [allTasks, searchQuery, statusFilter]);

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Task History"
        icon={<CheckSquare size={20} />}
        subtitle="All tasks across sessions"
      />

      {/* Search + filter */}
      <Stack gap="sm">
        <TextInput
          placeholder="Search tasks by subject..."
          leftSection={<Search size={16} aria-hidden="true" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          aria-label="Search tasks by subject"
          styles={{
            input: {
              backgroundColor: 'var(--phantom-surface-card)',
              borderColor: 'var(--phantom-border-subtle)',
            },
          }}
        />

        <SegmentedControl
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as TaskStatusFilter)}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Completed', value: 'completed' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Pending', value: 'pending' },
          ]}
          size="sm"
          aria-label="Filter tasks by status"
        />
      </Stack>

      {/* Count */}
      <Text fz="0.8125rem" c="var(--phantom-text-secondary)">
        {filtered.length} task{filtered.length !== 1 ? 's' : ''}
      </Text>

      {/* Task list */}
      {loading ? (
        <Stack gap="sm" role="status" aria-label="Loading task history">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} h="3.5rem" radius="sm" />
          ))}
        </Stack>
      ) : filtered.length === 0 ? (
        <Card
          p="xl"
          bg="var(--phantom-surface-card)"
          style={{
            border: '0.0625rem solid var(--phantom-border-subtle)',
            textAlign: 'center',
          }}
        >
          <Stack align="center" gap="sm">
            <ClipboardList
              size={32}
              style={{ color: 'var(--phantom-text-muted)' }}
              aria-hidden="true"
            />
            <Text fz="0.875rem" c="var(--phantom-text-muted)">
              {allTasks.length === 0
                ? 'No tasks recorded yet.'
                : 'No tasks match your filters.'}
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xs">
          {filtered.map((task) => {
            const config = getStatusConfig(task.status);
            const StatusIcon = config.icon;
            return (
              <Group
                key={task.id}
                gap="sm"
                wrap="nowrap"
                px="sm"
                py="0.5rem"
                style={{
                  borderRadius: '0.25rem',
                  backgroundColor: 'var(--phantom-surface-card)',
                  border: '0.0625rem solid var(--phantom-border-subtle)',
                }}
              >
                <ThemeIcon
                  size="sm"
                  variant="transparent"
                  color={config.color}
                  aria-label={config.label}
                >
                  <StatusIcon size={14} aria-hidden="true" />
                </ThemeIcon>

                {task.crew != null && (
                  <Badge
                    size="xs"
                    variant="light"
                    color="grape"
                    style={{ flexShrink: 0 }}
                  >
                    {task.crew}
                  </Badge>
                )}

                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    fz="0.8125rem"
                    c="var(--phantom-text-primary)"
                    truncate="end"
                  >
                    {task.subject}
                  </Text>
                  <Text fz="0.6875rem" c="var(--phantom-text-muted)" truncate="end">
                    {task.sessionName}
                  </Text>
                </Stack>

                <Badge
                  size="xs"
                  variant="light"
                  color={config.color}
                  style={{ flexShrink: 0 }}
                >
                  {config.label}
                </Badge>

                <Text
                  fz="0.6875rem"
                  c="var(--phantom-text-muted)"
                  style={{ flexShrink: 0 }}
                >
                  {formatRelativeTime(task.updatedAt)}
                </Text>
              </Group>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
};
