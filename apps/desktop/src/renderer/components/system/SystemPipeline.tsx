/**
 * SystemPipeline — Scenario 4: "Run the full pipeline on a real goal."
 * Chains API calls to simulate the AI engine pipeline with animated steps.
 *
 * @author Subash Karki
 */
import { Badge, Button, Group, Paper, Progress, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useCallback, useState } from 'react';
import {
  CheckCircle2,
  CircleDot,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react';

import { computeStrategyScores } from './strategyScoring';
import type { Complexity, Risk } from './strategyScoring';
import { API_BASE } from '../../lib/api';

type StepStatus = 'pending' | 'running' | 'complete' | 'error';

interface PipelineStep {
  name: string;
  description: string;
  status: StepStatus;
  detail?: string;
  durationMs?: number;
}

const initialSteps: PipelineStep[] = [
  { name: 'Graph Context', description: 'Gathering related files from the code graph', status: 'pending' },
  { name: 'Blast Radius', description: 'Computing change impact and dependents', status: 'pending' },
  { name: 'Assessment', description: 'Evaluating complexity, risk, and ambiguity', status: 'pending' },
  { name: 'Strategy Selection', description: 'Scoring all strategies and picking the best', status: 'pending' },
  { name: 'Result', description: 'Assembling the final pipeline result', status: 'pending' },
];

const statusColor: Record<StepStatus, string> = {
  pending: 'var(--phantom-text-muted)',
  running: 'var(--phantom-accent-cyan)',
  complete: 'var(--phantom-status-success, #22c55e)',
  error: 'var(--phantom-status-danger, #ef4444)',
};

const StatusIcon = ({ status }: { status: StepStatus }) => {
  switch (status) {
    case 'pending':
      return <CircleDot size={14} style={{ color: statusColor.pending }} />;
    case 'running':
      return <Loader2 size={14} style={{ color: statusColor.running, animation: 'spin 1s linear infinite' }} />;
    case 'complete':
      return <CheckCircle2 size={14} style={{ color: statusColor.complete }} />;
    case 'error':
      return <XCircle size={14} style={{ color: statusColor.error }} />;
  }
};

interface Props {
  projectId: string;
}

export const SystemPipeline = ({ projectId }: Props) => {
  const [goal, setGoal] = useState('');
  const [activeFiles, setActiveFiles] = useState('');
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);
  const [running, setRunning] = useState(false);

  const updateStep = useCallback((index: number, update: Partial<PipelineStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...update } : s)));
  }, []);

  const runPipeline = useCallback(async () => {
    if (!goal.trim()) return;
    setRunning(true);
    setSteps(initialSteps.map((s) => ({ ...s, status: 'pending', detail: undefined, durationMs: undefined })));

    const files = activeFiles
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    const primaryFile = files[0] || '';

    // Step 0: Graph Context
    updateStep(0, { status: 'running' });
    let contextFileCount = 0;
    const step0Start = Date.now();
    try {
      if (primaryFile) {
        const res = await fetch(
          `${API_BASE}/api/graph/${encodeURIComponent(projectId)}/context?file=${encodeURIComponent(primaryFile)}`,
        );
        if (res.ok) {
          const data = await res.json();
          const ctxFiles = Array.isArray(data.files) ? data.files : [];
          contextFileCount = ctxFiles.length;
          updateStep(0, {
            status: 'complete',
            detail: `Found ${ctxFiles.length} related file${ctxFiles.length !== 1 ? 's' : ''}`,
            durationMs: Date.now() - step0Start,
          });
        } else {
          updateStep(0, { status: 'complete', detail: 'No context data (API unavailable)', durationMs: Date.now() - step0Start });
        }
      } else {
        updateStep(0, { status: 'complete', detail: 'Skipped — no file specified', durationMs: Date.now() - step0Start });
      }
    } catch {
      updateStep(0, { status: 'error', detail: 'Failed to fetch context', durationMs: Date.now() - step0Start });
    }

    // Step 1: Blast Radius
    updateStep(1, { status: 'running' });
    let blastCount = 0;
    let impactScore = 0;
    const step1Start = Date.now();
    try {
      if (primaryFile) {
        const res = await fetch(
          `${API_BASE}/api/graph/${encodeURIComponent(projectId)}/blast-radius?file=${encodeURIComponent(primaryFile)}`,
        );
        if (res.ok) {
          const data = await res.json();
          const bFiles = Array.isArray(data.files) ? data.files : [];
          blastCount = data.totalAffected ?? bFiles.length;
          impactScore = data.impactScore ?? Math.min(100, blastCount * 2);
          updateStep(1, {
            status: 'complete',
            detail: `${blastCount} affected file${blastCount !== 1 ? 's' : ''}, impact: ${impactScore}%`,
            durationMs: Date.now() - step1Start,
          });
        } else {
          updateStep(1, { status: 'complete', detail: 'No blast data (API unavailable)', durationMs: Date.now() - step1Start });
        }
      } else {
        updateStep(1, { status: 'complete', detail: 'Skipped — no file specified', durationMs: Date.now() - step1Start });
      }
    } catch {
      updateStep(1, { status: 'error', detail: 'Failed to fetch blast radius', durationMs: Date.now() - step1Start });
    }

    // Step 2: Assessment (heuristic from available data)
    updateStep(2, { status: 'running' });
    const step2Start = Date.now();
    let assessedComplexity: Complexity = 'moderate';
    let assessedRisk: Risk = 'medium';
    const assessedAmbiguous = goal.includes('?') || goal.toLowerCase().includes('maybe') || goal.toLowerCase().includes('perhaps');

    if (contextFileCount > 20 || blastCount > 30) {
      assessedComplexity = 'complex';
    } else if (contextFileCount <= 3 && blastCount <= 5) {
      assessedComplexity = 'simple';
    }

    if (impactScore > 70) {
      assessedRisk = 'high';
    } else if (impactScore > 90) {
      assessedRisk = 'critical';
    } else if (impactScore < 20) {
      assessedRisk = 'low';
    }

    updateStep(2, {
      status: 'complete',
      detail: `Complexity: ${assessedComplexity}, Risk: ${assessedRisk}, Ambiguous: ${assessedAmbiguous ? 'yes' : 'no'}`,
      durationMs: Date.now() - step2Start,
    });

    // Step 3: Strategy Selection (client-side)
    updateStep(3, { status: 'running' });
    const step3Start = Date.now();
    const scores = computeStrategyScores({
      complexity: assessedComplexity,
      risk: assessedRisk,
      ambiguous: assessedAmbiguous,
      blastRadius: impactScore,
    });
    const winner = scores[0];
    const runnerUp = scores[1];

    updateStep(3, {
      status: 'complete',
      detail: `Winner: ${winner.name} (${(winner.score * 100).toFixed(0)}%), Runner-up: ${runnerUp.name} (${(runnerUp.score * 100).toFixed(0)}%)`,
      durationMs: Date.now() - step3Start,
    });

    // Step 4: Final Result
    updateStep(4, { status: 'running' });
    const step4Start = Date.now();
    const totalMs = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0) + (Date.now() - step4Start);
    updateStep(4, {
      status: 'complete',
      detail: `Pipeline complete. Strategy: ${winner.name}. Confidence: ${(winner.score * 100).toFixed(0)}%`,
      durationMs: Date.now() - step4Start,
    });

    setRunning(false);
  }, [goal, activeFiles, projectId, updateStep]);

  const completedSteps = steps.filter((s) => s.status === 'complete').length;
  const progressPct = (completedSteps / steps.length) * 100;
  const hasError = steps.some((s) => s.status === 'error');

  return (
    <Stack gap="md">
      <Text fz="0.8rem" c="var(--phantom-text-secondary)">
        Run the full AI engine pipeline on a real goal. Watch each step execute sequentially —
        context gathering, blast radius analysis, assessment, strategy selection, and final result.
      </Text>

      <Textarea
        placeholder="e.g. Refactor the authentication middleware to use JWT tokens"
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

      <Group gap="sm" align="flex-end">
        <TextInput
          flex={1}
          placeholder="src/auth.ts, src/middleware.ts"
          label="Active files (comma-separated)"
          value={activeFiles}
          onChange={(e) => setActiveFiles(e.currentTarget.value)}
          styles={{
            input: {
              backgroundColor: 'var(--phantom-surface-bg)',
              borderColor: 'var(--phantom-border-subtle)',
              color: 'var(--phantom-text-primary)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.8rem',
            },
            label: {
              color: 'var(--phantom-text-secondary)',
              fontSize: '0.7rem',
              marginBottom: 4,
            },
          }}
        />
        <Button
          onClick={runPipeline}
          loading={running}
          disabled={!goal.trim() || running}
          size="sm"
          style={{
            backgroundColor: 'var(--phantom-accent-cyan)',
            color: '#000',
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
          leftSection={running ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
        >
          Run Pipeline
        </Button>
      </Group>

      {/* Progress bar */}
      {(running || completedSteps > 0) && (
        <Progress
          value={progressPct}
          size="xs"
          styles={{
            root: { backgroundColor: 'var(--phantom-surface-elevated, #2a2a2a)' },
            section: {
              backgroundColor: hasError ? 'var(--phantom-status-danger, #ef4444)' : 'var(--phantom-accent-cyan)',
              transition: 'width 300ms ease',
            },
          }}
        />
      )}

      {/* Steps */}
      <Stack gap={4}>
        {steps.map((step, idx) => (
          <Paper
            key={step.name}
            px="sm"
            py={8}
            bg="var(--phantom-surface-card)"
            style={{
              border: `1px solid ${step.status === 'running' ? 'rgba(0, 200, 255, 0.4)' : 'var(--phantom-border-subtle)'}`,
              transition: 'border-color 200ms ease',
            }}
          >
            <Group justify="space-between">
              <Group gap="xs">
                <Text fz="0.65rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace" style={{ width: 16 }}>
                  {idx + 1}
                </Text>
                <StatusIcon status={step.status} />
                <div>
                  <Text fz="0.75rem" fw={600} c={step.status === 'running' ? 'var(--phantom-accent-cyan)' : 'var(--phantom-text-primary)'}>
                    {step.name}
                  </Text>
                  <Text fz="0.65rem" c="var(--phantom-text-muted)">
                    {step.detail ?? step.description}
                  </Text>
                </div>
              </Group>
              <Group gap="xs">
                {step.durationMs !== undefined && (
                  <Badge
                    size="xs"
                    variant="light"
                    style={{
                      backgroundColor: 'rgba(0, 200, 255, 0.08)',
                      color: 'var(--phantom-text-muted)',
                      border: 'none',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {step.durationMs}ms
                  </Badge>
                )}
                {step.status === 'running' && (
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: 'var(--phantom-accent-cyan)',
                      animation: 'pulse 1.5s infinite',
                    }}
                  />
                )}
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
};
