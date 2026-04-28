/**
 * EvolutionDashboard View
 * Shows AI engine learning trajectory: knowledge health, threshold drift,
 * strategy evolution trends, pattern discovery, gap alerts, and cross-project insights.
 *
 * @author Subash Karki
 */
import {
  Alert,
  Badge,
  Card,
  Group,
  RingProgress,
  Skeleton,
  Stack,
  Table,
  Text,
  Timeline,
} from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Brain,
  Globe,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';

import { projectsAtom } from '../../atoms/worktrees';
import { fetchApi } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvolutionHealth {
  totalDecisions: number;
  activePatterns: number;
  deprecatedPatterns: number;
  avgSuccessRate: number;
  staleDecisions: number;
  healthScore: number;
}

interface EvolutionThresholds {
  current: Record<string, number>;
  defaults: Record<string, number>;
  driftPercent: number;
}

interface StrategyTrend {
  strategyId: string;
  date: string;
  successRate: number;
}

interface PatternEntry {
  strategyId: string;
  complexity: string;
  risk: string;
  successRate: number;
  discoveredAt: string;
  status: string;
}

interface GapAlert {
  complexity: string;
  risk: string;
  bestStrategy: string;
  bestRate: number;
  severity: string;
}

interface GlobalPattern {
  strategyId: string;
  complexity: string;
  projectCount: number;
  successRate: number;
}

