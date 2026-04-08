/**
 * TokenAnalytics View
 * Token usage breakdown with summary cards, per-project table, and top sessions
 *
 * @author Subash Karki
 */
import {
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  ArrowDownWideNarrow,
  BookOpen,
  Coins,
  Database,
  FileOutput,
  HardDrive,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { SessionData } from '../../lib/api';
import { getSessions } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return dollars >= 0.01 ? `$${dollars.toFixed(2)}` : `$${dollars.toFixed(3)}`;
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  icon: ReactNode;
  value: string;
  label: string;
  color: string;
}

const SummaryCard = ({ icon, value, label, color }: SummaryCardProps) => (
  <Paper
    p="md"
    bg="var(--phantom-surface-card)"
    style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
  >
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon size="lg" variant="light" color={color} radius="md">
        {icon}
      </ThemeIcon>
      <div>
        <Text
          ff="Orbitron, sans-serif"
          fz="1.25rem"
          fw={700}
          c="var(--phantom-text-primary)"
          lh={1.2}
        >
          {value}
        </Text>
        <Text fz="0.75rem" c="var(--phantom-text-secondary)">
          {label}
        </Text>
      </div>
    </Group>
  </Paper>
);

// ---------------------------------------------------------------------------
// Aggregation types
// ---------------------------------------------------------------------------

interface ProjectAggregate {
  project: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TokenAnalytics = () => {
  const [allSessions, setAllSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessions({ limit: 9999 })
      .then((data) => { setAllSessions(data); setLoading(false); })
      .catch(() => { setError('Failed to load analytics'); setLoading(false); });
  }, []);

  const recent = allSessions;

