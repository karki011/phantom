/**
 * LiveFeed Component
 * Real-time activity timeline with smart grouping and visual hierarchy per event type.
 *
 * @author Subash Karki
 */
import { ActionIcon, Badge, Box, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core';
import {
  Bot,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  FilePlus,
  FolderSearch,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  ListPlus,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Radio,
  Search,
  Square,
  TerminalSquare,
  Trophy,
  Upload,
  User,
  Wand,
  Zap,
} from 'lucide-react';
import { useSetAtom } from 'jotai';
import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react';

import type { GroupedFeedEvent } from '../../atoms/liveFeed';
import { viewingSessionIdAtom } from '../../atoms/sessionViewer';
import { useLiveFeed } from '../../hooks/useLiveFeed';
import { useRouter } from '../../hooks/useRouter';
import { useSessions } from '../../hooks/useSessions';

// ---------------------------------------------------------------------------
// Inject keyframes once at module level (avoids duplication on every render)
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  const id = 'livefeed-pulse-keyframes';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `@keyframes livefeed-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// Icon + color mapping
// ---------------------------------------------------------------------------

const EVENT_ICON_MAP: Record<string, { icon: ReactNode; color: string }> = {
  'session:active': { icon: <Radio size={14} aria-hidden="true" />, color: 'var(--phantom-status-warning)' },
  'session:new': { icon: <Play size={14} aria-hidden="true" />, color: 'var(--phantom-status-active)' },
  'session:end': { icon: <Square size={14} aria-hidden="true" />, color: 'var(--phantom-text-secondary)' },
  'task:new': { icon: <Zap size={14} aria-hidden="true" />, color: 'var(--phantom-accent-glow)' },
  'task:update': { icon: <CheckCircle size={14} aria-hidden="true" />, color: 'var(--phantom-status-active)' },
  'achievement:unlock': { icon: <Trophy size={14} aria-hidden="true" />, color: 'var(--phantom-accent-gold)' },
  'tool:file-text': { icon: <FileText size={14} aria-hidden="true" />, color: 'teal' },
  'tool:pencil': { icon: <Pencil size={14} aria-hidden="true" />, color: 'var(--phantom-accent-glow)' },
  'tool:file-plus': { icon: <FilePlus size={14} aria-hidden="true" />, color: 'var(--phantom-status-active)' },
  'tool:terminal-square': { icon: <TerminalSquare size={14} aria-hidden="true" />, color: 'var(--phantom-status-warning)' },
  'tool:search': { icon: <Search size={14} aria-hidden="true" />, color: 'teal' },
  'tool:folder-search': { icon: <FolderSearch size={14} aria-hidden="true" />, color: 'teal' },
  'tool:bot': { icon: <Bot size={14} aria-hidden="true" />, color: 'var(--phantom-accent-gold)' },
  'tool:wand': { icon: <Wand size={14} aria-hidden="true" />, color: 'var(--phantom-accent-gold)' },
  'tool:list-plus': { icon: <ListPlus size={14} aria-hidden="true" />, color: 'var(--phantom-accent-glow)' },
  'tool:check-square': { icon: <CheckSquare size={14} aria-hidden="true" />, color: 'var(--phantom-status-active)' },
  'tool:globe': { icon: <Globe size={14} aria-hidden="true" />, color: 'teal' },
  'tool:download': { icon: <Download size={14} aria-hidden="true" />, color: 'teal' },
  'git:git-commit-horizontal': { icon: <GitCommitHorizontal size={14} aria-hidden="true" />, color: 'var(--phantom-status-active)' },
  'git:upload': { icon: <Upload size={14} aria-hidden="true" />, color: 'var(--phantom-status-active)' },
  'git:git-branch': { icon: <GitBranch size={14} aria-hidden="true" />, color: 'var(--phantom-accent-glow)' },
  'user:message': { icon: <User size={14} aria-hidden="true" />, color: 'var(--phantom-status-active)' },
  'response': { icon: <MessageSquare size={14} aria-hidden="true" />, color: 'var(--phantom-accent-glow)' },
};

const CATEGORY_ICONS: Record<string, { icon: ReactNode; color: string }> = {
  code: { icon: <Pencil size={14} aria-hidden="true" />, color: 'var(--phantom-accent-glow)' },
  terminal: { icon: <TerminalSquare size={14} aria-hidden="true" />, color: 'var(--phantom-status-warning)' },
  search: { icon: <Search size={14} aria-hidden="true" />, color: 'teal' },
  git: { icon: <GitCommitHorizontal size={14} aria-hidden="true" />, color: 'var(--phantom-status-active)' },
  task: { icon: <Zap size={14} aria-hidden="true" />, color: 'var(--phantom-accent-glow)' },
  agent: { icon: <Bot size={14} aria-hidden="true" />, color: 'var(--phantom-accent-gold)' },
  session: { icon: <Radio size={14} aria-hidden="true" />, color: 'var(--phantom-status-warning)' },
  achievement: { icon: <Trophy size={14} aria-hidden="true" />, color: 'var(--phantom-accent-gold)' },
};

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

const getRelativeTime = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

// ---------------------------------------------------------------------------
// Active Session Card
// ---------------------------------------------------------------------------

const MODEL_COLORS: Record<string, string> = { opus: '#a855f7', sonnet: '#3b82f6', haiku: '#22c55e' };
const getModelLabel = (model: string | null): string => {
  if (!model) return '';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return '';
};
const getModelColor = (model: string | null): string => {
  if (!model) return 'var(--phantom-text-muted)';
  const key = Object.keys(MODEL_COLORS).find((k) => model.toLowerCase().includes(k));
  return key ? MODEL_COLORS[key] : 'var(--phantom-text-muted)';
};
const formatTokensCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const ActiveSessionCard = ({ session, onClick }: { session: { id: string; name: string | null; repo: string | null; model?: string | null; inputTokens?: number; outputTokens?: number; contextUsedPct?: number | null; taskCount: number; completedTasks: number; startedAt: number }; onClick?: () => void }) => {
  const label = session.repo ?? session.name ?? session.id.slice(0, 8);
  const progress = session.taskCount > 0 ? (session.completedTasks / session.taskCount) * 100 : 0;
  const elapsed = getRelativeTime(session.startedAt);
  const modelLabel = getModelLabel(session.model ?? null);
  const tokens = (session.inputTokens ?? 0) + (session.outputTokens ?? 0);
  const ctxPct = session.contextUsedPct ?? 0;

  return (
    <Box
      py={8}
      px={10}
      onClick={onClick}
      style={{
        borderRadius: 6,
        background: 'var(--phantom-surface-elevated)',
        border: '0.0625rem solid var(--phantom-border-subtle)',
        borderLeft: `0.1875rem solid ${getModelColor(session.model ?? null)}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 150ms ease',
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
        if (onClick) e.currentTarget.style.borderColor = 'var(--phantom-accent-glow)';
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.borderColor = 'var(--phantom-border-subtle)';
      }}
    >
      {/* Row 1: Model + Name + Time */}
      <Group gap="sm" justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {modelLabel && (
            <Badge size="xs" variant="light" style={{ backgroundColor: 'transparent', color: getModelColor(session.model ?? null), border: `1px solid ${getModelColor(session.model ?? null)}`, flexShrink: 0, fontSize: '0.6rem' }}>
              {modelLabel}
            </Badge>
          )}
          <Text fz="0.8125rem" fw={600} c="var(--phantom-text-primary)" lineClamp={1} style={{ flex: 1 }}>
            {label}
          </Text>
        </Group>
        <Text fz="0.6875rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {elapsed}
        </Text>
      </Group>

      {/* Row 2: Tokens + Context + Tasks */}
      <Group gap={8} mt={4} wrap="nowrap">
        {tokens > 0 && (
          <Text fz="0.625rem" c="var(--phantom-text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatTokensCompact(tokens)} tok
          </Text>
        )}
        {ctxPct > 0 && (
          <Text fz="0.625rem" c={ctxPct > 80 ? 'var(--phantom-status-danger)' : ctxPct > 50 ? 'var(--phantom-status-warning)' : 'var(--phantom-text-muted)'} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {ctxPct}% ctx
          </Text>
        )}
        {session.taskCount > 0 && (
          <Text fz="0.625rem" c="var(--phantom-text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {session.completedTasks}/{session.taskCount} tasks
          </Text>
        )}
      </Group>

      {/* Task progress bar */}
      {session.taskCount > 0 && (
        <Progress
          value={progress}
          size={3}
          mt={4}
          color={progress >= 100 ? 'green' : 'blue'}
          styles={{ root: { background: 'var(--phantom-surface-bg)' } }}
          aria-label={`Task progress: ${session.completedTasks} of ${session.taskCount}`}
        />
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Grouped Feed Item
// ---------------------------------------------------------------------------

const GroupedFeedItem = ({ group }: { group: GroupedFeedEvent }) => {
  const [expanded, setExpanded] = useState(false);
  const isGrouped = group.count > 1;
  const config = EVENT_ICON_MAP[group.type] ?? CATEGORY_ICONS[group.category] ?? {
    icon: <Zap size={14} aria-hidden="true" />,
    color: 'var(--phantom-text-secondary)',
  };

  // Special styling for achievements
  const isAchievement = group.category === 'achievement';
  // Special styling for tasks
  const isTask = group.category === 'task';
  // Special styling for git
  const isGit = group.category === 'git';

  const borderColor = isAchievement
    ? 'var(--phantom-accent-gold)'
    : isTask
      ? 'var(--phantom-accent-glow)'
      : isGit
        ? 'var(--phantom-status-active)'
        : 'transparent';

  return (
    <Box
      py={4}
      px={6}
      style={{
        borderLeft: `0.125rem solid ${borderColor}`,
        borderRadius: 4,
        transition: 'background 150ms ease',
        background: isAchievement ? 'rgba(251, 191, 36, 0.04)' : 'transparent',
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.background = 'var(--phantom-surface-elevated)';
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.background = isAchievement ? 'rgba(251, 191, 36, 0.04)' : 'transparent';
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        {/* Icon */}
        <Box style={{ color: config.color, flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: 2 }}>
          {config.icon}
        </Box>

        {/* Content */}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text fz="0.8125rem" c="var(--phantom-text-primary)" lineClamp={1} style={{ flex: 1 }}>
              {group.message}
            </Text>
            <Text fz="0.625rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {getRelativeTime(group.timestamp)}
            </Text>
          </Group>

          {/* Group expand toggle */}
          {isGrouped && (
            <Box
              component="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '1px 0',
                border: 'none',
                background: 'transparent',
                color: 'var(--phantom-text-muted)',
                fontSize: '0.6875rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginTop: 2,
              }}
            >
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {group.count} events
            </Box>
          )}

          {/* Expanded children */}
          {isGrouped && expanded && (
            <Stack gap={2} mt={4} pl={4} style={{ borderLeft: '0.0625rem solid var(--phantom-border-subtle)' }}>
              {group.children.map((child) => (
                <Group key={child.id} gap={6} wrap="nowrap">
                  <Box style={{ color: 'var(--phantom-text-muted)', flexShrink: 0, display: 'flex' }}>
                    {(EVENT_ICON_MAP[child.type] ?? config).icon}
                  </Box>
                  <Text fz="0.75rem" c="var(--phantom-text-secondary)" lineClamp={1} style={{ flex: 1 }}>
                    {child.message}
                  </Text>
                  <Text fz="0.5625rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {getRelativeTime(child.timestamp)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Box>
      </Group>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

const EmptyState = () => (
  <Group gap="sm" justify="center" py="xl">
    <Box
      style={{
        color: 'var(--phantom-text-secondary)',
        animation: 'livefeed-pulse 2s ease-in-out infinite',
      }}
    >
      <Radio size={16} aria-hidden="true" />
    </Box>
    <Text fz="0.8125rem" c="var(--phantom-text-secondary)" fs="italic">
      Waiting for activity...
    </Text>
  </Group>
);

// ---------------------------------------------------------------------------
// LiveFeed (exported)
// ---------------------------------------------------------------------------

export const LiveFeed = () => {
  const { grouped } = useLiveFeed();
  const { active, recent } = useSessions();
  const { navigate } = useRouter();
  const setViewingSession = useSetAtom(viewingSessionIdAtom);
  const [paused, setPaused] = useState(false);
  const [pausedSnapshot, setPausedSnapshot] = useState<GroupedFeedEvent[]>([]);

  // When pausing, freeze the current view
  const togglePause = useCallback(() => {
    setPaused((prev) => {
      if (!prev) setPausedSnapshot(grouped);
      return !prev;
    });
  }, [grouped]);

  const displayGroups = paused ? pausedSnapshot : grouped;

  // Auto-refresh relative times every 10s
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(tickRef.current);
  }, []);

  const hasActivity = active.length > 0 || displayGroups.length > 0;

  return (
    <Paper
      p="md"
      bg="var(--phantom-surface-card)"
      style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
      role="log"
      aria-label="Live activity feed"
      aria-live="polite"
    >
      {/* Header */}
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Radio
            size={16}
            aria-hidden="true"
            style={{
              color: 'var(--phantom-accent-glow)',
              animation: active.length > 0 ? 'livefeed-pulse 2s ease-in-out infinite' : undefined,
            }}
          />
          <Text
            fz="0.8125rem"
            fw={500}
            c="var(--phantom-text-primary)"
          >
            Live Feed
          </Text>
          {active.length > 0 && (
            <Badge size="xs" color="orange" variant="light" styles={{ root: { fontVariantNumeric: 'tabular-nums' } }}>
              {active.length} active
            </Badge>
          )}
        </Group>

        <Tooltip label={paused ? 'Resume live updates' : 'Pause feed'}>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={togglePause}
            aria-label={paused ? 'Resume feed' : 'Pause feed'}
            color={paused ? 'orange' : 'gray'}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Active sessions */}
      {active.length > 0 && (
        <Stack gap={4} mt="xs" mb="xs">
          {active
            .sort((a, b) => b.startedAt - a.startedAt)
            .map((session) => (
              <ActiveSessionCard
                key={session.id}
                session={session}
                onClick={() => {
                  setViewingSession(session.id);
                  navigate('session-viewer');
                }}
              />
            ))}
        </Stack>
      )}

      {/* Grouped feed events */}
      {!hasActivity ? (
        <EmptyState />
      ) : (
        <Stack gap={2} mt={active.length > 0 ? 'xs' : 0}>
          {displayGroups.slice(0, 30).map((group) => (
            <GroupedFeedItem key={group.id} group={group} />
          ))}
        </Stack>
      )}

      {/* Recent history backfill (when no live events) */}
      {displayGroups.length === 0 && active.length === 0 && recent.length > 0 && (
        <Stack gap={2} mt="xs">
          <Text fz="0.625rem" c="var(--phantom-text-muted)" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
            Recent History
          </Text>
          {recent
            .slice(0, 8)
            .filter((s) => s.status !== 'active')
            .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
            .map((s) => (
              <Group key={s.id} gap="sm" wrap="nowrap" py={2} px={6}>
                <Box style={{ color: 'var(--phantom-text-secondary)', flexShrink: 0, display: 'flex' }}>
                  <Square size={14} aria-hidden="true" />
                </Box>
                <Text fz="0.8125rem" c="var(--phantom-text-secondary)" lineClamp={1} style={{ flex: 1 }}>
                  {s.name ?? s.repo ?? s.id.slice(0, 8)} — {s.completedTasks}/{s.taskCount} tasks
                </Text>
                <Text fz="0.625rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {getRelativeTime(s.endedAt ?? s.startedAt)}
                </Text>
              </Group>
            ))}
        </Stack>
      )}

    </Paper>
  );
};