interface EvolutionData {
  health: EvolutionHealth;
  thresholds: EvolutionThresholds;
  strategyTrends: StrategyTrend[];
  patterns: PatternEntry[];
  gaps: GapAlert[];
  globalPatterns: GlobalPattern[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const healthColor = (score: number): string => {
  if (score > 70) return 'var(--phantom-status-success, #22c55e)';
  if (score > 40) return 'var(--phantom-status-warning, #f59e0b)';
  return 'var(--phantom-status-danger, #ef4444)';
};

const driftColor = (pct: number): string => {
  if (pct <= 20) return 'var(--phantom-status-success, #22c55e)';
  if (pct <= 50) return 'var(--phantom-status-warning, #f59e0b)';
  return 'var(--phantom-status-danger, #ef4444)';
};

const STRATEGY_COLORS = ['#22c55e', '#00d4ff', '#f59e0b', '#a855f7', '#ec4899', '#f97316'];

const formatPercent = (rate: number): string => `${Math.round(rate * 100)}%`;

const formatDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const timeAgo = (iso: string): string => {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

const TrendTooltip = ({ active, payload, label }: any) => {
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
      {payload.map((entry: any, i: number) => (
        <Text key={i} fz="0.6875rem" c={entry.color}>
          {entry.name}: {formatPercent(entry.value)}
        </Text>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EvolutionDashboard = () => {
  const projects = useAtomValue(projectsAtom);
  const [data, setData] = useState<EvolutionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvolution = useCallback(async () => {
    if (projects.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch evolution data from all projects, merge
      const results = await Promise.allSettled(
        projects.map((p) =>
          fetchApi<EvolutionData>(`/api/orchestrator/${encodeURIComponent(p.id)}/evolution`),
        ),
      );

      // Use first successful result as base, merge others
      let merged: EvolutionData | null = null;
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const d = r.value;
        if (!merged) {
          merged = d;
          continue;
        }
        // Merge health
        merged.health.totalDecisions += d.health.totalDecisions;
        merged.health.activePatterns += d.health.activePatterns;
        merged.health.staleDecisions += d.health.staleDecisions;
        merged.health.healthScore = Math.round(
          (merged.health.healthScore + d.health.healthScore) / 2,
        );
        merged.health.avgSuccessRate = (merged.health.avgSuccessRate + d.health.avgSuccessRate) / 2;
        // Merge arrays
        merged.strategyTrends.push(...d.strategyTrends);
        merged.patterns.push(...d.patterns);
        merged.gaps.push(...d.gaps);
        merged.globalPatterns.push(...d.globalPatterns);
      }

      setData(merged);
    } catch {
      setError('Failed to load evolution data');
    } finally {
      setLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    fetchEvolution();
  }, [fetchEvolution]);

  // Build line chart data: pivot strategyTrends into { date, strategy1, strategy2, ... }
  const chartData = useMemo(() => {
    if (!data?.strategyTrends.length) return [];
    const dateMap = new Map<string, Record<string, number>>();
    for (const t of data.strategyTrends) {
      const existing = dateMap.get(t.date) ?? {};
      existing[t.strategyId] = t.successRate;
      dateMap.set(t.date, existing);
    }
    return [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date: formatDate(date), ...values }));
  }, [data]);

  const strategyIds = useMemo(() => {
    if (!data?.strategyTrends.length) return [];
    return [...new Set(data.strategyTrends.map((t) => t.strategyId))];
  }, [data]);

  const hasEnoughData = (data?.health.totalDecisions ?? 0) >= 10;

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Evolution Dashboard"
        icon={<Brain size={20} />}
        subtitle="AI engine learning trajectory"
      />

      {loading ? (
        <Stack gap="md">
          <Skeleton h="12rem" radius="sm" />
          <Skeleton h="10rem" radius="sm" />
          <Skeleton h="8rem" radius="sm" />
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
            <Brain size={32} style={{ color: 'var(--phantom-text-muted)', opacity: 0.5 }} />
            <Text fz="0.875rem" fw={500} c="var(--phantom-text-primary)">
              Not enough data yet
            </Text>
            <Text fz="0.8125rem" c="var(--phantom-text-muted)" maw={400}>
              Run 10+ orchestrator goals to see the AI engine's learning trajectory.
              Currently {data?.health.totalDecisions ?? 0} decision{(data?.health.totalDecisions ?? 0) !== 1 ? 's' : ''} recorded.
            </Text>
          </Stack>
        </Card>
      ) : data ? (
        <Stack gap="md">
          {/* ── Knowledge Health Gauge ─────────────────────────────────── */}
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
              Knowledge Health
            </Text>
            <Group align="center" gap="xl">
              <div style={{ position: 'relative' }}>
                <RingProgress
                  size={140}
                  thickness={12}
                  roundCaps
                  sections={[
                    { value: data.health.healthScore, color: healthColor(data.health.healthScore) },
                  ]}
                  label={
                    <Stack align="center" gap={0}>
                      <Text fz="1.5rem" fw={800} c="var(--phantom-text-primary)" ff="'JetBrains Mono', monospace">
                        {data.health.healthScore}
                      </Text>
                      <Text fz="0.6rem" c="var(--phantom-text-muted)">HEALTH</Text>
                    </Stack>
                  }
                />
                <div style={{ position: 'absolute', top: 4, right: 4 }}>
                  {data.health.avgSuccessRate >= 0.5 ? (
                    <TrendingUp size={14} style={{ color: 'var(--phantom-status-success, #22c55e)' }} />
                  ) : (
                    <TrendingDown size={14} style={{ color: 'var(--phantom-status-danger, #ef4444)' }} />
                  )}
                </div>
              </div>
              <Stack gap="xs" style={{ flex: 1 }}>
                {[
                  { label: 'Total Decisions', value: String(data.health.totalDecisions) },
                  { label: 'Active Patterns', value: String(data.health.activePatterns) },
                  { label: 'Success Rate', value: formatPercent(data.health.avgSuccessRate) },
                  { label: 'Stale Decisions', value: String(data.health.staleDecisions) },
                ].map((row) => (
                  <Group key={row.label} justify="space-between">
                    <Text fz="0.75rem" c="var(--phantom-text-secondary)">{row.label}</Text>
                    <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)" ff="'JetBrains Mono', monospace">
                      {row.value}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Group>
          </Card>

          {/* ── Threshold Drift ────────────────────────────────────────── */}
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
              Threshold Drift
            </Text>
            {data.thresholds.driftPercent === 0 ? (
              <Text fz="0.8125rem" c="var(--phantom-text-muted)" fs="italic">
                No auto-tuning active yet. Thresholds at defaults.
              </Text>
            ) : (
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
                    <Table.Th>Threshold</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Default</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Current</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Drift</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Object.keys(data.thresholds.defaults).map((key) => {
                    const def = data.thresholds.defaults[key];
                    const cur = data.thresholds.current[key] ?? def;
                    const drift = def > 0 ? Math.abs((cur - def) / def) * 100 : 0;
                    return (
                      <Table.Tr key={key}>
                        <Table.Td>{key}</Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>{def.toFixed(2)}</Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>{cur.toFixed(2)}</Table.Td>
                        <Table.Td style={{ textAlign: 'right', color: driftColor(drift) }}>
                          {drift.toFixed(0)}%
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Card>

          {/* ── Strategy Evolution Chart ───────────────────────────────── */}
          {chartData.length > 1 && (
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
                Strategy Evolution (7 days)
              </Text>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--phantom-text-muted)', fontSize: 11 }}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tick={{ fill: 'var(--phantom-text-muted)', fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  {strategyIds.map((sid, i) => (
                    <Line
                      key={sid}
                      type="monotone"
                      dataKey={sid}
                      name={sid}
                      stroke={STRATEGY_COLORS[i % STRATEGY_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* ── Pattern Discovery Timeline ─────────────────────────────── */}
          {data.patterns.length > 0 && (
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
                Pattern Discovery
              </Text>
              <Timeline
                active={data.patterns.length - 1}
                bulletSize={20}
                lineWidth={2}
                color="cyan"
              >
                {data.patterns.slice(0, 10).map((p, i) => (
                  <Timeline.Item
                    key={`${p.strategyId}-${p.complexity}-${i}`}
                    bullet={<Zap size={10} />}
                    title={
                      <Group gap="xs">
                        <Text fz="0.8125rem" fw={500} c="var(--phantom-text-primary)">
                          {p.strategyId}
                        </Text>
                        <Badge
                          size="xs"
                          color={p.status === 'active' ? 'green' : 'yellow'}
                          variant="light"
                        >
                          {p.status}
                        </Badge>
                      </Group>
                    }
                  >
                    <Group gap="xs">
                      <Text fz="0.75rem" c="var(--phantom-text-secondary)">
                        {p.complexity} complexity
                      </Text>
                      <Text fz="0.75rem" c="var(--phantom-text-muted)">|</Text>
                      <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)" ff="'JetBrains Mono', monospace">
                        {formatPercent(p.successRate)} success
                      </Text>
                    </Group>
                    <Text fz="0.6875rem" c="var(--phantom-text-muted)">
                      {timeAgo(p.discoveredAt)}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            </Card>
          )}

          {/* ── Gap Alerts ─────────────────────────────────────────────── */}
          {data.gaps.length > 0 && (
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
                Gap Alerts
              </Text>
              <Stack gap="sm">
                {data.gaps.map((gap, i) => (
                  <Alert
                    key={`${gap.complexity}-${gap.risk}-${i}`}
                    color={gap.severity === 'critical' ? 'red' : 'yellow'}
                    variant="light"
                    icon={<AlertTriangle size={16} />}
                    title={
                      <Text fz="0.8125rem" fw={600}>
                        Low performance: {gap.complexity} tasks
                      </Text>
                    }
                  >
                    <Text fz="0.75rem" c="var(--phantom-text-secondary)">
                      Best strategy <strong>{gap.bestStrategy}</strong> only achieves{' '}
                      <Text span fw={600} c={gap.severity === 'critical' ? 'var(--phantom-status-danger)' : 'var(--phantom-status-warning)'}>
                        {formatPercent(gap.bestRate)}
                      </Text>{' '}
                      success rate.
                    </Text>
                  </Alert>
                ))}
              </Stack>
            </Card>
          )}

          {/* ── Cross-Project Insights ─────────────────────────────────── */}
          {data.globalPatterns.length > 0 && (
            <Card
              p="md"
              bg="var(--phantom-surface-card)"
              style={{ border: '0.0625rem solid var(--phantom-border-subtle)' }}
            >
              <Group gap="xs" mb="sm">
                <Globe size={14} style={{ color: 'var(--phantom-accent-cyan)' }} />
                <Text
                  ff="Orbitron, sans-serif"
                  fz="0.75rem"
                  fw={700}
                  c="var(--phantom-text-secondary)"
                  tt="uppercase"
                  style={{ letterSpacing: '0.05em' }}
                >
                  Cross-Project Insights
                </Text>
              </Group>
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
                    <Table.Th>Complexity</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Projects</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Success Rate</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.globalPatterns.map((gp, i) => (
                    <Table.Tr key={`${gp.strategyId}-${gp.complexity}-${i}`}>
                      <Table.Td>{gp.strategyId}</Table.Td>
                      <Table.Td>{gp.complexity}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Badge size="sm" variant="light" color="cyan">
                          {gp.projectCount}
                        </Badge>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {formatPercent(gp.successRate)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          )}
        </Stack>
      ) : null}
    </Stack>
  );
};
