/**
 * SystemPlayground — Interactive simulation of "The System" AI engine
 * Shows how graph context, strategy selection, and pipeline execution work.
 * Main entry point that renders the sidebar scenario picker and dynamic content panel.
 *
 * @author Subash Karki
 */
import { Paper, Stack, Text } from '@mantine/core';
import { useAtomValue } from 'jotai';
import { useState } from 'react';
import {
  Brain,
  FileSearch,
  GitGraph,
  Play,
  Shield,
  Zap,
} from 'lucide-react';

import { activeWorktreeAtom } from '../../atoms/worktrees';
import { SystemBlastRadius } from './SystemBlastRadius';
import { SystemContextExplorer } from './SystemContextExplorer';
import { SystemGuardrails } from './SystemGuardrails';
import { SystemPipeline } from './SystemPipeline';
import { SystemStrategySelector } from './SystemStrategySelector';

type Scenario = 'context' | 'blast' | 'strategy' | 'pipeline' | 'guardrails';

interface ScenarioConfig {
  id: Scenario;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'context',
    label: 'Context',
    icon: <FileSearch size={14} />,
    description: 'Explore file relationships',
  },
  {
    id: 'blast',
    label: 'Blast',
    icon: <Zap size={14} />,
    description: 'Analyze change impact',
  },
  {
    id: 'strategy',
    label: 'Strategy',
    icon: <Brain size={14} />,
    description: 'Pick the right approach',
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    icon: <Play size={14} />,
    description: 'Run the full engine',
  },
  {
    id: 'guardrails',
    label: 'Guardrails',
    icon: <Shield size={14} />,
    description: 'Verify correctness',
  },
];

const ScenarioPanel = ({ scenario, projectId }: { scenario: Scenario; projectId: string }) => {
  switch (scenario) {
    case 'context':
      return <SystemContextExplorer projectId={projectId} />;
    case 'blast':
      return <SystemBlastRadius projectId={projectId} />;
    case 'strategy':
      return <SystemStrategySelector />;
    case 'pipeline':
      return <SystemPipeline projectId={projectId} />;
    case 'guardrails':
      return <SystemGuardrails projectId={projectId} />;
  }
};

export const SystemPlayground = () => {
  const activeWorktree = useAtomValue(activeWorktreeAtom);
  const projectId = activeWorktree?.projectId ?? null;
  const [active, setActive] = useState<Scenario>('context');

  if (!projectId) {
    return (
      <Stack align="center" justify="center" gap="md" py="xl">
        <GitGraph size={40} style={{ color: 'var(--phantom-text-muted)' }} />
        <Text fz="1rem" c="var(--phantom-text-secondary)" ta="center">
          Open a project to use The System Playground.
        </Text>
        <Text fz="0.8rem" c="var(--phantom-text-muted)" ta="center" maw={400}>
          The playground needs an active project with a code graph to explore context,
          blast radius, strategy selection, and more.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md" data-testid="system-playground">
      {/* Header */}
      <div>
        <Text
          fz="1.1rem"
          fw={700}
          c="var(--phantom-text-primary)"
          ff="'Orbitron', sans-serif"
        >
          The System — Playground
        </Text>
        <Text fz="0.8rem" c="var(--phantom-text-muted)">
          Understand how your AI assistant thinks
        </Text>
      </div>

      {/* Two-column layout: Sidebar + Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr',
          gap: 'var(--mantine-spacing-md)',
          alignItems: 'start',
          minHeight: 400,
        }}
      >
        {/* Sidebar — Scenario picker */}
        <Paper
          p="xs"
          bg="var(--phantom-surface-card)"
          style={{ border: '1px solid var(--phantom-border-subtle)' }}
        >
          <Text fz="0.65rem" fw={600} c="var(--phantom-text-muted)" mb="xs" tt="uppercase" ls={0.5}>
            Scenarios
          </Text>
          <Stack gap={2}>
            {SCENARIOS.map((s) => {
              const isActive = s.id === active;
              return (
                <div
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    backgroundColor: isActive ? 'rgba(0, 200, 255, 0.08)' : 'transparent',
                    border: isActive ? '1px solid rgba(0, 200, 255, 0.25)' : '1px solid transparent',
                    transition: 'all 100ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated, #2a2a2a)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: isActive ? 'var(--phantom-accent-cyan)' : 'var(--phantom-text-muted)' }}>
                      {s.icon}
                    </span>
                    <div>
                      <Text
                        fz="0.75rem"
                        fw={isActive ? 600 : 500}
                        c={isActive ? 'var(--phantom-accent-cyan)' : 'var(--phantom-text-primary)'}
                      >
                        {s.label}
                      </Text>
                      <Text fz="0.6rem" c="var(--phantom-text-muted)">
                        {s.description}
                      </Text>
                    </div>
                  </div>
                </div>
              );
            })}
          </Stack>
        </Paper>

        {/* Main panel */}
        <Paper
          p="md"
          bg="var(--phantom-surface-card)"
          style={{ border: '1px solid var(--phantom-border-subtle)', minHeight: 400 }}
        >
          <ScenarioPanel scenario={active} projectId={projectId} />
        </Paper>
      </div>
    </Stack>
  );
};
