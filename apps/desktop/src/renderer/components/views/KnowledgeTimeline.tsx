/**
 * KnowledgeTimeline View
 * Chronological view of AI orchestrator decisions grouped by date
 *
 * @author Subash Karki
 */
import {
  Badge,
  Card,
  Collapse,
  Group,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import {
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';

import { projectsAtom } from '../../atoms/worktrees';
import { fetchApi } from '../../lib/api';
import { ViewHeader } from '../layout/ViewHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineDecision {
  id: string;
  goal: string;
  strategy_id: string;
  strategy_name: string;
  confidence: number | null;
  complexity: string | null;
  risk: string | null;
  duration_ms: number | null;
  created_at: string | number;
  success: number | null;
  evaluation_score: number | null;
  recommendation: string | null;
  failure_reason: string | null;
}

interface TimelineResponse {
  decisions: TimelineDecision[];
  period: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type OutcomeStatus = 'success' | 'refined' | 'failed' | 'pending';

const getOutcomeStatus = (decision: TimelineDecision): OutcomeStatus => {
  if (decision.success === null || decision.success === undefined) return 'pending';
  if (decision.success === 1) return 'success';
  if (decision.failure_reason) return 'failed';
  return 'refined';
};

const STATUS_COLORS: Record<OutcomeStatus, string> = {
  success: 'var(--phantom-status-success, #22c55e)',
  refined: 'var(--phantom-status-warning, #f59e0b)',
  failed: 'var(--phantom-status-danger, #ef4444)',
  pending: 'var(--phantom-text-muted)',
};

const STATUS_LABELS: Record<OutcomeStatus, string> = {
  success: 'Success',
  refined: 'Refined',
  failed: 'Failed',
  pending: 'Pending',
};

const STATUS_BADGE_COLORS: Record<OutcomeStatus, string> = {
  success: 'green',
  refined: 'yellow',
  failed: 'red',
  pending: 'gray',
};

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
};

const formatConfidence = (confidence: number | null): string => {
  if (confidence === null) return '--';
  return `${Math.round(confidence * 100)}%`;
};

const getTimestamp = (createdAt: string | number): number => {
  if (typeof createdAt === 'number') return createdAt;
  return new Date(createdAt).getTime();
};

const getDateGroup = (timestamp: number): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 7 * 86_400_000;

  if (timestamp >= todayStart) return 'Today';
  if (timestamp >= yesterdayStart) return 'Yesterday';
  if (timestamp >= weekStart) return 'This Week';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

// ---------------------------------------------------------------------------
// DecisionCard
// ---------------------------------------------------------------------------

const DecisionCard = ({ decision }: { decision: TimelineDecision }) => {
  const [expanded, setExpanded] = useState(false);
  const status = getOutcomeStatus(decision);
  const timestamp = getTimestamp(decision.created_at);

  return (
    <Card
      p="sm"
      bg="var(--phantom-surface-card)"
      style={{
        border: `0.0625rem solid ${expanded ? STATUS_COLORS[status] : 'var(--phantom-border-subtle)'}`,
        cursor: 'pointer',
        transition: 'border-color 150ms ease',
      }}
      onClick={() => setExpanded((v) => !v)}
      data-testid="decision-card"
    >
      <Group gap="sm" wrap="nowrap">
        {/* Status indicator */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[status],
            flexShrink: 0,
          }}
          aria-label={STATUS_LABELS[status]}
        />

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fz="0.8125rem" fw={500} c="var(--phantom-text-primary)" lineClamp={1}>
            {decision.goal}
          </Text>
          <Group gap="xs" mt={4}>
            <Badge size="xs" color={STATUS_BADGE_COLORS[status]} variant="light">
              {STATUS_LABELS[status]}
            </Badge>
            <Badge size="xs" color="blue" variant="light">
              {decision.strategy_name}
            </Badge>
            {decision.complexity && (
              <Badge size="xs" color="gray" variant="light">
                {decision.complexity}
              </Badge>
            )}
          </Group>
        </div>

        {/* Meta */}
        <Stack gap={2} align="flex-end" style={{ flexShrink: 0 }}>
          <Text fz="0.6875rem" c="var(--phantom-text-muted)">
            {formatTime(timestamp)}
          </Text>
          <Group gap={4}>
            <Clock size={10} style={{ color: 'var(--phantom-text-muted)' }} />
            <Text fz="0.6875rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace">
              {formatDuration(decision.duration_ms)}
            </Text>
          </Group>
        </Stack>

        {/* Expand arrow */}
        {expanded ? (
          <ChevronDown size={14} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />
        ) : (
          <ChevronRight size={14} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />
        )}
      </Group>

      {/* Expanded details */}
      <Collapse in={expanded}>
        <Stack gap="xs" mt="sm" pt="sm" style={{ borderTop: '1px solid var(--phantom-border-subtle)' }}>
          <Group gap="lg">
            <div>
              <Text fz="0.6875rem" c="var(--phantom-text-muted)" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                Confidence
              </Text>
              <Text fz="0.8125rem" fw={600} c="var(--phantom-text-primary)" ff="'JetBrains Mono', monospace">
                {formatConfidence(decision.confidence)}
              </Text>
            </div>
            <div>
              <Text fz="0.6875rem" c="var(--phantom-text-muted)" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                Strategy
              </Text>
              <Text fz="0.8125rem" fw={600} c="var(--phantom-text-primary)">
                {decision.strategy_name}
              </Text>
            </div>
            {decision.risk && (
              <div>
                <Text fz="0.6875rem" c="var(--phantom-text-muted)" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                  Risk
                </Text>
                <Text fz="0.8125rem" fw={600} c="var(--phantom-text-primary)">
                  {decision.risk}
                </Text>
              </div>
            )}
            {decision.evaluation_score !== null && (
              <div>
                <Text fz="0.6875rem" c="var(--phantom-text-muted)" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                  Eval Score
                </Text>
                <Text fz="0.8125rem" fw={600} c="var(--phantom-text-primary)" ff="'JetBrains Mono', monospace">
                  {typeof decision.evaluation_score === 'number'
                    ? `${Math.round(decision.evaluation_score * 100)}%`
                    : '--'}
                </Text>
              </div>
            )}
          </Group>

          {decision.recommendation && (
            <div>
              <Text fz="0.6875rem" c="var(--phantom-text-muted)" tt="uppercase" mb={2} style={{ letterSpacing: '0.05em' }}>
                Recommendation
              </Text>
              <Text fz="0.75rem" c="var(--phantom-text-secondary)" lh={1.4}>
                {decision.recommendation}
              </Text>
            </div>
          )}

          {decision.failure_reason && (
            <div>
              <Text fz="0.6875rem" c="var(--phantom-status-danger, #ef4444)" tt="uppercase" mb={2} style={{ letterSpacing: '0.05em' }}>
                Failure Reason
              </Text>
              <Text fz="0.75rem" c="var(--phantom-text-secondary)" lh={1.4}>
                {decision.failure_reason}
              </Text>
            </div>
          )}
        </Stack>
      </Collapse>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KnowledgeTimeline = () => {
  const projects = useAtomValue(projectsAtom);
  const [decisions, setDecisions] = useState<TimelineDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (projects.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch timeline for all projects and merge
      const results = await Promise.allSettled(
        projects.map((p) =>
          fetchApi<TimelineResponse>(`/api/orchestrator/${encodeURIComponent(p.id)}/timeline?days=30&limit=50`),
        ),
      );

      const allDecisions: TimelineDecision[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allDecisions.push(...result.value.decisions);
        }
      }

      // Sort chronologically (newest first)
      allDecisions.sort((a, b) => getTimestamp(b.created_at) - getTimestamp(a.created_at));
      setDecisions(allDecisions);
    } catch {
      setError('Failed to load timeline data');
    } finally {
      setLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Group decisions by date
  const grouped = useMemo(() => {
    const groups = new Map<string, TimelineDecision[]>();
    for (const d of decisions) {
      const ts = getTimestamp(d.created_at);
      const group = getDateGroup(ts);
      const list = groups.get(group) ?? [];
      list.push(d);
      groups.set(group, list);
    }
    return Array.from(groups.entries());
  }, [decisions]);

  return (
    <Stack gap="lg">
      <ViewHeader
        title="Knowledge Timeline"
        icon={<Brain size={20} />}
        subtitle="AI orchestrator decisions"
      />

      {loading ? (
        <Stack gap="sm">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h="4.5rem" radius="sm" />
          ))}
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
      ) : decisions.length === 0 ? (
        <Card
          p="xl"
          bg="var(--phantom-surface-card)"
          style={{ border: '0.0625rem solid var(--phantom-border-subtle)', textAlign: 'center' }}
        >
          <Stack align="center" gap="sm">
            <Brain size={32} style={{ color: 'var(--phantom-text-muted)', opacity: 0.5 }} />
            <Text fz="0.875rem" fw={500} c="var(--phantom-text-primary)">
              No decisions recorded yet
            </Text>
            <Text fz="0.8125rem" c="var(--phantom-text-muted)" maw={400}>
              Process goals through the orchestrator to see AI decisions, strategy choices, and outcomes appear here.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="md">
          {/* Summary stats */}
          <Group gap="lg">
            <Group gap={4}>
              <CheckCircle size={14} style={{ color: 'var(--phantom-status-success, #22c55e)' }} />
              <Text fz="0.75rem" c="var(--phantom-text-secondary)">
                {decisions.filter((d) => getOutcomeStatus(d) === 'success').length} succeeded
              </Text>
            </Group>
            <Group gap={4}>
              <RefreshCw size={14} style={{ color: 'var(--phantom-status-warning, #f59e0b)' }} />
              <Text fz="0.75rem" c="var(--phantom-text-secondary)">
                {decisions.filter((d) => getOutcomeStatus(d) === 'refined').length} refined
              </Text>
            </Group>
            <Group gap={4}>
              <XCircle size={14} style={{ color: 'var(--phantom-status-danger, #ef4444)' }} />
              <Text fz="0.75rem" c="var(--phantom-text-secondary)">
                {decisions.filter((d) => getOutcomeStatus(d) === 'failed').length} failed
              </Text>
            </Group>
          </Group>

          {/* Grouped decisions */}
          {grouped.map(([dateGroup, items]) => (
            <Stack key={dateGroup} gap="xs">
              <Text
                ff="Orbitron, sans-serif"
                fz="0.75rem"
                fw={700}
                c="var(--phantom-text-secondary)"
                tt="uppercase"
                style={{ letterSpacing: '0.05em' }}
              >
                {dateGroup}
              </Text>
              {items.map((decision) => (
                <DecisionCard key={decision.id} decision={decision} />
              ))}
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
};
