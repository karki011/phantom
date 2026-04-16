/**
 * ToolUsageCard Component
 * Displays a persistent log of all tool/skill/agent invocations across Claude sessions.
 *
 * @author Subash Karki
 */
import { Badge, Box, Group, ScrollArea, SegmentedControl, Skeleton, Stack, Text } from '@mantine/core';
import {
  Bot,
  GitBranch,
  ListPlus,
  PencilLine,
  Plug,
  Search,
  SquareTerminal,
  Wand,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CockpitPeriod, ToolCategory, ToolUsageEntry, ToolUsageResponse } from '@phantom-os/shared';
import { TOOL_CATEGORIES } from '@phantom-os/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const relativeTime = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 172_800_000) return 'yesterday';
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  code: <PencilLine size={13} />,
  search: <Search size={13} />,
  agent: <Bot size={13} />,
  mcp: <Plug size={13} />,
  terminal: <SquareTerminal size={13} />,
  task: <ListPlus size={13} />,
  git: <GitBranch size={13} />,
};

const fallbackIcon = <Wand size={13} />;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SEGMENT_DATA = TOOL_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));

const EntryRow = ({ entry }: { entry: ToolUsageEntry }) => {
  const icon = CATEGORY_ICON[entry.category] ?? fallbackIcon;

  return (
    <Group
      gap="xs"
      align="flex-start"
      wrap="nowrap"
      style={{
        padding: '5px 0',
        borderBottom: '1px solid var(--phantom-border-subtle)',
      }}
    >
      {/* Category icon */}
      <Box
        style={{
          color: 'var(--phantom-text-muted)',
          marginTop: 2,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>

      {/* Content */}
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text
            fz="0.75rem"
            fw={600}
            c="var(--phantom-text-primary)"
            style={{ flexShrink: 0 }}
          >
            {entry.displayName}
          </Text>

          {entry.type === 'Skill' && entry.skill && (
            <Text
              fz="0.7rem"
              style={{ color: 'var(--phantom-accent-cyan)', flexShrink: 0 }}
            >
              /{entry.skill}
            </Text>
          )}

          {entry.type === 'Agent' && entry.agentDesc && (
            <Text
              fz="0.7rem"
              style={{ color: 'var(--phantom-accent-purple, #a855f7)', flexShrink: 0 }}
              truncate
            >
              {entry.agentDesc}
            </Text>
          )}

          {entry.mcpServer && (
            <Text
              fz="0.65rem"
              style={{ color: 'var(--phantom-status-success)', flexShrink: 0 }}
            >
              {entry.mcpServer}
            </Text>
          )}

          <Text
            fz="0.7rem"
            c="var(--phantom-text-muted)"
            truncate
            style={{ flex: 1, minWidth: 0 }}
          >
            {entry.detail}
          </Text>
        </Group>
      </Box>

      {/* Timestamp */}
      <Text
        fz="0.65rem"
        c="var(--phantom-text-muted)"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        {relativeTime(entry.timestamp)}
      </Text>
    </Group>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ToolUsageCardProps {
  period: CockpitPeriod;
}

export const ToolUsageCard = ({ period }: ToolUsageCardProps) => {
  const [activeCategory, setActiveCategory] = useState<ToolCategory>('all');
  const [data, setData] = useState<ToolUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ period });
    if (activeCategory !== 'all') params.set('category', activeCategory);

    fetch(`/api/cockpit/tool-usage?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ToolUsageResponse>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [period, activeCategory]);

  const entries = data?.entries ?? [];
  const stats = data?.stats;
  const totalCount = stats?.total ?? 0;
  const topTools = stats?.topTools?.slice(0, 3) ?? [];

  return (
    <Stack gap="xs">
      {/* Header */}
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <Wand size={14} style={{ color: 'var(--phantom-accent-cyan)' }} />
          <Text
            fz="0.8rem"
            fw={700}
            c="var(--phantom-text-primary)"
            style={{ letterSpacing: '0.04em' }}
          >
            Tool Usage
          </Text>
          {totalCount > 0 && (
            <Badge
              size="xs"
              variant="filled"
              style={{
                background: 'var(--phantom-accent-cyan)',
                color: 'var(--phantom-surface-bg)',
                fontWeight: 700,
                fontSize: '0.6rem',
              }}
            >
              {totalCount}
            </Badge>
          )}
        </Group>

        {/* Filter tabs */}
        <SegmentedControl
          size="xs"
          value={activeCategory}
          onChange={(val) => setActiveCategory(val as ToolCategory)}
          data={SEGMENT_DATA}
          styles={{
            root: { backgroundColor: 'var(--phantom-surface-elevated, var(--phantom-surface-bg))' },
          }}
        />
      </Group>

      {/* Top tools stats row */}
      {topTools.length > 0 && (
        <Group gap={6}>
          {topTools.map((t) => (
            <Badge
              key={t.name}
              size="xs"
              variant="outline"
              style={{
                borderColor: 'var(--phantom-border-subtle)',
                color: 'var(--phantom-text-secondary)',
                fontSize: '0.65rem',
              }}
            >
              {t.name} · {t.count}
            </Badge>
          ))}
        </Group>
      )}

      {/* Loading */}
      {loading && (
        <Stack gap="xs">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={24} radius="xs" />
          ))}
        </Stack>
      )}

      {/* Error */}
      {!loading && error && (
        <Text fz="0.75rem" c="var(--phantom-status-error)" ta="center" py="sm">
          Failed to load tool usage: {error}
        </Text>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <Stack align="center" gap="xs" py="md">
          <Wand size={20} style={{ color: 'var(--phantom-text-muted)' }} />
          <Text fz="0.75rem" c="var(--phantom-text-muted)">
            No tool usage recorded yet
          </Text>
        </Stack>
      )}

      {/* Entry list */}
      {!loading && !error && entries.length > 0 && (
        <ScrollArea h={220} scrollbarSize={4}>
          <Stack gap={0}>
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
};
