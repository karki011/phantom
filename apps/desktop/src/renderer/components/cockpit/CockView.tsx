/**
 * CockView Component
 * Main CodeBurn Cockpit dashboard — assembles all analytics panels
 *
 * @author Subash Karki
 */
import { Group, Paper, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import {
  Cpu,
  FolderGit2,
  LayoutDashboard,
  Plug,
  Terminal,
  Wrench,
} from 'lucide-react';
import type { RankedEntry } from '@phantom-os/shared';

import {
  cockpitDataAtom,
  cockpitErrorAtom,
  cockpitLoadingAtom,
  cockpitPeriodAtom,
  refreshCockpitAtom,
} from '../../atoms/cockpit';
import type { BreakdownItem } from './BreakdownPanel';
import { ActivityBreakdown } from './ActivityBreakdown';
import { BreakdownPanel } from './BreakdownPanel';
import { CockViewOverview } from './CockViewOverview';
import { DailyCostChart } from './DailyCostChart';
import { PeriodSwitcher } from './PeriodSwitcher';
import { ToolUsageCard } from './ToolUsageCard';

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(2)}`;
};

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

function toBreakdownItems(entries: RankedEntry[], mode: 'cost' | 'count'): BreakdownItem[] {
  const maxVal = entries.length > 0
    ? Math.max(...entries.map((e) => mode === 'cost' ? e.cost : e.count))
    : 1;

  return entries.map((e) => ({
    name: e.name,
    value: mode === 'cost' ? e.cost : e.count,
    label: mode === 'cost' ? formatCost(e.cost) : formatCount(e.count),
    sublabel: mode === 'cost' ? `${formatCount(e.count)} sessions` : undefined,
  }));
}

const PANEL_HEIGHT = 320;

const PanelWrapper = ({ children, fullWidth }: { children: React.ReactNode; fullWidth?: boolean }) => (
  <Paper
    p="sm"
    bg="var(--phantom-surface-card)"
    style={{
      border: '1px solid var(--phantom-border-subtle)',
      height: fullWidth ? undefined : PANEL_HEIGHT,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    {children}
  </Paper>
);

export const CockView = () => {
  const [period, setPeriod] = useAtom(cockpitPeriodAtom);
  const data = useAtomValue(cockpitDataAtom);
  const loading = useAtomValue(cockpitLoadingAtom);
  const error = useAtomValue(cockpitErrorAtom);
  const refresh = useSetAtom(refreshCockpitAtom);

  useEffect(() => {
    refresh();
  }, [period, refresh]);

  const shellCommands = data?.shellCommands ?? [];
  const hasShellData = shellCommands.length > 0;

  return (
    <Stack
      gap="md"
      p="md"
      style={{ overflow: 'auto', height: '100%' }}
    >
      {/* Header row */}
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <LayoutDashboard size={16} style={{ color: 'var(--phantom-accent-cyan)' }} />
          <Text
            ff="Orbitron, sans-serif"
            fz="md"
            fw={700}
            c="var(--phantom-text-primary)"
            style={{ letterSpacing: '0.05em' }}
          >
            CockView
          </Text>
        </Group>
        <PeriodSwitcher value={period} onChange={setPeriod} />
      </Group>

      {/* Error state */}
      {error && (
        <Text fz="sm" c="var(--phantom-status-error)" ta="center" py="sm">
          {error}
        </Text>
      )}

      {/* Loading state */}
      {loading && !data && (
        <Stack gap="md">
          <Skeleton height={80} radius="sm" />
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Skeleton height={200} radius="sm" />
            <Skeleton height={200} radius="sm" />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Skeleton height={200} radius="sm" />
            <Skeleton height={200} radius="sm" />
          </SimpleGrid>
        </Stack>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <Stack align="center" justify="center" gap="sm" py="xl">
          <LayoutDashboard size={32} style={{ color: 'var(--phantom-text-muted)' }} />
          <Text fz="sm" c="var(--phantom-text-muted)">No session data yet</Text>
        </Stack>
      )}

      {/* Data loaded */}
      {data && (
        <Stack gap="md">
          {/* Overview banner */}
          <PanelWrapper fullWidth>
            <CockViewOverview data={data.overview} />
          </PanelWrapper>

          {/* Row 1: Daily chart + By Project */}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <PanelWrapper>
              <DailyCostChart items={data.daily} />
            </PanelWrapper>
            <PanelWrapper>
              <BreakdownPanel
                title="By Project"
                icon={<FolderGit2 size={14} style={{ color: 'var(--phantom-accent-cyan)' }} />}
                items={toBreakdownItems(data.projects, 'count')}
              />
            </PanelWrapper>
          </SimpleGrid>

          {/* Row 2: By Activity + By Model */}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <PanelWrapper>
              <ActivityBreakdown items={data.activities} />
            </PanelWrapper>
            <PanelWrapper>
              <BreakdownPanel
                title="By Model"
                icon={<Cpu size={14} style={{ color: 'var(--phantom-accent-purple, #a855f7)' }} />}
                items={toBreakdownItems(data.models, 'count')}
                barColor="var(--phantom-accent-purple, #a855f7)"
              />
            </PanelWrapper>
          </SimpleGrid>

          {/* Row 3: Core Tools + MCP Servers */}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <PanelWrapper>
              <BreakdownPanel
                title="Core Tools"
                icon={<Wrench size={14} style={{ color: 'var(--phantom-accent-gold)' }} />}
                items={toBreakdownItems(data.tools, 'count')}
                barColor="var(--phantom-accent-gold)"
              />
            </PanelWrapper>
            <PanelWrapper>
              <BreakdownPanel
                title="MCP Servers"
                icon={<Plug size={14} style={{ color: 'var(--phantom-status-success)' }} />}
                items={toBreakdownItems(data.mcpServers, 'count')}
                barColor="var(--phantom-status-success)"
              />
            </PanelWrapper>
          </SimpleGrid>

          {/* Row 4: Tool Usage History (full width) */}
          <PanelWrapper fullWidth>
            <ToolUsageCard period={period} />
          </PanelWrapper>

          {/* Row 5: Top Shell Commands (full width, conditional) */}
          {hasShellData && (
            <PanelWrapper fullWidth>
              <BreakdownPanel
                title="Top Shell Commands"
                icon={<Terminal size={14} style={{ color: 'var(--phantom-text-secondary)' }} />}
                items={toBreakdownItems(shellCommands, 'count')}
              />
            </PanelWrapper>
          )}
        </Stack>
      )}
    </Stack>
  );
};
