/**
 * GraphStatus — Graph build progress indicator for SystemHeader
 * Shows alongside CPU/memory metrics.  Renders nothing when idle.
 *
 * @author Subash Karki
 */
import { Group, Popover, Stack, Text, Tooltip } from '@mantine/core';
import { Circle, GitGraph } from 'lucide-react';

import { useGraphStatus } from '../../hooks/useGraphStatus';
import type { GraphPhase } from '../../atoms/graph';

// ---------------------------------------------------------------------------
// Pulse animation (inline keyframes injected once)
// ---------------------------------------------------------------------------

const PULSE_ID = '__phantom-graph-pulse';

function ensurePulseKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PULSE_ID)) return;

  const style = document.createElement('style');
  style.id = PULSE_ID;
  style.textContent = `
    @keyframes pulse-graph {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes pulse-graph-slow {
      0%, 100% { opacity: 0.85; }
      50% { opacity: 0.35; }
    }
    @keyframes flash-graph {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (n: number): string =>
  n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

const formatCoverage = (c: number): string =>
  `${(c * 100).toFixed(0)}%`;

const phaseColor: Record<GraphPhase, string> = {
  idle: 'var(--phantom-text-muted)',
  building: 'var(--phantom-accent-cyan)',
  enriching: 'var(--phantom-accent-cyan)',
  updating: 'var(--phantom-accent-cyan)',
  ready: 'var(--phantom-status-success, #22c55e)',
  stale: 'var(--phantom-status-warning, #f59e0b)',
  error: 'var(--phantom-status-danger, #ef4444)',
};

const dotColor: Record<string, string> = {
  ready: 'var(--phantom-status-success, #22c55e)',
  stale: 'var(--phantom-status-warning, #f59e0b)',
  error: 'var(--phantom-status-danger, #ef4444)',
};

// ---------------------------------------------------------------------------
// Sub-components per phase
// ---------------------------------------------------------------------------

function BuildingIndicator({ current, total }: { current: number; total: number }) {
  ensurePulseKeyframes();
  return (
    <Group gap="0.375rem" style={{ cursor: 'default' }}>
      <GitGraph
        size={12}
        aria-hidden="true"
        style={{
          color: phaseColor.building,
          animation: 'pulse-graph 1.2s ease-in-out infinite',
        }}
      />
      <Text fz="0.75rem" c="var(--phantom-text-secondary)">
        Mapping... {formatNumber(current)}/{formatNumber(total)}
      </Text>
      {total > 0 && (
        <Text fz="0.65rem" c="var(--phantom-text-muted)">
          {Math.round((current / total) * 100)}%
        </Text>
      )}
    </Group>
  );
}

function EnrichingIndicator({ current, total }: { current: number; total: number }) {
  ensurePulseKeyframes();
  return (
    <Group gap="0.375rem" style={{ cursor: 'default' }}>
      <GitGraph
        size={12}
        aria-hidden="true"
        style={{
          color: phaseColor.enriching,
          opacity: 0.7,
          animation: 'pulse-graph-slow 2s ease-in-out infinite',
        }}
      />
      <Text fz="0.75rem" c="var(--phantom-text-secondary)">
        Enriching... {formatNumber(current)}/{formatNumber(total)}
      </Text>
    </Group>
  );
}

function UpdatingIndicator() {
  ensurePulseKeyframes();
  return (
    <Group gap="0.375rem" style={{ cursor: 'default' }}>
      <GitGraph
        size={12}
        aria-hidden="true"
        style={{
          color: phaseColor.updating,
          animation: 'flash-graph 0.6s ease-in-out infinite',
        }}
      />
      <Text fz="0.75rem" c="var(--phantom-text-secondary)">
        Updating...
      </Text>
    </Group>
  );
}

function ReadyIndicator({
  files,
  edges,
  coverage,
  lastUpdated,
}: {
  files: number;
  edges: number;
  coverage: number;
  lastUpdated: number | null;
}) {
  const timeAgo = lastUpdated ? formatTimeAgo(lastUpdated) : null;

  return (
    <Popover width={240} position="bottom" shadow="md" withArrow>
      <Popover.Target>
        <Group gap="0.375rem" style={{ cursor: 'pointer' }}>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <GitGraph size={12} aria-hidden="true" style={{ color: phaseColor.ready }} />
            <Circle
              size={5}
              fill={dotColor.ready}
              stroke="none"
              aria-hidden="true"
              style={{ position: 'absolute', top: -1, right: -2 }}
            />
          </span>
          <Text fz="0.75rem" c="var(--phantom-text-secondary)">
            {formatNumber(files)} files
          </Text>
        </Group>
      </Popover.Target>
      <Popover.Dropdown
        style={{
          backgroundColor: 'var(--phantom-surface-card)',
          borderColor: 'var(--phantom-border-subtle)',
          padding: 10,
        }}
      >
        <Stack gap={4}>
          <Text fw={600} fz="xs" c="var(--phantom-text-primary)">
            Code Graph
          </Text>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text fz="xs" c="var(--phantom-text-secondary)">Files</Text>
            <Text fz="xs" c="var(--phantom-text-primary)" fw={600}>{formatNumber(files)}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text fz="xs" c="var(--phantom-text-secondary)">Edges</Text>
            <Text fz="xs" c="var(--phantom-text-primary)" fw={600}>{formatNumber(edges)}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text fz="xs" c="var(--phantom-text-secondary)">Coverage</Text>
            <Text fz="xs" c="var(--phantom-text-primary)" fw={600}>{formatCoverage(coverage)}</Text>
          </div>
          {timeAgo && (
            <Text fz="0.65rem" c="var(--phantom-text-muted)" mt={2}>
              Updated {timeAgo}
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function StaleIndicator({ stats }: { stats: { files: number } | null }) {
  return (
    <Tooltip label="Graph is stale — click to rebuild" position="bottom" withArrow fz="xs">
      <Group
        gap="0.375rem"
        style={{ cursor: 'pointer' }}
        onClick={() => {
          // Fire rebuild request
          fetch('/api/graph/rebuild', { method: 'POST' }).catch(() => {});
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <GitGraph size={12} aria-hidden="true" style={{ color: phaseColor.stale }} />
          <Circle
            size={5}
            fill={dotColor.stale}
            stroke="none"
            aria-hidden="true"
            style={{ position: 'absolute', top: -1, right: -2 }}
          />
        </span>
        <Text fz="0.75rem" c="var(--phantom-text-secondary)">
          {stats ? `${formatNumber(stats.files)} stale` : 'Stale'}
        </Text>
      </Group>
    </Tooltip>
  );
}

function ErrorIndicator({ error }: { error: string | null }) {
  return (
    <Tooltip
      label={error ?? 'Graph build failed'}
      position="bottom"
      withArrow
      fz="xs"
      maw={280}
      multiline
    >
      <Group gap="0.375rem" style={{ cursor: 'default' }}>
        <GitGraph size={12} aria-hidden="true" style={{ color: phaseColor.error }} />
        <Text fz="0.75rem" c="var(--phantom-status-danger, #ef4444)">
          Error
        </Text>
      </Group>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const GraphStatus = () => {
  const status = useGraphStatus();

  if (status.phase === 'idle') return null;

  switch (status.phase) {
    case 'building':
      return (
        <BuildingIndicator
          current={status.progress?.current ?? 0}
          total={status.progress?.total ?? 0}
        />
      );

    case 'enriching':
      return (
        <EnrichingIndicator
          current={status.progress?.current ?? 0}
          total={status.progress?.total ?? 0}
        />
      );

    case 'updating':
      return <UpdatingIndicator />;

    case 'ready':
      return (
        <ReadyIndicator
          files={status.stats?.files ?? 0}
          edges={status.stats?.edges ?? 0}
          coverage={status.stats?.coverage ?? 0}
          lastUpdated={status.lastUpdated}
        />
      );

    case 'stale':
      return <StaleIndicator stats={status.stats} />;

    case 'error':
      return <ErrorIndicator error={status.error} />;

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Time formatting helper
// ---------------------------------------------------------------------------

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
