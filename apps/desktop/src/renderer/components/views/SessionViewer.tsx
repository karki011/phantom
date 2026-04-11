/**
 * SessionViewer — Chat bubble-style session conversation viewer
 * User messages right-aligned, Claude messages left-aligned with tool badges
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
    <Group gap="md" wrap="wrap" px="sm" py={6}>
      <Badge
        size="sm"
        radius="xl"
        style={{
          backgroundColor: getModelColor(session.model),
          color: '#fff',
          fontSize: '0.65rem',
        }}
      >
        {getModelLabel(session.model)}
      </Badge>
      {session.contextUsedPct != null && (
        <Text fz="0.73rem" c="var(--phantom-text-muted)">
          <Hash size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> {session.contextUsedPct}% ctx
        </Text>
      )}
      <Text fz="0.73rem" c="var(--phantom-text-muted)">
        <Coins size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> {formatTokens(totalTokens)}
      </Text>
      <Text fz="0.73rem" c="var(--phantom-text-muted)">
        <Clock size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> {formatDuration(duration)}
      </Text>
      <Text fz="0.73rem" c="var(--phantom-text-muted)">{formatCost(session.estimatedCostMicros)}</Text>
      <Badge size="xs" radius="sm" variant="light" color={session.status === 'active' ? 'green' : 'gray'}>
        {session.status}
      </Badge>
    </Group>
  );
};

/** Filter out empty messages (no content and no tool calls) */
const isNonEmpty = (msg: SessionMessage): boolean =>
  (msg.content?.trim().length ?? 0) > 0 || (msg.toolUse?.length ?? 0) > 0;

const ChatBubble = ({ message }: { message: SessionMessage }) => {
  const isUser = message.role === 'user';
  const hasContent = (message.content?.trim().length ?? 0) > 0;
  const hasTools = (message.toolUse?.length ?? 0) > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Sender + timestamp */}
      <Group gap={6} mb={3} style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: isUser ? 'var(--phantom-accent-glow)' : getModelColor(null),
          flexShrink: 0,
        }}>
          {isUser
            ? <User size={10} style={{ color: '#000' }} />
            : <Bot size={10} style={{ color: '#fff' }} />}
        </div>
        <Text fz="0.68rem" fw={600} c={isUser ? 'var(--phantom-accent-glow)' : 'var(--phantom-accent-cyan)'}>
          {isUser ? 'You' : 'Claude'}
        </Text>
        {message.timestamp && (
          <Text fz="0.6rem" c="var(--phantom-text-muted)">
            {relativeTime(message.timestamp)}
          </Text>
        )}
      </Group>

      {/* Bubble */}
      {hasContent && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            backgroundColor: isUser
              ? 'var(--phantom-accent-glow)'
              : 'var(--phantom-surface-card)',
            border: isUser ? 'none' : '1px solid var(--phantom-border-subtle)',
            maxWidth: '100%',
          }}
        >
          <Text
            fz="0.82rem"
            c={isUser ? '#000' : 'var(--phantom-text-primary)'}
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}
          >
            {message.content}
          </Text>
        </div>
      )}

      {/* Tool badges */}
      {hasTools && (
        <Stack gap={3} mt={4}>
          {message.toolUse!.map((tool, i) => (
            <Group key={`${tool.name}-${i}`} gap={6} wrap="nowrap">
              <Badge
                size="xs"
                radius="sm"
                variant="light"
                leftSection={<Wrench size={9} style={{ display: 'flex' }} />}
                style={{
                  backgroundColor: 'var(--phantom-surface-elevated)',
                  borderColor: 'var(--phantom-border-subtle)',
                  color: 'var(--phantom-text-secondary)',
                  fontSize: '0.6rem',
                  flexShrink: 0,
                }}
              >
                {tool.name}
              </Badge>
              {tool.summary && (
                <Text fz="0.65rem" c="var(--phantom-text-muted)" truncate ff="'JetBrains Mono', monospace">
                  {tool.summary}
                </Text>
              )}
            </Group>
          ))}
        </Stack>
      )}
    </div>
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

  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
        <ViewHeader title="Session Viewer" icon={<MessageSquare size={22} />} />
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
        <ViewHeader title="Session Viewer" icon={<MessageSquare size={22} />} subtitle="Failed to load session" />
        <Center py="xl">
          <Text fz="0.9rem" c="var(--phantom-status-error)">
            Failed to load session details. The session may no longer exist.
          </Text>
        </Center>
      </Stack>
    );
  }

  const visibleMessages = [...messages].reverse().filter(isNonEmpty);

  return (
    <div style={{ height: '100%', maxHeight: 'calc(100vh - 90px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--mantine-spacing-md) var(--mantine-spacing-lg)' }}>
      {/* Laptop frame */}
      <div
        style={{
          maxWidth: 780,
          width: '100%',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 12,
          border: '1px solid var(--phantom-border-subtle)',
          overflow: 'auto',
          backgroundColor: 'var(--phantom-surface-base, #111)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            backgroundColor: 'var(--phantom-surface-card)',
            borderBottom: '1px solid var(--phantom-border-subtle)',
            flexShrink: 0,
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ff5f57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#febc2e' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#28c840' }} />
          </div>
          <Text fz="0.7rem" fw={500} c="var(--phantom-text-secondary)" truncate style={{ flex: 1, textAlign: 'center' }}>
            {session.firstPrompt ?? session.name ?? 'Session Viewer'}
          </Text>
          <Badge size="xs" radius="sm" variant="light" color={isActive ? 'green' : 'gray'}>
            {session.status}
          </Badge>
        </div>

        {/* Metadata bar */}
        <MetadataBar session={session} />

        {/* Chat area */}
        <ScrollArea
          style={{ flex: 1, minHeight: 0 }}
          viewportRef={scrollRef}
          offsetScrollbars
          type="auto"
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              padding: '16px 20px',
              width: '100%',
            }}
          >
          {/* Messages loading */}
          {messagesLoading && (
            <Center py="xl">
              <Loader size="sm" color="var(--phantom-accent-glow)" />
            </Center>
          )}

          {/* Messages error */}
          {messagesError && !messagesLoading && (
            <Center py="xl">
              <Text fz="0.9rem" c="var(--phantom-status-error)">Failed to load messages.</Text>
            </Center>
          )}

          {/* Empty state */}
          {!messagesLoading && !messagesError && visibleMessages.length === 0 && (
            <Center py="xl">
              <Text fz="0.9rem" c="var(--phantom-text-muted)">No messages yet.</Text>
            </Center>
          )}

          {/* Chat bubbles */}
          {visibleMessages.map((msg) => (
            <ChatBubble key={`${msg.timestamp}-${msg.role}`} message={msg} />
          ))}
          </div>
        </ScrollArea>

        {/* Live indicator */}
        {isActive && (
          <Group gap={6} px="md" py={6} style={{ borderTop: '1px solid var(--phantom-border-subtle)', flexShrink: 0 }}>
            <div
              style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: 'var(--phantom-status-success)',
                animation: 'pulse 2s infinite',
              }}
            />
            <Text fz="0.73rem" c="var(--phantom-text-secondary)">
              Live — polling every 3s
            </Text>
          </Group>
        )}
      </div>
    </div>
  );
};
