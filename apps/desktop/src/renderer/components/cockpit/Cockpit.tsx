/**
 * Cockpit Component
 * Main dashboard view with two-column layout: Live Feed + Projects & context
 *
 * @author Subash Karki
 */
import { Paper, Popover, ScrollArea, Stack, Tabs, Text, TextInput, Group } from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  FolderGit2,
  GitBranch,
  GitGraph,
  Info,
  Radio,
  Search,
  Shield,
} from 'lucide-react';

import { projectsAtom, worktreesByProjectAtom, activeWorktreeIdAtom } from '../../atoms/worktrees';
import { activeTopTabAtom } from '../../atoms/system';
import { useHunter } from '../../hooks/useHunter';
import { useGraphStatus } from '../../hooks/useGraphStatus';
import { usePreferences } from '../../hooks/usePreferences';
import { useRouter } from '../../hooks/useRouter';
import { useSessions } from '../../hooks/useSessions';
import { LiveFeed } from './LiveFeed';
import { CockView } from './CockView';

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
  const worktreesByProject = useAtomValue(worktreesByProjectAtom);
  const setActiveWorktreeId = useSetAtom(activeWorktreeIdAtom);
  const setActiveTopTab = useSetAtom(activeTopTabAtom);
  const { isEnabled } = usePreferences();
  const graphStatus = useGraphStatus();
  const showGamification = isEnabled('gamification');

  // Fetch persisted graph stats for all projects in a single call
  const [projectGraphStats, setProjectGraphStats] = useState<Record<string, { fileCount: number; totalEdges: number } | null>>({});
  const fetchAllGraphStats = useCallback(async () => {
    try {
      const res = await fetch('/api/graph/stats/all');
      if (res.ok) {
        const data: Record<string, { fileCount: number; totalEdges: number }> = await res.json();
        setProjectGraphStats(data);
      }
    } catch {
      // Server not ready yet — ignore
    }
  }, []);

  useEffect(() => {
    if (projects.length > 0) fetchAllGraphStats();
  }, [projects, fetchAllGraphStats]);

  // Project search
  const [projectSearch, setProjectSearch] = useState('');
  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.defaultBranch ?? '').toLowerCase().includes(q),
    );
  }, [projects, projectSearch]);

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }} data-testid="cockpit-view">
      <Tabs defaultValue="analytics" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Tabs.List style={{ background: 'var(--phantom-surface-card)', borderBottom: '1px solid var(--phantom-border-subtle)' }}>
          <Tabs.Tab
            value="analytics"
            leftSection={<BarChart3 size={14} />}
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
          >
            Analytics
          </Tabs.Tab>
          <Tabs.Tab
            value="feed"
            leftSection={<Radio size={14} />}
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
          >
            Live Feed
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="analytics" style={{ flex: 1, overflow: 'auto' }}>
          <CockView />
        </Tabs.Panel>

        <Tabs.Panel value="feed" style={{ flex: 1, overflow: 'auto' }}>
          <Stack gap="md" p="md">
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
            {projects.length > 3 && (
              <TextInput
                placeholder="Search projects..."
                size="xs"
                mb="xs"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.currentTarget.value)}
                leftSection={<Search size={12} style={{ color: 'var(--phantom-text-muted)' }} />}
                styles={{
                  input: {
                    backgroundColor: 'var(--phantom-surface-bg)',
                    borderColor: 'var(--phantom-border-subtle)',
                    color: 'var(--phantom-text-primary)',
                    fontSize: '0.75rem',
                    '&::placeholder': { color: 'var(--phantom-text-muted)' },
                  },
                }}
              />
            )}
            {projects.length === 0 ? (
              <Text fz="xs" c="var(--phantom-text-muted)" fs="italic" ta="center" py="sm">
                No projects yet. Open a repo to get started.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={320} scrollbarSize={4}>
                <Stack gap={4}>
                  {filteredProjects.length === 0 && projectSearch ? (
                    <Text fz="xs" c="var(--phantom-text-muted)" ta="center" py="sm">
                      No projects match "{projectSearch}"
                    </Text>
                  ) : null}
                  {filteredProjects.map((p) => {
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
                        onClick={() => {
                          const wts = worktreesByProject.get(p.id);
                          const firstWt = wts?.[0];
                          if (firstWt) {
                            setActiveWorktreeId(firstWt.id);
                            setActiveTopTab('worktree');
                          }
                        }}
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
                        {(() => {
                          const persistedStats = projectGraphStats[p.id];
                          const hasGraph = isGraphProject ? !!graphStatus.stats : !!persistedStats;
                          const fileCount = isGraphProject && graphStatus.stats ? graphStatus.stats.files : persistedStats?.fileCount ?? 0;
                          const edgeCount = isGraphProject && graphStatus.stats ? graphStatus.stats.edges : persistedStats?.totalEdges ?? 0;
                          return (
                        <div style={{ marginTop: 4, paddingLeft: 21 }}>
                          {isGraphProject && graphStatus.phase === 'building' && graphStatus.progress ? (
                            <>
                              <Group gap={4} mb={2}>
                                <GitGraph size={9} style={{ color: 'var(--phantom-accent-cyan)', animation: 'pulse-graph 1.2s ease-in-out infinite' }} />
                                <Text fz="0.7rem" c="var(--phantom-text-muted)">
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
                          ) : hasGraph ? (
                            <Group gap={6}>
                              <Group gap={4}>
                                <GitGraph size={11} style={{ color: 'var(--phantom-status-success, #22c55e)' }} />
                                <Text fz="0.7rem" c="var(--phantom-text-secondary)">
                                  {fileCount.toLocaleString()} files
                                </Text>
                              </Group>
                              <Text fz="0.7rem" c="var(--phantom-border-subtle)">|</Text>
                              <Text fz="0.7rem" c="var(--phantom-text-secondary)">
                                {edgeCount.toLocaleString()} connections
                              </Text>
                              <Popover width={260} position="bottom" shadow="md" withArrow>
                                <Popover.Target>
                                  <Info size={11} style={{ color: 'var(--phantom-text-muted)', cursor: 'pointer', flexShrink: 0 }} />
                                </Popover.Target>
                                <Popover.Dropdown
                                  style={{
                                    backgroundColor: 'var(--phantom-surface-card)',
                                    borderColor: 'var(--phantom-border-subtle)',
                                    padding: 10,
                                  }}
                                >
                                  <Stack gap={6}>
                                    <Text fw={600} fz="xs" c="var(--phantom-text-primary)">What is the Code Graph?</Text>
                                    <Text fz="xs" c="var(--phantom-text-secondary)" lh={1.4}>
                                      Phantom OS maps your project's code to understand how files relate to each other.
                                    </Text>
                                    <div>
                                      <Text fz="xs" fw={600} c="var(--phantom-accent-cyan)">Files</Text>
                                      <Text fz="xs" c="var(--phantom-text-secondary)" lh={1.4}>
                                        Every source file (TypeScript, JavaScript, etc.) in your project that was analyzed.
                                      </Text>
                                    </div>
                                    <div>
                                      <Text fz="xs" fw={600} c="var(--phantom-accent-cyan)">Connections</Text>
                                      <Text fz="xs" c="var(--phantom-text-secondary)" lh={1.4}>
                                        How files are linked — imports, dependencies, function calls, and component relationships. More connections means your AI assistant can better understand what code is related when making changes.
                                      </Text>
                                    </div>
                                  </Stack>
                                </Popover.Dropdown>
                              </Popover>
                            </Group>
                          ) : isGraphProject && graphStatus.phase === 'error' ? (
                            <Group gap={4}>
                              <GitGraph size={11} style={{ color: 'var(--phantom-status-danger, #ef4444)' }} />
                              <Text fz="0.7rem" c="var(--phantom-status-danger, #ef4444)">Graph error</Text>
                            </Group>
                          ) : null}
                          {/* Graph actions — always visible for every project */}
                          <Group gap={10} mt={3}>
                            {hasGraph && (
                              <Text
                                fz="0.7rem"
                                c="var(--phantom-accent-cyan)"
                                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={(e) => { e.stopPropagation(); navigate('system'); }}
                              >
                                Playground
                              </Text>
                            )}
                            <Text
                              fz="0.7rem"
                              c="var(--phantom-text-muted)"
                              style={{ cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                fetch(`/api/graph/${encodeURIComponent(p.id)}/build`, { method: 'POST' }).catch(() => {});
                              }}
                            >
                              {hasGraph ? 'Rebuild' : 'Build Graph'}
                            </Text>
                          </Group>
                        </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </Stack>
              </ScrollArea.Autosize>
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

          {/* Level Progress (gamification) — click to open hunter stats */}
          {showGamification && profile && (
            <Paper
              p="sm"
              bg="var(--phantom-surface-card)"
              style={{
                border: '1px solid var(--phantom-border-subtle)',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--phantom-accent-gold, #f59e0b)';
                e.currentTarget.style.boxShadow = '0 0 0.5rem rgba(245, 158, 11, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--phantom-border-subtle)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              onClick={() => navigate('hunter-stats')}
            >
              <Group gap="xs" mb="xs">
                <Shield size={14} style={{ color: 'var(--phantom-accent-gold, #f59e0b)' }} />
                <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)">Level Progress</Text>
              </Group>
              <Text fz="xs" c="var(--phantom-text-secondary)" mb={6}>
                {profile.rank} Rank — Level {profile.level}. {(profile.xpToNext ?? 0) - (profile.xp ?? 0) > 0 ? `${(profile.xpToNext ?? 0) - (profile.xp ?? 0)} XP to next level.` : 'Max level reached!'}
              </Text>
              <div style={{
                height: 6, borderRadius: 3, backgroundColor: 'var(--phantom-surface-elevated)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${Math.min(100, ((profile.xp ?? 0) / (profile.xpToNext ?? 1)) * 100)}%`,
                  background: 'linear-gradient(90deg, var(--phantom-accent-glow), var(--phantom-accent-gold))',
                  transition: 'width 500ms ease',
                }} />
              </div>
              <Group justify="space-between" mt={4}>
                <Text fz="0.6rem" c="var(--phantom-text-muted)">XP</Text>
                <Text fz="0.6rem" c="var(--phantom-text-muted)" ff="'JetBrains Mono', monospace">
                  {profile.xp ?? 0} / {profile.xpToNext ?? 0}
                </Text>
              </Group>
            </Paper>
          )}
        </Stack>
      </div>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
};
