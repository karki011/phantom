/**
 * Cockpit Component
 * Main dashboard view with two-column layout: Live Feed + Projects & context
 *
 * @author Subash Karki
 */
import { Paper, Stack, Text, Group, Tooltip } from '@mantine/core';
import { useAtomValue } from 'jotai';
import {
  Activity,
  FolderGit2,
  GitBranch,
  GitGraph,
  Shield,
} from 'lucide-react';

import { projectsAtom } from '../../atoms/worktrees';
import { useHunter } from '../../hooks/useHunter';
import { useGraphStatus } from '../../hooks/useGraphStatus';
import { usePreferences } from '../../hooks/usePreferences';
import { useRouter } from '../../hooks/useRouter';
import { useSessions } from '../../hooks/useSessions';
import { LiveFeed } from './LiveFeed';

const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
};

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(2)}`;
};

export const Cockpit = () => {
  const { navigate } = useRouter();
  const { profile } = useHunter();
  const { active, recent } = useSessions();
  const projects = useAtomValue(projectsAtom);
  const { isEnabled } = usePreferences();
  const graphStatus = useGraphStatus();
  const showGamification = isEnabled('gamification');

  const totalTokens = active.reduce(
    (sum, s) => sum + s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheWriteTokens,
    0,
  );
  const totalCostMicros = active.reduce((sum, s) => sum + s.estimatedCostMicros, 0);
  const totalTasks = profile?.totalTasks ?? 0;
  const totalSessions = (profile?.totalSessions ?? 0);
  const avgTokensPerSession = active.length > 0
    ? formatTokens(Math.round(totalTokens / active.length))
    : '0';

  return (
    <Stack gap="md" data-testid="cockpit-view">
      {/* Two-column: Live Feed | Projects + Snapshot */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 2fr)',
          gap: 'var(--mantine-spacing-md)',
          alignItems: 'start',
        }}
      >
        {/* Left: Live Feed */}
        <LiveFeed />

        {/* Right: Projects + Quick Snapshot */}
        <Stack gap="md">
          {/* Projects */}
          <Paper
            p="sm"
            bg="var(--phantom-surface-card)"
            style={{ border: '1px solid var(--phantom-border-subtle)' }}
          >
            <Group gap="xs" mb="xs">
              <FolderGit2 size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
              <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">Projects</Text>
              <Text fz="0.65rem" c="var(--phantom-text-muted)" ml="auto">{projects.length}</Text>
            </Group>
            {projects.length === 0 ? (
              <Text fz="xs" c="var(--phantom-text-muted)" fs="italic" ta="center" py="sm">
                No projects yet. Open a repo to get started.
              </Text>
            ) : (
              <Stack gap={4}>
                {projects.map((p) => {
                  const isGraphProject = graphStatus.projectId === p.id && graphStatus.phase !== 'idle';
                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 4, cursor: 'pointer', transition: 'background-color 100ms ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated, #2a2a2a)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                      onClick={() => navigate('cockpit')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FolderGit2 size={13} style={{ color: 'var(--phantom-accent-cyan)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text fz="0.75rem" fw={500} c="var(--phantom-text-primary)" truncate>{p.name}</Text>
                          <Group gap={4}>
                            <GitBranch size={10} style={{ color: 'var(--phantom-text-muted)' }} />
                            <Text fz="0.6rem" c="var(--phantom-text-muted)">{p.defaultBranch ?? 'main'}</Text>
                          </Group>
                        </div>
                      </div>
                      {/* Inline graph stats for this project */}
                      {isGraphProject && (
                        <div style={{ marginTop: 4, paddingLeft: 21 }}>
                          {graphStatus.phase === 'building' && graphStatus.progress ? (
                            <>
                              <Group gap={4} mb={2}>
                                <GitGraph size={9} style={{ color: 'var(--phantom-accent-cyan)', animation: 'pulse-graph 1.2s ease-in-out infinite' }} />
                                <Text fz="0.6rem" c="var(--phantom-text-muted)">
                                  Mapping {graphStatus.progress.current.toLocaleString()}/{graphStatus.progress.total.toLocaleString()}
                                </Text>
                              </Group>
                              <div style={{ height: 3, borderRadius: 2, backgroundColor: 'var(--phantom-surface-elevated)', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%', borderRadius: 2,
                                  width: `${graphStatus.progress.total > 0 ? Math.round((graphStatus.progress.current / graphStatus.progress.total) * 100) : 0}%`,
                                  background: 'var(--phantom-accent-cyan)', transition: 'width 200ms ease',
                                }} />
                              </div>
                            </>
                          ) : graphStatus.stats ? (
                            <Group gap={8}>
                              <Tooltip label="Source files analyzed in this project" position="bottom" withArrow fz="xs">
                                <Group gap={3} style={{ cursor: 'default' }}>
                                  <GitGraph size={9} style={{ color: 'var(--phantom-status-success, #22c55e)' }} />
                                  <Text fz="0.6rem" c="var(--phantom-text-muted)">
                                    {graphStatus.stats.files.toLocaleString()} files
                                  </Text>
                                </Group>
                              </Tooltip>
                              <Tooltip label="Import connections between files — how your code is linked" position="bottom" withArrow fz="xs">
                                <Text fz="0.6rem" c="var(--phantom-text-muted)" style={{ cursor: 'default' }}>
                                  {graphStatus.stats.edges.toLocaleString()} edges
                                </Text>
                              </Tooltip>
                            </Group>
                          ) : graphStatus.phase === 'error' ? (
                            <Group gap={3}>
                              <GitGraph size={9} style={{ color: 'var(--phantom-status-danger, #ef4444)' }} />
                              <Text fz="0.6rem" c="var(--phantom-status-danger, #ef4444)">Graph error</Text>
                            </Group>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Stack>
            )}
          </Paper>

          {/* Quick Snapshot */}
          <Paper
            p="sm"
            bg="var(--phantom-surface-card)"
            style={{ border: '1px solid var(--phantom-border-subtle)' }}
          >
            <Group gap="xs" mb="xs">
              <Activity size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
              <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">Quick Snapshot</Text>
              <Text fz="0.6rem" c="var(--phantom-text-muted)" ml="auto">today</Text>
            </Group>
            <Stack gap={6}>
              {[
                { label: 'Active sessions', value: String(active.length) },
                { label: 'Recent sessions', value: String(recent.length) },
                { label: 'Tasks completed', value: String(totalTasks) },
                { label: 'Token spend', value: formatCost(totalCostMicros) },
                ...(active.length > 0 ? [{ label: 'Avg tokens/session', value: avgTokensPerSession }] : []),
              ].map((row) => (
                <Group key={row.label} justify="space-between">
                  <Text fz="0.73rem" c="var(--phantom-text-secondary)">{row.label}</Text>
                  <Text fz="0.73rem" fw={600} c="var(--phantom-text-primary)" ff="'JetBrains Mono', monospace">{row.value}</Text>
                </Group>
              ))}
            </Stack>
          </Paper>

          {/* Level Progress (gamification) */}
          {showGamification && profile && (
            <Paper
              p="sm"
              bg="var(--phantom-surface-card)"
              style={{ border: '1px solid var(--phantom-border-subtle)' }}
            >
              <Group gap="xs" mb="xs">
                <Shield size={14} style={{ color: 'var(--phantom-accent-gold, #f59e0b)' }} />
                <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">Level Progress</Text>
              </Group>
              <Text fz="xs" c="var(--phantom-text-secondary)" mb={6}>
                {profile.rank} Rank — Level {profile.level}. {profile.xpToNext > 0 ? `${profile.xpToNext} XP to next level.` : 'Max level reached!'}
              </Text>
              <div style={{
                height: 6, borderRadius: 3, backgroundColor: 'var(--phantom-surface-elevated)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${Math.min(100, ((profile.xp ?? 0) / ((profile.xp ?? 0) + (profile.xpToNext ?? 1))) * 100)}%`,
                  background: 'linear-gradient(90deg, var(--phantom-accent-glow), var(--phantom-accent-cyan))',
                  transition: 'width 500ms ease',
                }} />
              </div>
              <Group justify="space-between" mt={4}>
                <Text fz="0.6rem" c="var(--phantom-text-muted)">XP</Text>
                <Text fz="0.6rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace">
                  {profile.xp ?? 0} / {(profile.xp ?? 0) + (profile.xpToNext ?? 0)}
                </Text>
              </Group>
            </Paper>
          )}
        </Stack>
      </div>
    </Stack>
  );
};
