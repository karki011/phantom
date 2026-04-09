/**
 * SessionViewer — Live chat-style session conversation viewer
 * @author Subash Karki
 */
import {
  Badge,
  Center,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { useAtomValue } from 'jotai';
import {
  Bot,
  Clock,
  Coins,
  Hash,
  MessageSquare,
  User,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { viewingSessionIdAtom } from '../../atoms/sessionViewer';
import {
  useSessionMessages,
  type SessionMessage,
} from '../../hooks/useSessionMessages';
import { fetchApi, type SessionData } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDuration = (ms: number): string => {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return '<1m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(2)}`;
};

const relativeTime = (timestamp: string): string => {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
};

const MODEL_COLORS: Record<string, string> = {
  opus: '#a855f7',
  sonnet: '#3b82f6',
  haiku: '#22c55e',
};

const getModelColor = (model: string | null): string => {
  if (!model) return '#6b7280';
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#6b7280';
};

const getModelLabel = (model: string | null): string => {
  if (!model) return 'Unknown';
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return model;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const MetadataBar = ({ session }: { session: SessionData }) => {
  const totalTokens = session.inputTokens + session.outputTokens;
  const duration = session.endedAt
    ? session.endedAt - session.startedAt
    : Date.now() - session.startedAt;

  return (
    <Paper
      p="sm"
      radius="md"
      style={{
        backgroundColor: 'var(--phantom-surface-card)',
        border: '1px solid var(--phantom-border-subtle)',
      }}
    >
      <Group gap="md" wrap="wrap">
        {/* Model badge */}
        <Badge
          size="lg"
          radius="xl"
          style={{
            backgroundColor: getModelColor(session.model),
            color: '#fff',
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '0.7rem',
            letterSpacing: '0.05em',
          }}
        >
          {getModelLabel(session.model)}
        </Badge>

        {/* Context usage */}
        {session.contextUsedPct != null && (
          <Group gap={4}>
            <Hash size={14} style={{ color: 'var(--phantom-text-secondary)' }} />
            <Text
              fz="0.8rem"
              ff="Orbitron, sans-serif"
              c="var(--phantom-text-secondary)"
            >
              {session.contextUsedPct}% ctx
            </Text>
          </Group>
        )}

        {/* Token count */}
        <Group gap={4}>
          <Coins size={14} style={{ color: 'var(--phantom-text-secondary)' }} />
          <Text
            fz="0.8rem"
            ff="Orbitron, sans-serif"
            c="var(--phantom-text-secondary)"
          >
            {formatTokens(totalTokens)} tokens
          </Text>
        </Group>

        {/* Duration */}
        <Group gap={4}>
          <Clock size={14} style={{ color: 'var(--phantom-text-secondary)' }} />
          <Text
            fz="0.8rem"
            ff="Orbitron, sans-serif"
            c="var(--phantom-text-secondary)"
          >
            {formatDuration(duration)}
          </Text>
        </Group>

        {/* Cost */}
        <Text
          fz="0.8rem"
          ff="Orbitron, sans-serif"
          c="var(--phantom-text-secondary)"
        >
          {formatCost(session.estimatedCostMicros)}
        </Text>

        {/* Status badge */}
        <Badge
          size="sm"
          radius="sm"
          variant="light"
          color={session.status === 'active' ? 'green' : 'gray'}
        >
          {session.status}
        </Badge>
      </Group>
    </Paper>
  );
};

const ChatMessage = ({ message }: { message: SessionMessage }) => {
  const isUser = message.role === 'user';

  return (
    <Stack gap={4}>
      <Paper
        p="sm"
        radius="md"
        style={{
          backgroundColor: isUser
            ? 'var(--phantom-surface-elevated)'
            : 'var(--phantom-surface-card)',
          border: '1px solid var(--phantom-border-subtle)',
          maxWidth: '85%',
        }}
      >
        {/* Role indicator */}
        <Group gap={6} mb={4}>
          {isUser ? (
            <User size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
          ) : (
            <Bot size={14} style={{ color: '#a855f7' }} />
          )}
          <Text fz="0.75rem" fw={600} c="var(--phantom-text-secondary)">
            {isUser ? 'You' : 'Assistant'}
          </Text>
          {message.timestamp && (
            <Text fz="0.675rem" c="var(--phantom-text-muted)">
              {relativeTime(message.timestamp)}
            </Text>
          )}
        </Group>

        {/* Message content */}
        <Text
          fz="0.85rem"
          c="var(--phantom-text-primary)"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {message.content || '(empty message)'}
        </Text>
      </Paper>

      {/* Tool call badges */}
      {message.toolUse && message.toolUse.length > 0 && (
        <Group gap={4} pl={8}>
          {message.toolUse.map((tool, i) => (
            <Badge
              key={`${tool.name}-${i}`}
              size="xs"
              radius="sm"
              variant="outline"
              leftSection={
                <Wrench
                  size={10}
                  style={{ display: 'flex', alignItems: 'center' }}
                />
              }
              style={{
                borderColor: 'var(--phantom-border-subtle)',
                color: 'var(--phantom-text-secondary)',
              }}
            >
              {tool.name}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const SessionViewer = () => {
  const sessionId = useAtomValue(viewingSessionIdAtom);
  const [session, setSession] = useState<SessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);

  const isActive = session?.status === 'active';
  const { messages, loading: messagesLoading, error: messagesError } =
    useSessionMessages(sessionId, isActive);

  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Fetch session metadata
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setSessionLoading(false);
      return;
    }

    setSessionLoading(true);
    setSessionError(false);

    fetchApi<SessionData>(`/api/sessions/${sessionId}`)
      .then((data) => {
        setSession(data);
        setSessionError(false);
      })
      .catch(() => {
        setSessionError(true);
      })
      .finally(() => {
        setSessionLoading(false);
      });
  }, [sessionId]);

  // Refresh session metadata every 10s while active
  useEffect(() => {
    if (!isActive || !sessionId) return;
    const interval = setInterval(() => {
      fetchApi<SessionData>(`/api/sessions/${sessionId}`)
        .then((data) => setSession(data))
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [isActive, sessionId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // No session selected
  if (!sessionId) {
    return (
      <Stack gap="md">
        <ViewHeader
          title="Session Viewer"
          icon={<MessageSquare size={22} />}
          subtitle="Select a session to view its conversation"
        />
        <Center py="xl">
          <Text fz="0.9rem" c="var(--phantom-text-muted)">
            No session selected. Navigate from Active Sessions to view a conversation.
          </Text>
        </Center>
      </Stack>
    );
  }

  // Loading session metadata
  if (sessionLoading) {
    return (
      <Stack gap="md">
        <ViewHeader
          title="Session Viewer"
          icon={<MessageSquare size={22} />}
        />
        <Center py="xl">
          <Loader size="sm" color="var(--phantom-accent-glow)" />
        </Center>
      </Stack>
    );
  }

  // Error loading session
  if (sessionError || !session) {
    return (
      <Stack gap="md">
        <ViewHeader
          title="Session Viewer"
          icon={<MessageSquare size={22} />}
          subtitle="Failed to load session"
        />
        <Center py="xl">
          <Text fz="0.9rem" c="var(--phantom-status-error)">
            Failed to load session details. The session may no longer exist.
          </Text>
        </Center>
      </Stack>
    );
  }

  return (
    <Stack gap="md" h="100%">
      <ViewHeader
        title="Session Viewer"
        icon={<MessageSquare size={22} />}
        subtitle={session.firstPrompt ?? session.name ?? session.id}
      />

      {/* Metadata bar */}
      <MetadataBar session={session} />

      {/* Chat area */}
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        offsetScrollbars
        type="auto"
      >
        <Stack gap="md" p="xs">
          {/* Messages loading */}
          {messagesLoading && (
            <Center py="xl">
              <Loader size="sm" color="var(--phantom-accent-glow)" />
            </Center>
          )}

          {/* Messages error */}
          {messagesError && !messagesLoading && (
            <Center py="xl">
              <Text fz="0.9rem" c="var(--phantom-status-error)">
                Failed to load messages.
              </Text>
            </Center>
          )}

          {/* Empty state */}
          {!messagesLoading && !messagesError && messages.length === 0 && (
            <Center py="xl">
              <Text fz="0.9rem" c="var(--phantom-text-muted)">
                No messages yet.
              </Text>
            </Center>
          )}

          {/* Message list */}
          {messages.map((msg, i) => (
            <ChatMessage key={`${msg.timestamp}-${i}`} message={msg} />
          ))}

          {/* Scroll anchor */}
          <div ref={scrollEndRef} />
        </Stack>
      </ScrollArea>

      {/* Live indicator */}
      {isActive && (
        <Group gap={6} px="xs" pb="xs">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'var(--phantom-status-success)',
              animation: 'pulse 2s infinite',
            }}
          />
          <Text fz="0.75rem" c="var(--phantom-text-secondary)">
            Live — polling every 3s
          </Text>
        </Group>
      )}
    </Stack>
  );
};
