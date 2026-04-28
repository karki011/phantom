/**
 * AIEngineSettings — Settings panel for Phantom AI engine toggles.
 * Controls auto-context, edit gate, outcome capture, and file sync hooks.
 *
 * @author Subash Karki
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { Brain, GitGraph, Shield, BookOpen, RefreshCw, Zap } from 'lucide-react';

import { fetchApi, API_BASE } from '../../lib/api';
import { useGraphStatus } from '../../hooks/useGraphStatus';
import type { GraphPhase } from '../../atoms/graph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIPreferences {
  'ai.autoContext': boolean;
  'ai.editGate': boolean;
  'ai.outcomeCapture': boolean;
  'ai.fileSync': boolean;
}

interface GraphStatsAll {
  [projectId: string]: { fileCount: number; totalEdges: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AI_PREFS: AIPreferences = {
  'ai.autoContext': true,
  'ai.editGate': true,
  'ai.outcomeCapture': true,
  'ai.fileSync': true,
};

interface ToggleDef {
  key: keyof AIPreferences;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const TOGGLES: ToggleDef[] = [
  {
    key: 'ai.autoContext',
    label: 'Auto Context Injection',
    description: 'Automatically inject graph context on every message to Claude',
    icon: <Brain size={14} />,
  },
  {
    key: 'ai.editGate',
    label: 'Edit Gate',
    description: 'Block Edit/Write tool calls without prior dependency analysis',
    icon: <Shield size={14} />,
  },
  {
    key: 'ai.outcomeCapture',
    label: 'Outcome Capture',
    description: 'Track session outcomes for knowledge learning and pattern recall',
    icon: <BookOpen size={14} />,
  },
  {
    key: 'ai.fileSync',
    label: 'File Sync',
    description: 'Keep the code graph updated automatically on file changes',
    icon: <RefreshCw size={14} />,
  },
];

// ---------------------------------------------------------------------------
// Shared styles (matches SettingsPage)
// ---------------------------------------------------------------------------

const sectionCardStyle: React.CSSProperties = {
  background: 'var(--phantom-surface-card)',
  border: '1px solid var(--phantom-border-subtle)',
  borderRadius: 12,
  padding: '20px 24px',
};

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'Orbitron, sans-serif',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--phantom-text-muted)',
  marginBottom: 4,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  minHeight: 42,
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--phantom-text-primary)',
};

const rowDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--phantom-text-secondary)',
  lineHeight: 1.4,
};

// ---------------------------------------------------------------------------
// Graph phase badge helpers
// ---------------------------------------------------------------------------

const phaseBadgeColor: Record<GraphPhase, string> = {
  idle: 'gray',
  building: 'cyan',
  enriching: 'cyan',
  updating: 'cyan',
  ready: 'green',
  stale: 'yellow',
  error: 'red',
};

const phaseBadgeLabel: Record<GraphPhase, string> = {
  idle: 'Idle',
  building: 'Building',
  enriching: 'Enriching',
  updating: 'Updating',
  ready: 'Ready',
  stale: 'Stale',
  error: 'Error',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AIEngineSettings = () => {
  const [prefs, setPrefs] = useState<AIPreferences>(DEFAULT_AI_PREFS);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStatsAll | null>(null);

  const graphStatus = useGraphStatus();

  // ------- Fetch AI preferences -------
  const fetchPrefs = useCallback(async () => {
    try {
      const data = await fetchApi<AIPreferences>('/api/preferences/ai');
      setPrefs(data);
    } catch {
      // Use defaults on error
    } finally {
      setLoading(false);
    }
  }, []);

  // ------- Fetch graph stats -------
  const fetchGraphStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/graph/stats/all`);
      if (res.ok) {
        const data: GraphStatsAll = await res.json();
        setGraphStats(data);
      }
    } catch {
      // Ignore — server may not be ready
    }
  }, []);

  useEffect(() => {
    fetchPrefs();
    fetchGraphStats();
  }, [fetchPrefs, fetchGraphStats]);

  // ------- Toggle a single preference -------
  const togglePref = useCallback(async (key: keyof AIPreferences, value: boolean) => {
    setUpdatingKey(key);
    try {
      const data = await fetchApi<AIPreferences>('/api/preferences/ai', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      });
      setPrefs(data);
    } catch {
      // Revert on error — re-fetch to stay in sync
      await fetchPrefs();
    } finally {
      setUpdatingKey(null);
    }
  }, [fetchPrefs]);

  // ------- Bulk toggle helpers -------
  const setAllPrefs = useCallback(async (value: boolean) => {
    setUpdatingKey('__bulk');
    try {
      const body: Record<string, boolean> = {};
      for (const toggle of TOGGLES) {
        body[toggle.key] = value;
      }
      const data = await fetchApi<AIPreferences>('/api/preferences/ai', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setPrefs(data);
    } catch {
      await fetchPrefs();
    } finally {
      setUpdatingKey(null);
    }
  }, [fetchPrefs]);

  const allEnabled = TOGGLES.every((t) => prefs[t.key]);
  const allDisabled = TOGGLES.every((t) => !prefs[t.key]);

  // ------- Graph stats summary -------
  const totalProjects = graphStats ? Object.keys(graphStats).length : 0;
  const totalFiles = graphStats
    ? Object.values(graphStats).reduce((sum, s) => sum + (s.fileCount ?? 0), 0)
    : 0;
  const totalEdges = graphStats
    ? Object.values(graphStats).reduce((sum, s) => sum + (s.totalEdges ?? 0), 0)
    : 0;

  if (loading) {
    return (
      <Stack gap="md">
        <Paper style={sectionCardStyle}>
          <Group justify="center" py="xl">
            <Loader size="sm" color="cyan" />
            <Text fz="sm" c="var(--phantom-text-secondary)">Loading AI Engine settings...</Text>
          </Group>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Header description */}
      <Paper style={sectionCardStyle}>
        <Group gap="sm" mb="xs">
          <Zap size={16} style={{ color: 'var(--phantom-accent-cyan, #00d4ff)' }} />
          <Text fw={600} fz="sm" c="var(--phantom-text-primary)">
            AI Engine
          </Text>
        </Group>
        <Text fz="xs" c="var(--phantom-text-secondary)" lh={1.5}>
          Control how Phantom AI assists your Claude Code sessions. Each toggle
          enables or disables a specific hook in the AI pipeline.
        </Text>
      </Paper>

      {/* Toggle switches */}
      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Features</div>
        <Stack gap="sm">
          {TOGGLES.map((toggle, idx) => (
            <div key={toggle.key}>
              <div style={rowStyle}>
                <div style={{ maxWidth: '70%' }}>
                  <Group gap={6} wrap="nowrap">
                    <span style={{ color: prefs[toggle.key] ? 'var(--phantom-accent-cyan, #00d4ff)' : 'var(--phantom-text-muted)', display: 'flex', alignItems: 'center', transition: 'color 150ms ease' }}>
                      {toggle.icon}
                    </span>
                    <Text style={rowLabelStyle}>{toggle.label}</Text>
                  </Group>
                  <Text style={rowDescStyle} mt={2}>{toggle.description}</Text>
                </div>
                <Group gap={8} wrap="nowrap">
                  {updatingKey === toggle.key && (
                    <Loader size={12} color="cyan" />
                  )}
                  <Switch
                    checked={prefs[toggle.key]}
                    onChange={(e) => togglePref(toggle.key, e.currentTarget.checked)}
                    disabled={updatingKey !== null}
                    color="cyan"
                    size="md"
                    aria-label={`Toggle ${toggle.label}`}
                  />
                </Group>
              </div>
              {idx < TOGGLES.length - 1 && (
                <Divider color="var(--phantom-border-subtle)" mt="sm" />
              )}
            </div>
          ))}
        </Stack>
      </Paper>

      {/* Bulk actions */}
      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Quick Actions</div>
        <Group gap="sm" mt="xs">
          <Button
            variant="outline"
            color="red"
            size="xs"
            onClick={() => setAllPrefs(false)}
            disabled={allDisabled || updatingKey !== null}
            loading={updatingKey === '__bulk' && allEnabled}
            style={{ fontFamily: 'var(--phantom-font-mono, monospace)' }}
          >
            Disable All
          </Button>
          <Button
            variant="outline"
            color="cyan"
            size="xs"
            onClick={() => setAllPrefs(true)}
            disabled={allEnabled || updatingKey !== null}
            loading={updatingKey === '__bulk' && allDisabled}
            style={{ fontFamily: 'var(--phantom-font-mono, monospace)' }}
          >
            Reset Defaults
          </Button>
        </Group>
      </Paper>

      {/* Status section */}
      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Status</div>
        <Stack gap="sm">
          {/* Graph status */}
          <div style={rowStyle}>
            <Group gap={6} wrap="nowrap">
              <GitGraph size={14} style={{ color: 'var(--phantom-text-muted)' }} />
              <Text style={rowLabelStyle}>Graph Status</Text>
            </Group>
            <Badge
              color={phaseBadgeColor[graphStatus.phase]}
              variant="light"
              size="sm"
            >
              {phaseBadgeLabel[graphStatus.phase]}
            </Badge>
          </div>

          {/* Graph stats when available */}
          {(graphStatus.stats || totalFiles > 0) && (
            <>
              <Divider color="var(--phantom-border-subtle)" />
              <div style={rowStyle}>
                <Text style={rowDescStyle}>Indexed Files</Text>
                <Text fz="sm" fw={600} c="var(--phantom-text-primary)">
                  {graphStatus.stats?.files ?? totalFiles}
                </Text>
              </div>
              <div style={rowStyle}>
                <Text style={rowDescStyle}>Edges</Text>
                <Text fz="sm" fw={600} c="var(--phantom-text-primary)">
                  {graphStatus.stats?.edges ?? totalEdges}
                </Text>
              </div>
              {totalProjects > 0 && (
                <div style={rowStyle}>
                  <Text style={rowDescStyle}>Projects with Graphs</Text>
                  <Text fz="sm" fw={600} c="var(--phantom-text-primary)">
                    {totalProjects}
                  </Text>
                </div>
              )}
            </>
          )}

          {/* Hook installation status */}
          <Divider color="var(--phantom-border-subtle)" />
          <div style={rowStyle}>
            <Text style={rowDescStyle}>Hook Pipeline</Text>
            <Badge
              color={allDisabled ? 'gray' : allEnabled ? 'green' : 'yellow'}
              variant="light"
              size="sm"
            >
              {allDisabled ? 'Disabled' : allEnabled ? 'All Active' : 'Partial'}
            </Badge>
          </div>
          <div style={rowStyle}>
            <Text style={rowDescStyle}>Active Hooks</Text>
            <Text fz="sm" fw={600} c="var(--phantom-text-primary)">
              {TOGGLES.filter((t) => prefs[t.key]).length} / {TOGGLES.length}
            </Text>
          </div>
        </Stack>
      </Paper>
    </Stack>
  );
};
