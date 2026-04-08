/**
 * QuestCard Component
 * Terminal-style session card with context usage, tasks as terminal output
 *
 * @author Subash Karki
 */
import {
  Badge,
  Box,
  Group,
  Progress,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Brain, Terminal } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { type MessageData, type SessionData, type TaskData, getSessionMessages, getSessionTasks } from '../../lib/api';
import { TaskRow } from './TaskRow';

interface QuestCardProps {
  session: SessionData;
  defaultExpanded?: boolean;
}

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  if (dollars >= 0.01) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(3)}`;
};

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
};

export const QuestCard = ({ session, defaultExpanded = false }: QuestCardProps) => {
  const [expanded, { toggle }] = useDisclosure(defaultExpanded);

  // Fetch tasks on-demand when card is expanded
  const [tasks, setTasks] = useState<TaskData[]>(session.tasks ?? []);
  useEffect(() => {
    if (expanded && tasks.length === 0) {
      getSessionTasks(session.id).then(setTasks).catch(() => {});
    }
  }, [expanded, session.id]);

  const isActive = session.status === 'active';
  const totalTokens = session.inputTokens + session.outputTokens;
  // Use live context % from server (model-aware); fall back to 0 if not yet computed
  const contextPercent = session.contextUsedPct ?? 0;
  const progressPercent =
    session.taskCount > 0
      ? (session.completedTasks / session.taskCount) * 100
      : 0;

  const firstTaskName = session.tasks?.[0]?.subject ?? null;
  const displayName = session.name ?? session.repo ?? firstTaskName ?? session.id.slice(0, 8);
  const relativeTime = useMemo(() => formatRelativeTime(session.startedAt), [session.startedAt]);

  const [messages, setMessages] = useState<MessageData[] | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const loadMessages = async () => {
    setLoadingMsgs(true);
    try {
      const msgs = await getSessionMessages(session.id);
      setMessages(msgs);
    } finally {
      setLoadingMsgs(false);
    }
  };

  const promptSymbol = expanded ? '▾' : '▸';

  return (
    <Box
      style={{
        borderRadius: '0.5rem',
        overflow: 'hidden',
        border: `0.0625rem solid ${isActive ? 'var(--phantom-border-subtle)' : 'var(--phantom-border-subtle)'}`,
        boxShadow: isActive ? '0 0 1rem rgba(129, 140, 248, 0.08)' : 'none',
      }}
    >
      {/* Terminal title bar */}
      <Group
        px="sm"
        py="0.375rem"
        justify="space-between"
        wrap="nowrap"
        bg="var(--phantom-surface-elevated)"
        style={{ borderBottom: '0.0625rem solid var(--phantom-border-subtle)' }}
      >
        <Group gap="0.5rem">
          <Terminal size={12} style={{ color: 'var(--phantom-text-muted)' }} aria-hidden="true" />
          <Text fz="0.875rem" fw={600} c="var(--phantom-text-secondary)" truncate="end" style={{ maxWidth: '16rem' }}>
            {displayName}
          </Text>
          {session.model && (
            <Badge size="xs" variant="light" color="gray" style={{ textTransform: 'none' }}>
              {session.model.includes('opus') ? 'opus' : session.model.includes('sonnet') ? 'sonnet' : session.model.includes('haiku') ? 'haiku' : session.model}
            </Badge>
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
          {isActive && (
            <Badge size="xs" color="green" variant="dot" style={{ textTransform: 'none' }}>
              active
            </Badge>
          )}
          <Text fz="0.8125rem" c="var(--phantom-text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {relativeTime}
          </Text>
        </Group>
      </Group>

      {/* Terminal body */}
      <Box bg="var(--phantom-surface-card)" p="sm" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        <UnstyledButton
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
          }}
          aria-expanded={expanded}
          aria-label={`${displayName}: ${session.completedTasks} of ${session.taskCount} tasks. ${expanded ? 'Collapse' : 'Expand'} details.`}
          w="100%"
          style={{ cursor: 'pointer' }}
        >
          <Stack gap="0.5rem">
            {/* Context + Task progress row */}
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                <Text fz="0.75rem" c="var(--phantom-accent-glow)" style={{ flexShrink: 0, lineHeight: 1 }}>{promptSymbol}</Text>
                <Text fz="0.75rem" c="var(--phantom-accent-glow)">$</Text>
                <Text fz="0.75rem" c="var(--phantom-text-primary)" fw={500}>
                  {session.taskCount > 0
                    ? `${session.completedTasks}/${session.taskCount} tasks`
                    : session.messageCount > 0
                      ? `${session.messageCount} msgs · ${session.toolUseCount} tools`
                      : 'awaiting input...'}
                </Text>
              </Group>
              <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                {session.xpEarned > 0 && (
                  <Text fz="0.8125rem" c="var(--phantom-accent-gold)" fw={700}>+{session.xpEarned} XP</Text>
                )}
              </Group>
            </Group>

            {/* Task progress bar */}
            {session.taskCount > 0 && (
              <Progress
                value={progressPercent}
                color={isActive ? 'orange' : 'green'}
                size={4}
                radius="xl"
                role="progressbar"
                aria-valuenow={session.completedTasks}
                aria-valuemin={0}
                aria-valuemax={session.taskCount}
                aria-label={`Task progress: ${session.completedTasks} of ${session.taskCount}`}
              />
            )}

            {/* Context usage bar + token stats */}
            {(totalTokens > 0 || isActive) && (
              <Stack gap="0.25rem">
                <Group gap="xs" justify="space-between" wrap="nowrap">
                  <Group gap={4}>
                    <Brain size={11} style={{ color: contextPercent > 90 ? 'var(--phantom-status-danger)' : contextPercent > 80 ? 'var(--phantom-status-warning)' : 'teal' }} aria-hidden="true" />
                    <Text fz="0.75rem" c="var(--phantom-text-muted)">
                      ctx: {Math.round(contextPercent)}% used
                    </Text>
                  </Group>
                  <Group gap="sm" wrap="nowrap">
                    {totalTokens > 0 && (
                      <Text fz="0.75rem" c="var(--phantom-text-muted)">
                        {formatTokens(totalTokens)} tok
                      </Text>
                    )}
                    {session.estimatedCostMicros > 0 && (
                      <Text fz="0.75rem" c="var(--phantom-text-muted)">
                        {formatCost(session.estimatedCostMicros)}
                      </Text>
                    )}
                  </Group>
                </Group>
                <Progress
                  value={contextPercent}
                  color={contextPercent > 90 ? 'red' : contextPercent > 80 ? 'orange' : contextPercent > 60 ? 'yellow' : 'teal'}
                  size={3}
                  radius="xl"
                  role="progressbar"
                  aria-valuenow={session.inputTokens}
                  aria-valuemax={100}
                  aria-label={`Context window: ${Math.round(contextPercent)}% used`}
                />
              </Stack>
            )}
          </Stack>
        </UnstyledButton>

        {/* Expanded: tasks as terminal output */}
        {expanded && (
          <Box
            mt="xs"
            pt="xs"
            style={{ borderTop: '0.0625rem dashed var(--phantom-border-subtle)' }}
          >
            {tasks.length > 0 ? (
              <Stack gap={0}>
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </Stack>
            ) : session.messageCount > 0 || session.toolUseCount > 0 ? (
              <Stack gap="xs">
                <Text fz="0.875rem" c="var(--phantom-text-secondary)" ff="JetBrains Mono, monospace">
                  <Text span c="var(--phantom-accent-glow)">{'> '}</Text>
                  {session.messageCount} messages · {session.toolUseCount} tool uses
                </Text>
                {(() => {
                  let tools: Record<string, number> = {};
                  if (session.toolBreakdown) {
                    try { tools = JSON.parse(session.toolBreakdown); } catch { /* malformed JSON — skip */ }
                  }
                  const sortedTools = Object.entries(tools).sort((a, b) => b[1] - a[1]);
                  return sortedTools.length > 0 ? (
                    <Stack gap={0} mt="xs">
                      <Text fz="0.8125rem" c="var(--phantom-text-muted)" ff="JetBrains Mono, monospace" mb="0.25rem">
                        <Text span c="var(--phantom-accent-glow)">{'> '}</Text>tools used:
                      </Text>
                      {sortedTools.map(([name, count]) => (
                        <Group key={name} gap="xs" pl="md">
                          <Text fz="0.8125rem" c="var(--phantom-text-secondary)" ff="JetBrains Mono, monospace" style={{ minWidth: '1.5rem', textAlign: 'right' }}>
                            {count}×
                          </Text>
                          <Text fz="0.8125rem" c="var(--phantom-text-primary)" ff="JetBrains Mono, monospace">
                            {name}
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  ) : null;
                })()}
                {session.firstPrompt && (
                  <Text fz="0.875rem" c="var(--phantom-text-muted)" ff="JetBrains Mono, monospace" lineClamp={2}>
                    <Text span c="var(--phantom-text-secondary)">{'> '}</Text>
                    {session.firstPrompt}
                  </Text>
                )}
              </Stack>
            ) : (
              <Text fz="0.875rem" c="var(--phantom-text-muted)" ff="JetBrains Mono, monospace">
                <Text span c="var(--phantom-accent-glow)">{'> '}</Text>
                awaiting input_
              </Text>
            )}

            {/* On-demand message viewer */}
            {messages === null ? (
              <UnstyledButton
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  loadMessages();
                }}
                mt="xs"
                style={{ cursor: 'pointer' }}
              >
                <Text
                  fz="0.8125rem"
                  c="var(--phantom-accent-glow)"
                  ff="JetBrains Mono, monospace"
                >
                  {loadingMsgs ? '> loading messages..._' : '> view messages ↵'}
                </Text>
              </UnstyledButton>
            ) : (
              <Stack gap={0} mt="xs">
                {/* Collapse messages button */}
                <UnstyledButton
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setMessages(null);
                  }}
                  style={{ cursor: 'pointer' }}
                  mb="xs"
                >
                  <Text
                    fz="0.8125rem"
                    c="var(--phantom-accent-glow)"
                    ff="JetBrains Mono, monospace"
                  >
                    {'> hide messages ↑'} · {messages.length} messages
                  </Text>
                </UnstyledButton>

                <Stack
                  gap={0}
                  style={{ maxHeight: '20rem', overflowY: 'auto' }}
                >
                  {messages.map((msg, i) => (
                    <Group key={i} gap="xs" wrap="nowrap" py="0.125rem" align="flex-start">
                      <Text
                        fz="0.75rem"
                        fw={700}
                        c={
                          msg.role === 'user'
                            ? 'var(--phantom-status-active)'
                            : 'var(--phantom-accent-glow)'
                        }
                        ff="JetBrains Mono, monospace"
                        style={{ flexShrink: 0, minWidth: '3.5rem' }}
                      >
                        {msg.role === 'user' ? 'YOU' : 'CLAUDE'}
                      </Text>
                      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          fz="0.75rem"
                          c="var(--phantom-text-primary)"
                          ff="JetBrains Mono, monospace"
                          lineClamp={3}
                        >
                          {msg.content ||
                            (msg.toolUse
                              ? `[${msg.toolUse.map((t) => t.name).join(', ')}]`
                              : '...')}
                        </Text>
                        {msg.toolUse && msg.toolUse.length > 0 && msg.content && (
                          <Text
                            fz="0.5rem"
                            c="var(--phantom-text-muted)"
                            ff="JetBrains Mono, monospace"
                          >
                            tools: {msg.toolUse.map((t) => t.name).join(', ')}
                          </Text>
                        )}
                      </Stack>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
