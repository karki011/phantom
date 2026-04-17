/**
 * SystemContextExplorer — Scenario 1: "Pick a file, see what The System thinks is related."
 * Calls GET /api/graph/{projectId}/context?file={path} and displays results.
 *
 * @author Subash Karki
 */
import { Autocomplete, Badge, Button, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { FileSearch, Loader2, Search } from 'lucide-react';
import { useAtomValue } from 'jotai';
import { usePaneStore } from '@phantom-os/panes';
import { activeWorktreeAtom } from '../../atoms/worktrees';
import { API_BASE } from '../../lib/api';

interface ContextFile {
  id: string;
  path: string;
  relevance: number;
}

interface ContextModule {
  name: string;
}

interface ContextResult {
  files: ContextFile[];
  modules: ContextModule[];
  edges: Array<{ id: string; sourceId: string; targetId: string; type: string }>;
  scores: Record<string, number>;
}

/* ─── DependencyGraph (radial SVG layout) ─────────────────────────────────── */

interface DependencyGraphProps {
  centerFile: string;
  files: Array<{ id: string; path: string; relevance: number }>;
  edges: Array<{ id: string; sourceId: string; targetId: string; type: string }>;
  onFileClick: (filePath: string) => void;
}

const GRAPH_WIDTH = 600;
const GRAPH_HEIGHT = 400;
const CENTER_X = GRAPH_WIDTH / 2;
const CENTER_Y = GRAPH_HEIGHT / 2;
const ORBIT_RADIUS = 150;
const MAX_GRAPH_NODES = 12;

const truncatePath = (p: string, maxLen = 20): string => {
  const name = p.split('/').pop() ?? p;
  return name.length > maxLen ? `${name.slice(0, maxLen - 1)}…` : name;
};

const relevanceNodeColor = (score: number): string => {
  if (score >= 0.8) return 'var(--phantom-status-success, #22c55e)';
  if (score >= 0.5) return 'var(--phantom-accent-cyan, #06b6d4)';
  if (score >= 0.3) return 'var(--phantom-status-warning, #f59e0b)';
  return 'var(--phantom-text-muted, #888)';
};

const DependencyGraph = ({ centerFile, files, edges, onFileClick }: DependencyGraphProps) => {
  // Cap to top-N by relevance
  const topFiles = [...files]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_GRAPH_NODES);

  // Build position lookup — center node + orbit nodes
  const positionMap = new Map<string, { x: number; y: number }>();

  // Assign a virtual id for the center file so edges can match
  const centerIdCandidates = topFiles.filter((f) => f.path === centerFile);
  const centerId = centerIdCandidates.length > 0 ? centerIdCandidates[0].id : '__center__';
  positionMap.set(centerId, { x: CENTER_X, y: CENTER_Y });

  const orbitFiles = topFiles.filter((f) => f.path !== centerFile);

  const nodePositions = orbitFiles.map((file, i) => {
    const angle = (2 * Math.PI * i) / (orbitFiles.length || 1) - Math.PI / 2;
    const pos = {
      x: CENTER_X + ORBIT_RADIUS * Math.cos(angle),
      y: CENTER_Y + ORBIT_RADIUS * Math.sin(angle),
    };
    positionMap.set(file.id, pos);
    return { ...file, ...pos };
  });

  // Resolve edge positions
  const resolvedEdges = edges
    .map((e) => {
      const src = positionMap.get(e.sourceId);
      const tgt = positionMap.get(e.targetId);
      if (!src || !tgt) return null;
      return { ...e, x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y };
    })
    .filter(Boolean) as Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>;

  return (
    <Paper
      p="sm"
      bg="var(--phantom-surface-card)"
      style={{ border: '1px solid var(--phantom-border-subtle)', overflow: 'hidden' }}
    >
      <Text fz="0.7rem" fw={600} c="var(--phantom-text-primary)" mb={6}>
        Dependency Graph
      </Text>
      <svg
        width="100%"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        style={{
          backgroundColor: 'var(--phantom-surface-bg, #0a0a1a)',
          borderRadius: 6,
          display: 'block',
        }}
      >
        {/* Edges */}
        {resolvedEdges.map((e) => (
          <line
            key={e.id}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Center node */}
        <g
          style={{ cursor: 'pointer' }}
          onClick={() => onFileClick(centerFile)}
        >
          <title>{centerFile}</title>
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={20}
            fill="var(--phantom-accent-cyan, #06b6d4)"
            opacity={0.9}
          />
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={20}
            fill="none"
            stroke="var(--phantom-accent-cyan, #06b6d4)"
            strokeWidth={2}
            opacity={0.4}
          />
          <text
            x={CENTER_X}
            y={CENTER_Y + 32}
            textAnchor="middle"
            fill="white"
            fontSize={11}
            fontFamily="'JetBrains Mono', monospace"
          >
            {truncatePath(centerFile, 24)}
          </text>
        </g>

        {/* Orbit nodes */}
        {nodePositions.map((node) => {
          const nodeRadius = 8 + node.relevance * 8; // 8–16 based on relevance
          return (
            <g
              key={node.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onFileClick(node.path)}
            >
              <title>{node.path}</title>
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeRadius}
                fill={relevanceNodeColor(node.relevance)}
                opacity={0.85}
              />
              <text
                x={node.x}
                y={node.y + nodeRadius + 12}
                textAnchor="middle"
                fill="var(--phantom-text-secondary, #ccc)"
                fontSize={10}
                fontFamily="'JetBrains Mono', monospace"
              >
                {truncatePath(node.path)}
              </text>
            </g>
          );
        })}
      </svg>
    </Paper>
  );
};

/* ─── Main component ──────────────────────────────────────────────────────── */

interface Props {
  projectId: string;
}

export const SystemContextExplorer = ({ projectId }: Props) => {
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContextResult | null>(null);
  const [fileList, setFileList] = useState<string[]>([]);
  const worktree = useAtomValue(activeWorktreeAtom);
  const store = usePaneStore();

  const openFileInEditor = useCallback((fp: string) => {
    if (!worktree) return;
    const fileName = fp.split('/').pop() ?? fp;
    store.addPaneAsTab('editor', {
      filePath: fp,
      worktreeId: worktree.id,
      repoPath: worktree.worktreePath,
    } as Record<string, unknown>, fileName);
  }, [worktree, store]);

  // Fetch all file paths from graph for autocomplete
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/graph/${encodeURIComponent(projectId)}/files`)
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
        `${API_BASE}/api/graph/${encodeURIComponent(projectId)}/context?file=${encodeURIComponent(filePath.trim())}`,
      );
      if (!res.ok) {
        throw new Error(`API returned ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      // Map scores (keyed by node ID) onto file objects as relevance
      const scores = (data.scores ?? {}) as Record<string, number>;
      const files = ((data.files ?? []) as Array<{ id: string; path: string }>).map((f) => ({
        ...f,
        relevance: scores[f.id] ?? 0,
      }));
      setResult({ ...data, files } as ContextResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const relevanceColor = (score: number): string => {
    if (score >= 0.8) return 'var(--phantom-status-success, #22c55e)';
    if (score >= 0.5) return 'var(--phantom-accent-cyan)';
    if (score >= 0.3) return 'var(--phantom-status-warning, #f59e0b)';
    return 'var(--phantom-text-muted)';
  };

  const allFilesExist = result ? result.files.every((f) => f.path && f.path.length > 0) : false;
  const relevanceSum = result
    ? result.files.reduce((sum, f) => sum + (f.relevance ?? 0), 0)
    : 0;

  return (
    <Stack gap="md">
      <Text fz="0.8rem" c="var(--phantom-text-secondary)">
        Pick a file, see what The System thinks is related. Search or select from your project
        files to discover its dependency graph, related modules, and relevance scores.
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
          limit={50}
          maxDropdownHeight={300}
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

      {result && result.files.length > 0 && (
        <DependencyGraph
          centerFile={filePath}
          files={result.files}
          edges={result.edges}
          onFileClick={openFileInEditor}
        />
      )}

      {result && (
        <Stack gap="sm">
          {/* Validation badges */}
          <Group gap="sm">
            <Tooltip label={allFilesExist ? 'All returned files have valid paths' : 'Some files may be missing'}>
              <Badge
                size="sm"
                variant="light"
                style={{
                  backgroundColor: allFilesExist ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: allFilesExist ? 'var(--phantom-status-success, #22c55e)' : 'var(--phantom-status-danger, #ef4444)',
                  border: `1px solid ${allFilesExist ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
              >
                {allFilesExist ? 'All files valid' : 'Missing files detected'}
              </Badge>
            </Tooltip>
            <Badge
              size="sm"
              variant="light"
              style={{
                backgroundColor: 'rgba(0, 200, 255, 0.08)',
                color: 'var(--phantom-accent-cyan)',
                border: '1px solid rgba(0, 200, 255, 0.2)',
              }}
            >
              Relevance sum: {relevanceSum.toFixed(2)}
            </Badge>
            <Badge
              size="sm"
              variant="light"
              style={{
                backgroundColor: 'rgba(0, 200, 255, 0.08)',
                color: 'var(--phantom-accent-cyan)',
                border: '1px solid rgba(0, 200, 255, 0.2)',
              }}
            >
              {result.files.length} related file{result.files.length !== 1 ? 's' : ''}
            </Badge>
          </Group>

          {/* Modules */}
          {result.modules && result.modules.length > 0 && (
            <Paper p="sm" bg="var(--phantom-surface-card)" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
              <Text fz="0.7rem" fw={600} c="var(--phantom-text-primary)" mb={6}>
                Modules / Dependencies
              </Text>
              <Group gap={6}>
                {result.modules.map((mod: unknown) => {
                  const name = typeof mod === 'string' ? mod : (mod as { name?: string })?.name ?? String(mod);
                  return (
                  <Badge
                    key={name}
                    size="xs"
                    variant="outline"
                    style={{
                      borderColor: 'var(--phantom-accent-cyan)',
                      color: 'var(--phantom-accent-cyan)',
                    }}
                  >
                    {name}
                  </Badge>
                  );
                })}
              </Group>
            </Paper>
          )}

          {/* Related files */}
          {result.files.length === 0 ? (
            <Paper p="md" bg="var(--phantom-surface-card)" style={{ border: '1px solid var(--phantom-border-subtle)' }}>
              <Group gap="xs" justify="center">
                <FileSearch size={16} style={{ color: 'var(--phantom-text-muted)' }} />
                <Text fz="0.8rem" c="var(--phantom-text-muted)" fs="italic">
                  No related files found for this path.
                </Text>
              </Group>
            </Paper>
          ) : (
            <Stack gap={4}>
              {result.files.map((file) => (
                <Paper
                  key={file.path}
                  p="xs"
                  bg="var(--phantom-surface-card)"
                  style={{ border: '1px solid var(--phantom-border-subtle)' }}
                >
                  <Group justify="space-between" mb={4}>
                    <Text
                      fz="0.75rem"
                      c="var(--phantom-text-primary)"
                      ff="'JetBrains Mono', monospace"
                      truncate
                      onClick={() => openFileInEditor(file.path)}
                      style={{
                        flex: 1,
                        cursor: 'pointer',
                        textDecoration: 'none',
                        transition: 'text-decoration 0.15s',
                      }}
                      onMouseEnter={(e: React.MouseEvent<HTMLParagraphElement>) => {
                        (e.currentTarget as HTMLElement).style.textDecoration = 'underline';
                      }}
                      onMouseLeave={(e: React.MouseEvent<HTMLParagraphElement>) => {
                        (e.currentTarget as HTMLElement).style.textDecoration = 'none';
                      }}
                    >
                      {file.path}
                    </Text>
                    <Text fz="0.65rem" fw={700} c={relevanceColor(file.relevance)} ff="'JetBrains Mono', monospace">
                      {(file.relevance * 100).toFixed(0)}%
                    </Text>
                  </Group>
                  <Progress
                    value={file.relevance * 100}
                    size="xs"
                    styles={{
                      root: { backgroundColor: 'var(--phantom-surface-elevated, #2a2a2a)' },
                      section: { backgroundColor: relevanceColor(file.relevance) },
                    }}
                  />
                  {file.edges && file.edges.length > 0 && (
                    <Group gap={4} mt={4}>
                      <Text fz="0.6rem" c="var(--phantom-text-muted)">Edges:</Text>
                      {file.edges.map((edge) => (
                        <Text key={edge} fz="0.6rem" c="var(--phantom-text-secondary)" ff="'JetBrains Mono', monospace">
                          {edge}
                        </Text>
                      ))}
                    </Group>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
};
