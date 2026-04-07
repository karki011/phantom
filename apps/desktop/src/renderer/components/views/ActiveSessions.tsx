/**
 * ActiveSessions View
 * Full-width list of currently running Claude sessions
 *
 * @author Subash Karki
 */
import { Card, Skeleton, Stack, Text } from '@mantine/core';
import { Activity, Terminal } from 'lucide-react';

import { useSessions } from '../../hooks/useSessions';
import { QuestCard } from '../quest-board/QuestCard';
import { ViewHeader } from '../layout/ViewHeader';

export const ActiveSessions = () => {
  const { active, loading } = useSessions();

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Active Sessions"
        icon={<Activity size={20} />}
        subtitle={`${active.length} currently running`}
      />

      {loading ? (
        <Stack gap="sm" role="status" aria-label="Loading active sessions">
          <Skeleton h="8rem" radius="sm" />
          <Skeleton h="8rem" radius="sm" />
          <Skeleton h="8rem" radius="sm" />
        </Stack>
      ) : active.length === 0 ? (
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
              No active sessions. Start a Claude session to begin.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="md">
          {active.map((session) => (
            <QuestCard key={session.id} session={session} defaultExpanded />
          ))}
        </Stack>
      )}
    </Stack>
  );
};
