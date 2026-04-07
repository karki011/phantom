/**
 * DailyQuestsView Component
 * Full-width daily quest detail view with progress cards and completion rate
 *
 * @author Subash Karki
 */
import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Progress,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { CheckCircle, RefreshCw, Target } from 'lucide-react';

import { useQuests } from '../../hooks/useQuests';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DailyQuestsView = () => {
  const { quests, loading, refresh } = useQuests();

  const completedCount = quests.filter((q) => q.completed > 0).length;

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Daily Quests"
        icon={<Target size={20} />}
        subtitle="Today's challenges"
      />

      {/* Today's Quests section */}
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text
            ff="Orbitron, sans-serif"
            fz="0.875rem"
            fw={600}
            c="var(--phantom-text-secondary)"
          >
            Today&apos;s Quests
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => refresh()}
            aria-label="Refresh daily quests"
            size="sm"
          >
            <RefreshCw size={14} aria-hidden="true" />
          </ActionIcon>
        </Group>

        {loading ? (
          <Stack gap="sm" role="status" aria-label="Loading daily quests">
            <Skeleton h="7rem" radius="sm" />
            <Skeleton h="7rem" radius="sm" />
            <Skeleton h="7rem" radius="sm" />
          </Stack>
        ) : quests.length === 0 ? (
          <Card
            p="xl"
            bg="var(--phantom-surface-card)"
            style={{
              border: '0.0625rem solid var(--phantom-border-subtle)',
              textAlign: 'center',
            }}
          >
            <Stack align="center" gap="sm">
              <Target
                size={32}
                style={{ color: 'var(--phantom-text-muted)' }}
                aria-hidden="true"
              />
              <Text fz="0.875rem" c="var(--phantom-text-muted)">
                No daily quests available. Check back later.
              </Text>
            </Stack>
          </Card>
        ) : (
          <Stack gap="sm">
            {quests.map((quest) => {
              const isComplete = quest.completed > 0;
              const progressPercent =
                quest.target > 0
                  ? Math.min((quest.progress / quest.target) * 100, 100)
                  : 0;

              return (
                <Card
                  key={quest.id}
                  p="md"
                  bg="var(--phantom-surface-card)"
                  style={{
                    border: isComplete
                      ? '0.0625rem solid var(--phantom-status-active)'
                      : '0.0625rem solid var(--phantom-border-subtle)',
                    boxShadow: isComplete
                      ? '0 0 0.5rem rgba(76, 175, 80, 0.1)'
                      : 'none',
                  }}
                  aria-label={`Quest: ${quest.label}. ${quest.progress} of ${quest.target}${isComplete ? '. Completed.' : ''}`}
                >
                  <Stack gap="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <Text
                        fz="0.9375rem"
                        fw={600}
                        c="var(--phantom-text-primary)"
                        style={{ flex: 1 }}
                        truncate="end"
                      >
                        {quest.label}
                      </Text>
                      {isComplete && (
                        <ThemeIcon
                          size="md"
                          variant="transparent"
                          color="green"
                          aria-label="Completed"
                        >
                          <CheckCircle size={18} aria-hidden="true" />
                        </ThemeIcon>
                      )}
                    </Group>

                    <Progress
                      value={progressPercent}
                      color={isComplete ? 'green' : 'blue'}
                      size="md"
                      radius="sm"
                      role="progressbar"
                      aria-valuenow={quest.progress}
                      aria-valuemin={0}
                      aria-valuemax={quest.target}
                      aria-label={`Progress: ${quest.progress} of ${quest.target}`}
                    />

                    <Group justify="space-between">
                      <Text fz="0.8125rem" c="var(--phantom-text-muted)">
                        {quest.progress} / {quest.target}
                      </Text>
                      <Badge size="sm" color="yellow" variant="light">
                        +{quest.xpReward} XP
                      </Badge>
                    </Group>

                    <Text fz="0.75rem" c="var(--phantom-text-muted)">
                      Type: {quest.questType}
                    </Text>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>

      {/* Quest Stats */}
      <Stack gap="sm">
        <Text
          ff="Orbitron, sans-serif"
          fz="0.875rem"
          fw={600}
          c="var(--phantom-text-secondary)"
        >
          Quest Stats
        </Text>

        <Card
          p="md"
          bg="var(--phantom-surface-card)"
          style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Text fz="0.875rem" c="var(--phantom-text-primary)">
              Today&apos;s completion rate
            </Text>
            <Text
              ff="Orbitron, sans-serif"
              fz="1rem"
              fw={700}
              c={
                completedCount === quests.length && quests.length > 0
                  ? 'var(--phantom-status-active)'
                  : 'var(--phantom-text-secondary)'
              }
            >
              {completedCount} of {quests.length} completed
            </Text>
          </Group>
        </Card>
      </Stack>
    </Stack>
  );
};
