/**
 * ModelBreakdown -- Donut chart showing session/token/cost breakdown by model
 * Uses recharts for the pie visualization with a center label.
 *
 * @author Subash Karki
 */
import { useMemo } from 'react';
import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface ModelBreakdownEntry {
  model: string;
  sessions: number;
  tokens: number;
  cost: number;
}

export interface ModelBreakdownProps {
  data: ModelBreakdownEntry[];
}

const MODEL_COLORS: Record<string, string> = {
  opus: '#a855f7',
  sonnet: '#3b82f6',
  haiku: '#22c55e',
};

const DEFAULT_COLOR = '#6b7280';

function getModelColor(model: string): string {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return DEFAULT_COLOR;
}

function getModelDisplayName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return model;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ModelBreakdownEntry }>;
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div
      style={{
        background: 'var(--phantom-surface-elevated)',
        border: '1px solid var(--phantom-border-subtle)',
        borderRadius: 6,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <Text fz="sm" fw={600} c="var(--phantom-text-primary)">
        {getModelDisplayName(entry.model)}
      </Text>
      <Text fz="xs" c="var(--phantom-text-secondary)">
        {entry.sessions} sessions &middot; {(entry.tokens / 1000).toFixed(1)}K tokens
      </Text>
    </div>
  );
};

export const ModelBreakdown = ({ data }: ModelBreakdownProps) => {
  const totalSessions = useMemo(
    () => data.reduce((sum, d) => sum + d.sessions, 0),
    [data],
  );

  const chartData = useMemo(
    () =>
      data.map((entry) => ({
        ...entry,
        displayName: getModelDisplayName(entry.model),
        color: getModelColor(entry.model),
      })),
    [data],
  );

  const isEmpty = data.length === 0;

  return (
    <Paper
      p="md"
      bg="var(--phantom-surface-card)"
      radius="md"
      style={{ border: '1px solid var(--phantom-border-subtle)' }}
    >
      <Stack gap="md">
        <Group gap="xs">
          <PieChartIcon size={18} color="var(--phantom-accent-glow)" />
          <Title order={4} c="var(--phantom-text-primary)">
            Model Usage
          </Title>
        </Group>

        {isEmpty ? (
          <Text fz="sm" c="var(--phantom-text-muted)" ta="center" py="xl">
            No model data available yet.
          </Text>
        ) : (
          <>
            <div style={{ position: 'relative', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="sessions"
                    nameKey="displayName"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Center label */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <Text
                  ff="'Orbitron', sans-serif"
                  fz="1.5rem"
                  fw={700}
                  c="var(--phantom-text-primary)"
                  lh={1}
                >
                  {totalSessions}
                </Text>
                <Text fz="xs" c="var(--phantom-text-muted)">
                  sessions
                </Text>
              </div>
            </div>

            {/* Legend */}
            <Group gap="lg" justify="center">
              {chartData.map((entry) => (
                <Group key={entry.model} gap={6}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: entry.color,
                      flexShrink: 0,
                    }}
                  />
                  <Text fz="sm" c="var(--phantom-text-secondary)">
                    {entry.displayName}
                  </Text>
                  <Text fz="sm" fw={600} c="var(--phantom-text-primary)" ff="'Orbitron', sans-serif">
                    {entry.sessions}
                  </Text>
                </Group>
              ))}
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
};
