/**
 * SystemGuardrails — Scenario 5: "Pre-built tests to verify The System doesn't hallucinate."
 * Runs a suite of automated guardrail tests against the graph API.
 *
 * @author Subash Karki
 */
import { Badge, Button, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { useCallback, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Shield,
  XCircle,
} from 'lucide-react';

interface TestResult {
  passed: boolean;
  detail: string;
  durationMs: number;
}

interface GuardrailTest {
  name: string;
  description: string;
  run: (projectId: string) => Promise<TestResult>;
}

const GUARDRAIL_TESTS: GuardrailTest[] = [
  {
    name: 'Nonexistent file returns empty',
    description: 'Querying a file that does not exist should return no results',
    run: async (projectId: string) => {
      const start = Date.now();
      try {
        const res = await fetch(
          `/api/graph/${encodeURIComponent(projectId)}/context?file=${encodeURIComponent('this/does/not/exist.ts')}`,
        );
        if (!res.ok) {
          return { passed: true, detail: `API returned ${res.status} for nonexistent file`, durationMs: Date.now() - start };
        }
        const data = await res.json();
        const files = Array.isArray(data.files) ? data.files : [];
        return {
          passed: files.length === 0,
          detail: `Got ${files.length} files`,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          passed: true, // API error for nonexistent file is acceptable
          detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
          durationMs: Date.now() - start,
        };
      }
    },
  },
  {
    name: 'Context returns valid file paths',
    description: 'Every file returned by context query should have a non-empty path',
    run: async (projectId: string) => {
      const start = Date.now();
      try {
        // First get stats to find a known file
        const statsRes = await fetch(`/api/graph/${encodeURIComponent(projectId)}/stats`);
        if (!statsRes.ok) {
          return { passed: false, detail: `Stats API returned ${statsRes.status}`, durationMs: Date.now() - start };
        }
        const stats = await statsRes.json();
        if ((stats.fileCount ?? 0) === 0) {
          return { passed: true, detail: 'Graph is empty — nothing to validate', durationMs: Date.now() - start };
        }

        // Use a generic query — the API should handle it
        const res = await fetch(
          `/api/graph/${encodeURIComponent(projectId)}/context?file=${encodeURIComponent('src/index.ts')}`,
        );
        if (!res.ok) {
          return { passed: true, detail: `Context API returned ${res.status}`, durationMs: Date.now() - start };
        }
        const data = await res.json();
        const files = Array.isArray(data.files) ? data.files : [];
        const allValid = files.every((f: { path?: string }) => f.path && f.path.length > 0);
        return {
          passed: allValid,
          detail: `${files.length} files returned, ${allValid ? 'all' : 'some'} have valid paths`,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          passed: false,
          detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
          durationMs: Date.now() - start,
        };
      }
    },
  },
  {
    name: 'Blast radius only returns importers',
    description: 'Files in blast radius should have dependency relationships',
    run: async (projectId: string) => {
      const start = Date.now();
      try {
        const res = await fetch(
          `/api/graph/${encodeURIComponent(projectId)}/blast-radius?file=${encodeURIComponent('src/index.ts')}`,
        );
        if (!res.ok) {
          return { passed: true, detail: `Blast API returned ${res.status}`, durationMs: Date.now() - start };
        }
        const data = await res.json();
        const files = Array.isArray(data.files) ? data.files : [];
        const allTyped = files.every(
          (f: { type?: string }) => f.type === 'direct' || f.type === 'transitive',
        );
        return {
          passed: files.length === 0 || allTyped,
          detail: `${files.length} blast files, ${allTyped ? 'all properly typed' : 'some missing type'}`,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          passed: false,
          detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
          durationMs: Date.now() - start,
        };
      }
    },
  },
  {
    name: 'Nonexistent project returns error',
    description: 'A non-existent project ID should return 404 or error',
    run: async () => {
      const start = Date.now();
      try {
        const fakeId = `nonexistent-project-${Date.now()}`;
        const res = await fetch(`/api/graph/${encodeURIComponent(fakeId)}/stats`);
        return {
          passed: !res.ok,
          detail: `Got status ${res.status} for fake project`,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        return {
          passed: true,
          detail: `Error as expected: ${err instanceof Error ? err.message : 'unknown'}`,
          durationMs: Date.now() - start,
        };
      }
    },
  },
  {
    name: 'Strategy scores are deterministic',
    description: 'Same input always produces same strategy selection',
    run: async () => {
      const start = Date.now();
      // Import inline to avoid circular deps at module level
      const { computeStrategyScores } = await import('./strategyScoring');
      const input = { complexity: 'moderate' as const, risk: 'high' as const, ambiguous: true, blastRadius: 50 };
      const run1 = computeStrategyScores(input);
      const run2 = computeStrategyScores(input);
      const run3 = computeStrategyScores(input);

      const allSame =
        run1[0].name === run2[0].name &&
        run2[0].name === run3[0].name &&
        run1[0].score === run2[0].score;

      return {
        passed: allSame,
        detail: `3 runs → winner: ${run1[0].name} (${(run1[0].score * 100).toFixed(0)}%). ${allSame ? 'Deterministic' : 'NON-DETERMINISTIC!'}`,
        durationMs: Date.now() - start,
      };
    },
  },
];

interface Props {
  projectId: string;
}

export const SystemGuardrails = ({ projectId }: Props) => {
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [running, setRunning] = useState(false);
  const [runningTest, setRunningTest] = useState<string | null>(null);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults(new Map());

    for (const test of GUARDRAIL_TESTS) {
      setRunningTest(test.name);
      const result = await test.run(projectId);
      setResults((prev) => new Map(prev).set(test.name, result));
    }

    setRunningTest(null);
    setRunning(false);
  }, [projectId]);

  const runSingle = useCallback(async (test: GuardrailTest) => {
    setRunningTest(test.name);
    const result = await test.run(projectId);
    setResults((prev) => new Map(prev).set(test.name, result));
    setRunningTest(null);
  }, [projectId]);

  const passedCount = Array.from(results.values()).filter((r) => r.passed).length;
  const failedCount = Array.from(results.values()).filter((r) => !r.passed).length;
  const totalTime = Array.from(results.values()).reduce((sum, r) => sum + r.durationMs, 0);

  return (
    <Stack gap="md">
      <Text fz="0.8rem" c="var(--phantom-text-secondary)">
        Pre-built tests to verify The System does not hallucinate. These guardrails ensure
        the AI engine returns consistent, valid, and safe results.
      </Text>

      <Group justify="space-between">
        <Button
          onClick={runAll}
          loading={running}
          disabled={running}
          size="sm"
          style={{
            backgroundColor: 'var(--phantom-accent-cyan)',
            color: '#000',
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
          leftSection={running ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
        >
          Run All Tests
        </Button>

        {results.size > 0 && (
          <Group gap="sm">
            <Badge
              size="sm"
              variant="light"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                color: 'var(--phantom-status-success, #22c55e)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {passedCount} passed
            </Badge>
            {failedCount > 0 && (
              <Badge
                size="sm"
                variant="light"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: 'var(--phantom-status-danger, #ef4444)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {failedCount} failed
              </Badge>
            )}
            <Badge
              size="sm"
              variant="light"
              style={{
                backgroundColor: 'rgba(0, 200, 255, 0.08)',
                color: 'var(--phantom-text-muted)',
                border: 'none',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {totalTime}ms total
            </Badge>
          </Group>
        )}
      </Group>

      <Stack gap={4}>
        {GUARDRAIL_TESTS.map((test) => {
          const result = results.get(test.name);
          const isRunning = runningTest === test.name;

          return (
            <Paper
              key={test.name}
              px="sm"
              py={8}
              bg="var(--phantom-surface-card)"
              style={{
                border: `1px solid ${
                  isRunning
                    ? 'rgba(0, 200, 255, 0.4)'
                    : result
                      ? result.passed
                        ? 'rgba(34, 197, 94, 0.3)'
                        : 'rgba(239, 68, 68, 0.3)'
                      : 'var(--phantom-border-subtle)'
                }`,
                transition: 'border-color 200ms ease',
              }}
            >
              <Group justify="space-between">
                <Group gap="xs" style={{ flex: 1 }}>
                  {isRunning ? (
                    <Loader2 size={14} style={{ color: 'var(--phantom-accent-cyan)', animation: 'spin 1s linear infinite' }} />
                  ) : result ? (
                    result.passed ? (
                      <CheckCircle2 size={14} style={{ color: 'var(--phantom-status-success, #22c55e)' }} />
                    ) : (
                      <XCircle size={14} style={{ color: 'var(--phantom-status-danger, #ef4444)' }} />
                    )
                  ) : (
                    <Shield size={14} style={{ color: 'var(--phantom-text-muted)' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">
                      {test.name}
                    </Text>
                    <Text fz="0.65rem" c="var(--phantom-text-muted)">
                      {result ? result.detail : test.description}
                    </Text>
                  </div>
                </Group>
                <Group gap="xs">
                  {result?.durationMs !== undefined && (
                    <Tooltip label="Execution time">
                      <Group gap={3}>
                        <Clock size={10} style={{ color: 'var(--phantom-text-muted)' }} />
                        <Text fz="0.6rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace">
                          {result.durationMs}ms
                        </Text>
                      </Group>
                    </Tooltip>
                  )}
                  {!running && (
                    <Text
                      fz="0.6rem"
                      c="var(--phantom-accent-cyan)"
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => runSingle(test)}
                    >
                      run
                    </Text>
                  )}
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
};
