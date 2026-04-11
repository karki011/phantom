/**
 * SystemBlastRadius — Scenario 2: "If you change this file, what could break?"
 * Calls GET /api/graph/{projectId}/blast-radius?file={path} and displays impact.
 *
 * @author Subash Karki
 */
import { Autocomplete, Badge, Button, Group, Paper, Progress, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Search, Zap } from 'lucide-react';

interface BlastFile {
  path: string;
  type: 'direct' | 'transitive';
  depth?: number;
}

interface BlastResult {
  files: BlastFile[];
  directCount: number;
  transitiveCount: number;
  impactScore: number;
  totalAffected: number;
}

interface Props {
  projectId: string;
}

export const SystemBlastRadius = ({ projectId }: Props) => {
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BlastResult | null>(null);
  const [fileList, setFileList] = useState<string[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/graph/${encodeURIComponent(projectId)}/files`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setFileList(data.map((f: { path?: string }) => f.path ?? '').filter(Boolean).sort());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const handleAnalyze = async () => {
    if (!filePath.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/graph/${encodeURIComponent(projectId)}/blast-radius?file=${encodeURIComponent(filePath.trim())}`,
      );
      if (!res.ok) {
        throw new Error(`API returned ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();

      // Normalize the response shape
      const files: BlastFile[] = Array.isArray(data.files) ? data.files : [];
      const directCount = data.directCount ?? files.filter((f: BlastFile) => f.type === 'direct').length;
      const transitiveCount = data.transitiveCount ?? files.filter((f: BlastFile) => f.type === 'transitive').length;
      const totalAffected = data.totalAffected ?? files.length;
      const impactScore = data.impactScore ?? Math.min(100, totalAffected * 2);

      setResult({ files, directCount, transitiveCount, impactScore, totalAffected });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const impactColor = (score: number): string => {
    if (score >= 75) return 'var(--phantom-status-danger, #ef4444)';
    if (score >= 50) return 'var(--phantom-status-warning, #f59e0b)';
    if (score >= 25) return 'var(--phantom-accent-cyan)';
    return 'var(--phantom-status-success, #22c55e)';
  };

  return (
    <Stack gap="md">
      <Text fz="0.8rem" c="var(--phantom-text-secondary)">
        If you change this file, what could break? Enter a file path to see its direct and
        transitive dependents, plus an overall impact score.
      </Text>

      <Group gap="sm" align="flex-end">
        <Autocomplete
          flex={1}
          placeholder={fileList.length > 0 ? `Search ${fileList.length.toLocaleString()} files...` : 'Loading files...'}
          label="File path"
          value={filePath}
          onChange={setFilePath}
          onOptionSubmit={(val) => { setFilePath(val); }}
          onKeyDown={(e) => e.key === 'Enter' && filePath.trim() && handleAnalyze()}
          data={fileList}
          limit={20}
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
            dropdown: {
              backgroundColor: 'var(--phantom-surface-card)',
              borderColor: 'var(--phantom-border-subtle)',
            },
            option: {
              color: 'var(--phantom-text-primary)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.75rem',
            },
          }}
        />
        <Button
          onClick={handleAnalyze}
          loading={loading}
          disabled={!filePath.trim() || loading}
          size="sm"
          style={{
            backgroundColor: 'var(--phantom-accent-cyan)',
            color: '#000',
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
          leftSection={loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
        >
          Analyze
        </Button>
      </Group>

      {error && (
        <Paper p="sm" style={{ border: '1px solid var(--phantom-status-danger, #ef4444)', backgroundColor: 'rgba(239, 68, 68, 0.08)' }}>
          <Text fz="0.75rem" c="var(--phantom-status-danger, #ef4444)">{error}</Text>
        </Paper>
      )}

      {result && (
        <Stack gap="sm">
          {/* Impact gauge */}
          <Paper p="sm" bg="var(--phantom-surface-card)" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
            <Group justify="space-between" mb={6}>
              <Group gap="xs">
                <Zap size={14} style={{ color: impactColor(result.impactScore) }} />
                <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">
                  Impact Score
                </Text>
              </Group>
              <Text
                fz="1.2rem"
                fw={700}
                ff="'JetBrains Mono', monospace"
                c={impactColor(result.impactScore)}
              >
                {result.impactScore}%
              </Text>
            </Group>
            <Progress
              value={result.impactScore}
              size="lg"
              styles={{
                root: { backgroundColor: 'var(--phantom-surface-elevated, #2a2a2a)', borderRadius: 4 },
                section: { backgroundColor: impactColor(result.impactScore), borderRadius: 4 },
              }}
            />
            <Group justify="space-between" mt={6}>
              <Text fz="0.65rem" c="var(--phantom-text-muted)">Low Impact</Text>
              <Text fz="0.65rem" c="var(--phantom-text-muted)">Critical Impact</Text>
            </Group>
          </Paper>

          {/* Summary badges */}
          <Group gap="sm">
            <Badge
              size="lg"
              variant="light"
              style={{
                backgroundColor: 'rgba(249, 115, 22, 0.12)',
                color: 'var(--phantom-status-warning, #f59e0b)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {result.directCount} direct
            </Badge>
            <Badge
              size="lg"
              variant="light"
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.12)',
                color: '#eab308',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {result.transitiveCount} transitive
            </Badge>
            <Badge
              size="lg"
              variant="light"
              style={{
                backgroundColor: 'rgba(0, 200, 255, 0.08)',
                color: 'var(--phantom-accent-cyan)',
                border: '1px solid rgba(0, 200, 255, 0.2)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {result.totalAffected} total affected
            </Badge>
          </Group>

          {/* File list */}
          {result.files.length === 0 ? (
            <Paper p="md" bg="var(--phantom-surface-card)" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
              <Group gap="xs" justify="center">
                <AlertTriangle size={16} style={{ color: 'var(--phantom-text-muted)' }} />
                <Text fz="0.8rem" c="var(--phantom-text-muted)" fs="italic">
                  No dependents found — this file is a leaf node.
                </Text>
              </Group>
            </Paper>
          ) : (
            <Stack gap={3}>
              {result.files.map((file) => {
                const isDirect = file.type === 'direct';
                const borderColor = isDirect
                  ? 'rgba(249, 115, 22, 0.4)'
                  : 'rgba(234, 179, 8, 0.25)';
                const bgColor = isDirect
                  ? 'rgba(249, 115, 22, 0.06)'
                  : 'rgba(234, 179, 8, 0.04)';
                const labelColor = isDirect
                  ? 'var(--phantom-status-warning, #f59e0b)'
                  : '#eab308';

                return (
                  <Paper
                    key={file.path}
                    px="sm"
                    py={6}
                    style={{
                      border: `1px solid ${borderColor}`,
                      backgroundColor: bgColor,
                    }}
                  >
                    <Group justify="space-between">
                      <Text
                        fz="0.73rem"
                        c="var(--phantom-text-primary)"
                        ff="'JetBrains Mono', monospace"
                        truncate
                        style={{ flex: 1 }}
                      >
                        {file.path}
                      </Text>
                      <Badge
                        size="xs"
                        variant="light"
                        style={{
                          backgroundColor: 'transparent',
                          color: labelColor,
                          border: `1px solid ${labelColor}`,
                          flexShrink: 0,
                        }}
                      >
                        {isDirect ? 'direct' : `transitive${file.depth ? ` (depth ${file.depth})` : ''}`}
                      </Badge>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
};
