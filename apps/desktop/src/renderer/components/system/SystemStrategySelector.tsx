/**
 * SystemStrategySelector — Scenario 3: "Type a goal, see which strategy The System would pick."
 * Entirely client-side scoring with real-time slider updates.
 *
 * @author Subash Karki
 */
import { Badge, Group, Paper, Progress, SegmentedControl, Stack, Switch, Text, Textarea } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Brain, Crown, Sliders } from 'lucide-react';

import {
  type Complexity,
  type Risk,
  type StrategyInput,
  computeStrategyScores,
} from './strategyScoring';

const COMPLEXITY_OPTIONS: { label: string; value: Complexity }[] = [
  { label: 'Simple', value: 'simple' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Complex', value: 'complex' },
  { label: 'Critical', value: 'critical' },
];

const RISK_OPTIONS: { label: string; value: Risk }[] = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

const strategyIcon: Record<string, string> = {
  'Direct': '>>',
  'Advisor': '?!',
  'Self-Refine': '<>',
  'Tree of Thought': '/\\',
  'Debate': '><',
  'Graph of Thought': '{}',
};

const scoreBarColor = (score: number, isWinner: boolean): string => {
  if (isWinner) return 'var(--phantom-accent-cyan)';
  if (score >= 0.7) return 'var(--phantom-status-success, #22c55e)';
  if (score >= 0.4) return 'var(--phantom-status-warning, #f59e0b)';
  return 'var(--phantom-text-muted)';
};

export const SystemStrategySelector = () => {
  const [goal, setGoal] = useState('');
  const [complexity, setComplexity] = useState<Complexity>('moderate');
  const [risk, setRisk] = useState<Risk>('medium');
  const [ambiguous, setAmbiguous] = useState(false);
  const [blastRadius, setBlastRadius] = useState(30);

  const input: StrategyInput = useMemo(() => ({
    complexity,
    risk,
    ambiguous,
    blastRadius,
  }), [complexity, risk, ambiguous, blastRadius]);

  const scores = useMemo(() => computeStrategyScores(input), [input]);
  const winner = scores[0];

  const segmentStyles = {
    root: {
      backgroundColor: 'var(--phantom-surface-bg)',
      border: '1px solid var(--phantom-border-subtle)',
    },
    label: {
      fontSize: '0.7rem',
      color: 'var(--phantom-text-secondary)',
      padding: '4px 10px',
    },
    indicator: {
      backgroundColor: 'var(--phantom-accent-cyan)',
    },
  };

  return (
    <Stack gap="md">
      <Text fz="0.8rem" c="var(--phantom-text-secondary)">
        Type a goal and adjust the parameters. The System evaluates all 6 strategies in real-time
        and picks the best approach. No API call needed — scoring is computed client-side.
      </Text>

      {/* Goal input */}
      <Textarea
        placeholder="e.g. Add error handling to auth middleware"
        label="Goal"
        value={goal}
        onChange={(e) => setGoal(e.currentTarget.value)}
        minRows={2}
        maxRows={4}
        autosize
        styles={{
          input: {
            backgroundColor: 'var(--phantom-surface-bg)',
            borderColor: 'var(--phantom-border-subtle)',
            color: 'var(--phantom-text-primary)',
            fontSize: '0.8rem',
          },
          label: {
            color: 'var(--phantom-text-secondary)',
            fontSize: '0.7rem',
            marginBottom: 4,
          },
        }}
      />

      {/* Controls */}
      <Paper p="sm" bg="var(--phantom-surface-card)" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
        <Group gap="xs" mb="sm">
          <Sliders size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
          <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">Parameters</Text>
        </Group>

        <Stack gap="sm">
          <div>
            <Text fz="0.7rem" c="var(--phantom-text-secondary)" mb={4}>Complexity</Text>
            <SegmentedControl
              fullWidth
              size="xs"
              data={COMPLEXITY_OPTIONS}
              value={complexity}
              onChange={(v) => setComplexity(v as Complexity)}
              styles={segmentStyles}
            />
          </div>

          <div>
            <Text fz="0.7rem" c="var(--phantom-text-secondary)" mb={4}>Risk</Text>
            <SegmentedControl
              fullWidth
              size="xs"
              data={RISK_OPTIONS}
              value={risk}
              onChange={(v) => setRisk(v as Risk)}
              styles={segmentStyles}
            />
          </div>

          <Group justify="space-between">
            <div>
              <Text fz="0.7rem" c="var(--phantom-text-secondary)" mb={4}>Ambiguous</Text>
              <Switch
                checked={ambiguous}
                onChange={(e) => setAmbiguous(e.currentTarget.checked)}
                size="sm"
                styles={{
                  track: {
                    backgroundColor: ambiguous ? 'var(--phantom-accent-cyan)' : 'var(--phantom-surface-elevated, #2a2a2a)',
                    borderColor: 'var(--phantom-border-subtle)',
                  },
                }}
              />
            </div>
            <div style={{ flex: 1, maxWidth: 200 }}>
              <Group justify="space-between" mb={4}>
                <Text fz="0.7rem" c="var(--phantom-text-secondary)">Blast Radius</Text>
                <Text fz="0.7rem" c="var(--phantom-accent-cyan)" ff="'JetBrains Mono', monospace" fw={600}>
                  {blastRadius}%
                </Text>
              </Group>
              <input
                type="range"
                min={0}
                max={100}
                value={blastRadius}
                onChange={(e) => setBlastRadius(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--phantom-accent-cyan)',
                  height: 4,
                }}
              />
            </div>
          </Group>
        </Stack>
      </Paper>

      {/* Strategy Scoreboard */}
      <Paper p="sm" bg="var(--phantom-surface-card)" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
        <Group gap="xs" mb="sm">
          <Brain size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
          <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">Strategy Scoreboard</Text>
        </Group>

        <Stack gap={8}>
          {scores.map((s, idx) => {
            const isWinner = idx === 0;
            return (
              <div key={s.name}>
                <Group justify="space-between" mb={3}>
                  <Group gap={6}>
                    <Text fz="0.65rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace" style={{ width: 18, textAlign: 'center' }}>
                      {strategyIcon[s.name] ?? '??'}
                    </Text>
                    <Text
                      fz="0.75rem"
                      fw={isWinner ? 700 : 500}
                      c={isWinner ? 'var(--phantom-accent-cyan)' : 'var(--phantom-text-primary)'}
                    >
                      {s.name}
                    </Text>
                    {isWinner && (
                      <Badge
                        size="xs"
                        variant="light"
                        leftSection={<Crown size={10} />}
                        style={{
                          backgroundColor: 'rgba(0, 200, 255, 0.12)',
                          color: 'var(--phantom-accent-cyan)',
                          border: '1px solid rgba(0, 200, 255, 0.3)',
                        }}
                      >
                        Winner
                      </Badge>
                    )}
                  </Group>
                  <Text
                    fz="0.73rem"
                    fw={700}
                    c={scoreBarColor(s.score, isWinner)}
                    ff="'JetBrains Mono', monospace"
                  >
                    {(s.score * 100).toFixed(0)}%
                  </Text>
                </Group>
                <Progress
                  value={s.score * 100}
                  size="sm"
                  styles={{
                    root: { backgroundColor: 'var(--phantom-surface-elevated, #2a2a2a)' },
                    section: {
                      backgroundColor: scoreBarColor(s.score, isWinner),
                      transition: 'width 200ms ease',
                    },
                  }}
                />
                <Text fz="0.65rem" c="var(--phantom-text-muted)" mt={2}>
                  {s.reason}
                </Text>
              </div>
            );
          })}
        </Stack>
      </Paper>

      {/* Winner summary */}
      {winner && (
        <Paper
          p="sm"
          style={{
            border: '1px solid rgba(0, 200, 255, 0.3)',
            backgroundColor: 'rgba(0, 200, 255, 0.04)',
          }}
        >
          <Group gap="xs">
            <Crown size={14} style={{ color: 'var(--phantom-accent-cyan)' }} />
            <Text fz="0.75rem" fw={600} c="var(--phantom-accent-cyan)">
              Recommended: {winner.name}
            </Text>
          </Group>
          <Text fz="0.73rem" c="var(--phantom-text-secondary)" mt={4}>
            {winner.reason}
          </Text>
          {goal.trim() && (
            <Text fz="0.7rem" c="var(--phantom-text-muted)" mt={4} fs="italic">
              For goal: &quot;{goal.trim().slice(0, 80)}{goal.trim().length > 80 ? '...' : ''}&quot;
            </Text>
          )}
        </Paper>
      )}
    </Stack>
  );
};
