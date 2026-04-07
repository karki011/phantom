/**
 * QuestHistory View
 * Full session history with search and status filtering
 *
 * @author Subash Karki
 */
import {
  Card,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { Scroll, Search, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useSessions } from '../../hooks/useSessions';
import type { SessionData } from '../../lib/api';
import { QuestCard } from '../quest-board/QuestCard';
import { ViewHeader } from '../layout/ViewHeader';

type StatusFilter = 'all' | 'active' | 'completed';

const matchesSearch = (session: SessionData, query: string): boolean => {
  const lowerQuery = query.toLowerCase();
  const name = session.name ?? '';
  const repo = session.repo ?? '';
  const prompt = session.firstPrompt ?? '';
  return (
    name.toLowerCase().includes(lowerQuery) ||
    repo.toLowerCase().includes(lowerQuery) ||
    prompt.toLowerCase().includes(lowerQuery)
  );
};

const matchesStatus = (session: SessionData, filter: StatusFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'active') return session.status === 'active';
  return session.status !== 'active';
};

export const QuestHistory = () => {
  const { recent, loading } = useSessions();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const trimmed = searchQuery.trim();
    return recent.filter((session) => {
      if (trimmed && !matchesSearch(session, trimmed)) return false;
      if (!matchesStatus(session, statusFilter)) return false;
      return true;
    });
  }, [recent, searchQuery, statusFilter]);

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Quest History"
        icon={<Scroll size={20} />}
        subtitle="All sessions"
      />

      {/* Search + Filter Controls */}
      <Stack gap="sm">
        <TextInput
          placeholder="Search sessions..."
          leftSection={<Search size={16} aria-hidden="true" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          aria-label="Search sessions by name, repo, or prompt"
          styles={{
            input: {
              backgroundColor: 'var(--phantom-surface-card)',
              borderColor: 'var(--phantom-border-subtle)',
            },
          }}
        />

        <SegmentedControl
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Completed', value: 'completed' },
          ]}
          size="sm"
          aria-label="Filter sessions by status"
        />
      </Stack>

      {/* Result count */}
      <Text fz="0.8125rem" c="var(--phantom-text-secondary)">
        Showing {filtered.length} of {recent.length} sessions
      </Text>

      {/* Session List */}
      {loading ? (
        <Stack gap="sm" role="status" aria-label="Loading session history">
          <Skeleton h="5rem" radius="sm" />
          <Skeleton h="5rem" radius="sm" />
          <Skeleton h="5rem" radius="sm" />
          <Skeleton h="5rem" radius="sm" />
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
            <Terminal
              size={32}
              style={{ color: 'var(--phantom-text-muted)' }}
              aria-hidden="true"
            />
            <Text fz="0.875rem" c="var(--phantom-text-muted)">
              {recent.length === 0
                ? 'No sessions recorded yet.'
                : 'No sessions match your search.'}
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {filtered.map((session) => (
            <QuestCard key={session.id} session={session} />
          ))}
        </Stack>
      )}
    </Stack>
  );
};
