/**
 * StrategyDashboard View
 * Visual dashboard showing AI strategy effectiveness with charts and metrics
 *
 * @author Subash Karki
 */
import {
  Badge,
  Card,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts';
import { Target, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';

import { projectsAtom } from '../../atoms/worktrees';
import { fetchApi } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistoryDecision {
  id: string;
  strategy_id: string;
  strategy_name: string;
  confidence: number | null;
  complexity: string | null;
  duration_ms: number | null;
  created_at: string | number;
  success: number | null;
}

interface HistoryResponse {
  decisions: HistoryDecision[];
  count: number;
}

interface StrategyInfo {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
}

interface StrategiesResponse {
  strategies: StrategyInfo[];
}

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

interface StrategyMetrics {
  id: string;
  name: string;
  totalRuns: number;
  successCount: number;
  successRate: number;
  avgConfidence: number;
  avgDuration: number;
  description: string;
  enabled: boolean;
  byComplexity: Record<string, { total: number; success: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getBarColor = (rate: number): string => {
  if (rate >= 0.7) return 'var(--phantom-status-success, #22c55e)';
  if (rate >= 0.4) return 'var(--phantom-status-warning, #f59e0b)';
  return 'var(--phantom-status-danger, #ef4444)';
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
};

const formatPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

const COMPLEXITY_LEVELS = ['simple', 'moderate', 'complex', 'critical'] as const;

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: 'var(--phantom-status-success, #22c55e)',
  moderate: 'var(--phantom-accent-cyan, #00d4ff)',
  complex: 'var(--phantom-status-warning, #f59e0b)',
  critical: 'var(--phantom-status-danger, #ef4444)',
};

// ---------------------------------------------------------------------------
// Custom Recharts tooltip
// ---------------------------------------------------------------------------

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: 'var(--phantom-surface-card)',
        border: '1px solid var(--phantom-border-subtle)',
        borderRadius: 4,
        padding: '8px 12px',
      }}
    >
      <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">{label}</Text>
      <Text fz="0.6875rem" c="var(--phantom-text-secondary)">
        Success Rate: {formatPercent(payload[0].value / 100)}
      </Text>
    </div>
  );
};

const CustomRadarTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: 'var(--phantom-surface-card)',
        border: '1px solid var(--phantom-border-subtle)',
        borderRadius: 4,
        padding: '8px 12px',
      }}
    >
      {payload.map((entry: any, i: number) => (
        <Text key={i} fz="0.6875rem" c="var(--phantom-text-secondary)">
          {entry.name}: {formatPercent(entry.value / 100)}
        </Text>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StrategyDashboard = () => {
  const projects = useAtomValue(projectsAtom);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [decisions, setDecisions] = useState<HistoryDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');

  const fetchData = useCallback(async () => {
    if (projects.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const allStrategies: StrategyInfo[] = [];
      const allDecisions: HistoryDecision[] = [];

      const results = await Promise.allSettled(
        projects.flatMap((p) => [
          fetchApi<StrategiesResponse>(`/api/orchestrator/${encodeURIComponent(p.id)}/strategies`),
          fetchApi<HistoryResponse>(`/api/orchestrator/${encodeURIComponent(p.id)}/history?limit=200`),
        ]),
      );

      // Results alternate: strategies, history, strategies, history, ...
      for (let i = 0; i < results.length; i += 2) {
        const stratResult = results[i];
        const histResult = results[i + 1];
        if (stratResult?.status === 'fulfilled') {
          // Deduplicate strategies by id
          for (const s of stratResult.value.strategies) {
            if (!allStrategies.some((x) => x.id === s.id)) {
              allStrategies.push(s);
            }
          }
        }
        if (histResult?.status === 'fulfilled') {
          allDecisions.push(...(histResult.value as HistoryResponse).decisions);
        }
      }

      setStrategies(allStrategies);
      setDecisions(allDecisions);
    } catch {
      setError('Failed to load strategy data');
    } finally {
      setLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter by period
  const filteredDecisions = useMemo(() => {
    const cutoff = Date.now() - Number(period) * 24 * 60 * 60 * 1000;
    return decisions.filter((d) => {
      const ts = typeof d.created_at === 'number' ? d.created_at : new Date(d.created_at).getTime();
      return ts >= cutoff;
    });
  }, [decisions, period]);

  // Compute per-strategy metrics
  const metrics = useMemo((): StrategyMetrics[] => {
    const map = new Map<string, StrategyMetrics>();

    // Initialize from known strategies
    for (const s of strategies) {
      map.set(s.id, {
        id: s.id,
        name: s.name,
        totalRuns: 0,
        successCount: 0,
        successRate: 0,
        avgConfidence: 0,
        avgDuration: 0,
        description: s.description,
        enabled: s.enabled,
        byComplexity: {},
      });
    }

    // Accumulate from decisions
    for (const d of filteredDecisions) {
      let entry = map.get(d.strategy_id);
      if (!entry) {
        entry = {
          id: d.strategy_id,
          name: d.strategy_name,
          totalRuns: 0,
          successCount: 0,
          successRate: 0,
          avgConfidence: 0,
          avgDuration: 0,
          description: '',
          enabled: true,
          byComplexity: {},
        };
        map.set(d.strategy_id, entry);
      }

      entry.totalRuns++;
      if (d.success === 1) entry.successCount++;
      if (d.confidence !== null) entry.avgConfidence += d.confidence;
      if (d.duration_ms !== null) entry.avgDuration += d.duration_ms;

      // Track complexity breakdown
      const complexity = d.complexity ?? 'unknown';
      if (!entry.byComplexity[complexity]) {
        entry.byComplexity[complexity] = { total: 0, success: 0 };
      }
      entry.byComplexity[complexity].total++;
      if (d.success === 1) entry.byComplexity[complexity].success++;
    }

    // Finalize averages
    const result: StrategyMetrics[] = [];
    for (const entry of map.values()) {
      if (entry.totalRuns > 0) {
        entry.successRate = entry.successCount / entry.totalRuns;
        entry.avgConfidence = entry.avgConfidence / entry.totalRuns;
        entry.avgDuration = entry.avgDuration / entry.totalRuns;
      }
      result.push(entry);
    }

    // Sort by total runs descending
    result.sort((a, b) => b.totalRuns - a.totalRuns);
    return result;
  }, [strategies, filteredDecisions]);

  // Bar chart data
  const barData = useMemo(
    () =>
      metrics
        .filter((m) => m.totalRuns > 0)
        .map((m) => ({
          name: m.name,
          rate: Math.round(m.successRate * 100),
        })),
    [metrics],
  );

  // Radar chart data: per-strategy success rate at each complexity level
  const radarData = useMemo(() => {
    const strategiesWithRuns = metrics.filter((m) => m.totalRuns > 0);
    return COMPLEXITY_LEVELS.map((level) => {
      const entry: Record<string, string | number> = { complexity: level };
      for (const m of strategiesWithRuns) {
        const cx = m.byComplexity[level];
        entry[m.name] = cx && cx.total > 0 ? Math.round((cx.success / cx.total) * 100) : 0;
      }
      return entry;
    });
  }, [metrics]);

  const hasEnoughData = filteredDecisions.length >= 10;
  const strategiesWithRuns = metrics.filter((m) => m.totalRuns > 0);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <ViewHeader
          title="Strategy Performance"
          icon={<Target size={20} />}
          subtitle="AI strategy effectiveness"
        />
        <SegmentedControl
          value={period}
          onChange={(v) => setPeriod(v as '7' | '30' | '90')}
          data={[
            { label: '7d', value: '7' },
            { label: '30d', value: '30' },
            { label: '90d', value: '90' },
          ]}
          size="xs"
          aria-label="Time period"
        />
      </Group>

      {loading ? (
        <Stack gap="md">
          <Skeleton h="15rem" radius="sm" />
          <Skeleton h="10rem" radius="sm" />
        </Stack>
      ) : error ? (
        <Card
          p="xl"
          bg="var(--phantom-surface-card)"
          style={{ border: '0.0625rem solid var(--phantom-border-subtle)', textAlign: 'center' }}
        >
          <Stack align="center" gap="sm">
            <XCircle size={24} style={{ color: 'var(--phantom-status-danger, #ef4444)' }} />
            <Text fz="0.875rem" c="var(--phantom-text-muted)">{error}</Text>
          </Stack>
        </Card>
      ) : !hasEnoughData ? (
        <Card
          p="xl"
          bg="var(--phantom-surface-card)"
          style={{ border: '0.0625rem solid var(--phantom-border-subtle)', textAlign: 'center' }}
        >
          <Stack align="center" gap="sm">
            <Target size={32} style={{ color: 'var(--phantom-text-muted)', opacity: 0.5 }} />
            <Text fz="0.875rem" fw={500} c="var(--phantom-text-primary)">
              Not enough data yet
            </Text>
            <Text fz="0.8125rem" c="var(--phantom-text-muted)" maw={400}>
              Run 10+ orchestrator goals to see strategy performance trends.
              Currently {filteredDecisions.length} decision{filteredDecisions.length !== 1 ? 's' : ''} recorded.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="md">
          {/* Success Rate Bar Chart */}
          <Card
            p="md"
            bg="var(--phantom-surface-card)"
            style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
          >
            <Text
              ff="Orbitron, sans-serif"
              fz="0.75rem"
              fw={700}
              c="var(--phantom-text-secondary)"
              tt="uppercase"
              mb="sm"
              style={{ letterSpacing: '0.05em' }}
            >
              Success Rate by Strategy
            </Text>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: 'var(--phantom-text-muted)', fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fill: 'var(--phantom-text-secondary)', fontSize: 11 }}
                />
                <Tooltip content={<CustomBarTooltip />} cursor={false} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={18}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={getBarColor(entry.rate / 100)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Complexity Radar Chart */}
          {strategiesWithRuns.length >= 2 && (
            <Card
              p="md"
              bg="var(--phantom-surface-card)"
              style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
            >
              <Text
                ff="Orbitron, sans-serif"
                fz="0.75rem"
                fw={700}
                c="var(--phantom-text-secondary)"
                tt="uppercase"
                mb="sm"
                style={{ letterSpacing: '0.05em' }}
              >
                Success by Complexity Level
              </Text>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--phantom-border-subtle)" />
                  <PolarAngleAxis
                    dataKey="complexity"
                    tick={{ fill: 'var(--phantom-text-secondary)', fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fill: 'var(--phantom-text-muted)', fontSize: 10 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  {strategiesWithRuns.slice(0, 4).map((m, i) => {
                    const colors = ['#22c55e', '#00d4ff', '#f59e0b', '#a855f7'];
                    return (
                      <Radar
                        key={m.id}
                        name={m.name}
                        dataKey={m.name}
                        stroke={colors[i % colors.length]}
                        fill={colors[i % colors.length]}
                        fillOpacity={0.15}
                      />
                    );
                  })}
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: 'var(--phantom-text-secondary)' }}
                  />
                  <Tooltip content={<CustomRadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Metrics Table */}
          <Card
            p="md"
            bg="var(--phantom-surface-card)"
            style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
          >
            <Text
              ff="Orbitron, sans-serif"
              fz="0.75rem"
              fw={700}
              c="var(--phantom-text-secondary)"
              tt="uppercase"
              mb="sm"
              style={{ letterSpacing: '0.05em' }}
            >
              Strategy Breakdown
            </Text>
            <Table
              striped
              highlightOnHover
              withTableBorder={false}
              styles={{
                th: {
                  color: 'var(--phantom-text-muted)',
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 700,
                },
                td: {
                  color: 'var(--phantom-text-primary)',
                  fontSize: '0.8125rem',
                  fontFamily: "'JetBrains Mono', monospace",
                },
              }}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Strategy</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Runs</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Success</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Avg Confidence</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Avg Duration</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {metrics
                  .filter((m) => m.totalRuns > 0)
                  .map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>
                        <Group gap="xs">
                          <Text fz="0.8125rem" fw={500} style={{ fontFamily: 'inherit' }}>
                            {m.name}
                          </Text>
                          {!m.enabled && (
                            <Badge size="xs" color="gray" variant="light">
                              disabled
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{m.totalRuns}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Text
                          fz="0.8125rem"
                          ff="'JetBrains Mono', monospace"
                          fw={600}
                          c={getBarColor(m.successRate)}
                        >
                          {formatPercent(m.successRate)}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {formatPercent(m.avgConfidence)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {formatDuration(m.avgDuration)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Stack>
      )}
    </Stack>
  );
};