  // -- Summary aggregates
  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    let cache = 0;
    let cost = 0;
    for (const s of recent) {
      input += s.inputTokens;
      output += s.outputTokens;
      cache += s.cacheReadTokens + s.cacheWriteTokens;
      cost += s.estimatedCostMicros;
    }
    return { input, output, cache, cost };
  }, [recent]);

  // -- By-project aggregation
  const byProject = useMemo(() => {
    const map = new Map<string, ProjectAggregate>();
    for (const s of recent) {
      const project = s.repo ?? 'Unknown';
      const existing = map.get(project);
      if (existing) {
        existing.sessions += 1;
        existing.inputTokens += s.inputTokens;
        existing.outputTokens += s.outputTokens;
        existing.costMicros += s.estimatedCostMicros;
      } else {
        map.set(project, {
          project,
          sessions: 1,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          costMicros: s.estimatedCostMicros,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.costMicros - a.costMicros);
  }, [recent]);

  // -- Top 10 sessions by cost
  const topSessions = useMemo(() => {
    return [...recent]
      .sort((a, b) => b.estimatedCostMicros - a.estimatedCostMicros)
      .slice(0, 10);
  }, [recent]);

  if (error) {
    return (
      <Stack gap="lg">
        <ViewHeader
          title="Token Analytics"
          icon={<Coins size={20} />}
          subtitle="Usage and cost breakdown"
        />
        <Text fz="0.875rem" c="var(--phantom-status-error)">
          {error}
        </Text>
      </Stack>
    );
  }

  if (loading) {
    return (
      <Stack gap="lg">
        <ViewHeader
          title="Token Analytics"
          icon={<Coins size={20} />}
          subtitle="Usage and cost breakdown"
        />
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
          <Skeleton h="4.5rem" radius="sm" />
          <Skeleton h="4.5rem" radius="sm" />
          <Skeleton h="4.5rem" radius="sm" />
          <Skeleton h="4.5rem" radius="sm" />
        </SimpleGrid>
        <Skeleton h="12rem" radius="sm" />
        <Skeleton h="12rem" radius="sm" />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Token Analytics"
        icon={<Coins size={20} />}
        subtitle="Usage and cost breakdown"
      />

      {/* Summary Cards */}
      <SimpleGrid
        cols={{ base: 1, xs: 2, md: 4 }}
        spacing="md"
        role="region"
        aria-label="Token usage summary"
      >
        <SummaryCard
          icon={<Database size={20} aria-hidden="true" />}
          value={formatTokens(totals.input)}
          label="Total Input Tokens"
          color="blue"
        />
        <SummaryCard
          icon={<FileOutput size={20} aria-hidden="true" />}
          value={formatTokens(totals.output)}
          label="Total Output Tokens"
          color="green"
        />
        <SummaryCard
          icon={<HardDrive size={20} aria-hidden="true" />}
          value={formatTokens(totals.cache)}
          label="Total Cache Tokens"
          color="grape"
        />
        <SummaryCard
          icon={<Coins size={20} aria-hidden="true" />}
          value={formatCost(totals.cost)}
          label="Total Cost"
          color="orange"
        />
      </SimpleGrid>

      {/* By Project Table */}
      <Stack gap="sm">
        <Group gap="xs">
          <BookOpen
            size={16}
            style={{ color: 'var(--phantom-text-secondary)' }}
            aria-hidden="true"
          />
          <Text
            fz="0.8125rem"
            fw={600}
            c="var(--phantom-text-secondary)"
            tt="uppercase"
            style={{ letterSpacing: '0.03em' }}
          >
            By Project
          </Text>
        </Group>

        {byProject.length === 0 ? (
          <Text fz="0.875rem" c="var(--phantom-text-muted)" fs="italic">
            No project data available.
          </Text>
        ) : (
          <Paper
            bg="var(--phantom-surface-card)"
            style={{
              border: '0.0625rem solid var(--phantom-border-subtle)',
              overflow: 'auto',
            }}
          >
            <Table
              striped
              highlightOnHover
              aria-label="Token usage by project"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Project</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Sessions</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Input Tokens</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Output Tokens</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Cost</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {byProject.map((row) => (
                  <Table.Tr key={row.project}>
                    <Table.Td>
                      <Text fz="0.8125rem" c="var(--phantom-text-primary)" truncate="end">
                        {row.project}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text fz="0.8125rem" ff="Orbitron, sans-serif" fw={600}>
                        {row.sessions}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text fz="0.8125rem" ff="Orbitron, sans-serif" fw={600}>
                        {formatTokens(row.inputTokens)}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text fz="0.8125rem" ff="Orbitron, sans-serif" fw={600}>
                        {formatTokens(row.outputTokens)}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text fz="0.8125rem" ff="Orbitron, sans-serif" fw={600} c="var(--phantom-accent-gold)">
                        {formatCost(row.costMicros)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>

      {/* Top 10 Sessions */}
      <Stack gap="sm">
        <Group gap="xs">
          <ArrowDownWideNarrow
            size={16}
            style={{ color: 'var(--phantom-text-secondary)' }}
            aria-hidden="true"
          />
          <Text
            fz="0.8125rem"
            fw={600}
            c="var(--phantom-text-secondary)"
            tt="uppercase"
            style={{ letterSpacing: '0.03em' }}
          >
            Top 10 Sessions
          </Text>
        </Group>

        {topSessions.length === 0 ? (
          <Text fz="0.875rem" c="var(--phantom-text-muted)" fs="italic">
            No session data available.
          </Text>
        ) : (
          <Paper
            bg="var(--phantom-surface-card)"
            style={{
              border: '0.0625rem solid var(--phantom-border-subtle)',
              overflow: 'auto',
            }}
          >
            <Table
              striped
              highlightOnHover
              aria-label="Top 10 most expensive sessions"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Session Name</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Tokens</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Cost</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Date</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {topSessions.map((session) => {
                  const displayName =
                    session.name ??
                    session.repo ??
                    session.id.slice(0, 8);
                  const totalTokens =
                    session.inputTokens + session.outputTokens;

                  return (
                    <Table.Tr key={session.id}>
                      <Table.Td>
                        <Text fz="0.8125rem" c="var(--phantom-text-primary)" truncate="end">
                          {displayName}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Text fz="0.8125rem" ff="Orbitron, sans-serif" fw={600}>
                          {formatTokens(totalTokens)}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Text fz="0.8125rem" ff="Orbitron, sans-serif" fw={600} c="var(--phantom-accent-gold)">
                          {formatCost(session.estimatedCostMicros)}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Text fz="0.8125rem" c="var(--phantom-text-secondary)">
                          {formatDate(session.startedAt)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>
    </Stack>
  );
};
