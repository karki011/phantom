/**
 * SystemHeader Component
 * App header with branding, connection status, font scale, and theme toggle
 *
 * @author Subash Karki
 */
import {
  ActionIcon,
  Box,
  Group,
  Menu,
  Popover,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { useAtom } from 'jotai';
import { ArrowLeft, Circle, Cpu, HelpCircle, MemoryStick, Moon, Palette, Sun, Swords, Type } from 'lucide-react';
import { themeRegistry } from '@phantom-os/theme';

import { type FontScale, fontScaleAtom, themeNameAtom } from '../../atoms/system';
import { usePreferences } from '../../hooks/usePreferences';
import { useRouter } from '../../hooks/useRouter';
import { useSystemMetrics } from '../../hooks/useSystemMetrics';
import { useGraphStatus } from '../../hooks/useGraphStatus';
import { GraphStatus } from './GraphStatus';

interface SystemHeaderProps {
  activeSessions: number;
  isConnected?: boolean;
}

const FONT_SCALE_OPTIONS: { label: string; value: FontScale }[] = [
  { label: '90%', value: 0.9 },
  { label: '100%', value: 1.0 },
  { label: '110%', value: 1.1 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
];

/** Format bytes to human-readable GB/MB */
const formatBytes = (bytes: number): string => {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)}` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};

export const SystemHeader = ({ activeSessions, isConnected: isBackendConnected }: SystemHeaderProps) => {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [fontScale, setFontScale] = useAtom(fontScaleAtom);
  const [themeName, setThemeName] = useAtom(themeNameAtom);
  const { isHome, navigate } = useRouter();
  const { isEnabled, setPref } = usePreferences();
  const metrics = useSystemMetrics();
  const graphStatus = useGraphStatus();
  const gamificationOn = isEnabled('gamification');

  const isDark = colorScheme === 'dark';
  const isConnected = isBackendConnected ?? false;

  return (
    <Group
      h="100%"
      px="md"
      justify="space-between"
      style={{
        // Make header draggable as a window titlebar in Electron
        WebkitAppRegion: navigator.userAgent.includes('Electron') ? 'drag' : undefined,
      } as React.CSSProperties}
    >
      {/* Left: Back button + Branding */}
      <Group gap="sm" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {!isHome && (
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => navigate('cockpit')}
            aria-label="Back to cockpit"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </ActionIcon>
        )}
        <Text
          ff="Orbitron, sans-serif"
          fz="1.125rem"
          fw={900}
          c="var(--phantom-text-primary)"
          tt="uppercase"
          visibleFrom="sm"
          style={{
            letterSpacing: '0.1em',
            textShadow: isDark
              ? '0 0 0.5rem var(--phantom-accent-glow)'
              : 'none',
          }}
        >
          Phantom OS
        </Text>
      </Group>

      {/* Center: Connection status + System metrics */}
      <Group
        gap="md"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Active sessions indicator */}
        <Group
          gap="0.375rem"
          style={{ cursor: activeSessions > 0 ? 'pointer' : 'default' }}
          onClick={() => { if (activeSessions > 0) navigate('sessions'); }}
        >
          <Circle
            size={10}
            fill={isConnected ? 'var(--phantom-status-active)' : 'var(--phantom-status-danger)'}
            stroke="none"
            aria-hidden="true"
          />
          <Text fz="0.8125rem" c="var(--phantom-text-secondary)">
            {!isConnected ? 'Disconnected' : activeSessions > 0 ? `${activeSessions} Active` : 'Idle'}
          </Text>
        </Group>

        {/* System metrics — only shown when data is available */}
        {metrics && (
          <>
            <Text fz="0.75rem" c="var(--phantom-text-muted)">|</Text>
            <Tooltip label={`CPU Usage: ${metrics.cpu.usage}%`} position="bottom" withArrow fz="xs">
              <Group gap="0.375rem" style={{ cursor: 'default' }}>
                <Cpu size={12} aria-hidden="true" style={{ color: 'var(--phantom-accent-cyan)' }} />
                <Text fz="0.75rem" c="var(--phantom-text-secondary)">
                  {metrics.cpu.usage}%
                </Text>
              </Group>
            </Tooltip>
            <Text fz="0.75rem" c="var(--phantom-text-muted)">|</Text>
            <Popover width={260} position="bottom" shadow="md" withArrow>
              <Popover.Target>
                <Group gap="0.375rem" style={{ cursor: 'pointer' }}>
                  <MemoryStick size={12} aria-hidden="true" style={{ color: 'var(--phantom-accent-gold, var(--phantom-status-warning))' }} />
                  <Text fz="0.75rem" c="var(--phantom-text-secondary)">
                    {formatBytes(metrics.memory.used)}/{formatBytes(metrics.memory.total)} GB
                  </Text>
                </Group>
              </Popover.Target>
              <Popover.Dropdown
                style={{
                  backgroundColor: 'var(--phantom-surface-card)',
                  borderColor: 'var(--phantom-border-subtle)',
                  padding: 10,
                }}
              >
                <Text fw={600} fz="xs" c="var(--phantom-text-primary)" mb={4}>
                  Memory: {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)} GB ({metrics.memory.usedPercent}%)
                </Text>
                {metrics.swap && metrics.swap.total > 0 && (
                  <Text fz="xs" c="var(--phantom-text-secondary)" mb={4}>
                    Swap: {metrics.swap.used > 0 ? `${formatBytes(metrics.swap.used)} used of ${formatBytes(metrics.swap.total)}` : 'not in use'}{' '}
                    {metrics.swap.used > 0
                      ? <span style={{ color: 'var(--phantom-status-error, #ef4444)' }}>(memory pressure)</span>
                      : <span style={{ color: 'var(--phantom-status-success, #22c55e)' }}>(healthy)</span>}
                  </Text>
                )}
                {metrics.topProcesses?.length > 0 && (() => {
                  const phantom = metrics.topProcesses.filter((p) => p.name.startsWith('Phantom OS'));
                  const others = metrics.topProcesses.filter((p) => !p.name.startsWith('Phantom OS'));
                  return (
                    <div style={{ borderTop: '1px solid var(--phantom-border-subtle)', paddingTop: 6 }}>
                      {phantom.length > 0 && (() => {
                        const totalMB = phantom.reduce((sum, p) => sum + p.memMB, 0);
                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                              <Text fz="0.65rem" fw={700} c="var(--phantom-accent-glow)" tt="uppercase" style={{ letterSpacing: '0.05em' }}>Phantom OS Total</Text>
                              <Text fz="xs" fw={700} c="var(--phantom-accent-glow)">{totalMB >= 1024 ? `${(totalMB / 1024).toFixed(1)} GB` : `${totalMB} MB`}</Text>
                            </div>
                            {phantom.map((p) => (
                              <div key={p.pid} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 1, paddingLeft: 8 }}>
                                <Text fz="0.7rem" c="var(--phantom-text-secondary)" truncate style={{ maxWidth: 140 }}>{p.name.replace('Phantom OS ', '')}</Text>
                                <Text fz="0.7rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0 }}>{p.memMB >= 1024 ? `${(p.memMB / 1024).toFixed(1)} GB` : `${p.memMB} MB`}</Text>
                              </div>
                            ))}
                          </>
                        );
                      })()}
                      {others.length > 0 && (
                        <>
                          <Text fz="0.65rem" fw={600} c="var(--phantom-text-muted)" tt="uppercase" mb={2} mt={phantom.length > 0 ? 6 : 0} style={{ letterSpacing: '0.05em' }}>Other Processes</Text>
                          {others.map((p) => (
                            <div key={p.pid} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 1 }}>
                              <Text fz="xs" c="var(--phantom-text-secondary)" truncate style={{ maxWidth: 150 }}>{p.name}</Text>
                              <Text fz="xs" c="var(--phantom-text-muted)" style={{ flexShrink: 0 }}>{p.memMB >= 1024 ? `${(p.memMB / 1024).toFixed(1)} GB` : `${p.memMB} MB`}</Text>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })()}
              </Popover.Dropdown>
            </Popover>
          </>
        )}

        {/* Graph status — after memory metrics */}
        {graphStatus.phase !== 'idle' && (
          <>
            <Text fz="0.75rem" c="var(--phantom-text-muted)">|</Text>
            <GraphStatus />
          </>
        )}
      </Group>

      {/* Right: Gamification toggle + Font scale + Theme toggle */}
      <Group gap="xs" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Gamification Toggle */}
        <Tooltip label={gamificationOn ? 'Disable gamification' : 'Enable gamification'}>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => setPref('gamification', gamificationOn ? 'false' : 'true')}
            aria-label={gamificationOn ? 'Disable gamification' : 'Enable gamification'}
          >
            <Swords
              size={18}
              aria-hidden="true"
              style={{
                color: gamificationOn
                  ? 'var(--phantom-accent-cyan)'
                  : 'var(--phantom-text-muted)',
              }}
            />
          </ActionIcon>
        </Tooltip>

        {/* Font Scale Menu */}
        <Menu shadow="md" width={120} position="bottom-end">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label="Font scale settings"
            >
              <Type size={18} aria-hidden="true" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Font Scale</Menu.Label>
            {FONT_SCALE_OPTIONS.map((option) => (
              <Menu.Item
                key={option.value}
                onClick={() => setFontScale(option.value)}
                fw={fontScale === option.value ? 700 : 400}
                c={fontScale === option.value ? 'var(--phantom-accent-glow)' : undefined}
                aria-current={fontScale === option.value ? 'true' : undefined}
              >
                {option.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        {/* Theme Picker Menu */}
        <Menu shadow="md" width={180} position="bottom-end">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label="Theme picker"
            >
              <Palette size={18} aria-hidden="true" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Theme</Menu.Label>
            {themeRegistry.map((t) => (
              <Menu.Item
                key={t.name}
                onClick={() => setThemeName(t.name)}
                fw={themeName === t.name ? 700 : 400}
                c={themeName === t.name ? 'var(--phantom-accent-glow)' : undefined}
                aria-current={themeName === t.name ? 'true' : undefined}
                leftSection={
                  <Box
                    w={12}
                    h={12}
                    style={{
                      borderRadius: '50%',
                      background: t.colors[t.primaryColor]?.[5] ?? '#888',
                      border: '1px solid var(--phantom-border-subtle)',
                    }}
                  />
                }
              >
                {t.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        {/* Theme Toggle */}
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={toggleColorScheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDark ? (
            <Sun size={18} aria-hidden="true" />
          ) : (
            <Moon size={18} aria-hidden="true" />
          )}
        </ActionIcon>

        {/* Help */}
        <Popover width={360} position="bottom-end" shadow="md" withArrow>
          <Popover.Target>
            <ActionIcon variant="subtle" size="lg" aria-label="Help">
              <HelpCircle size={18} aria-hidden="true" />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown
            style={{
              backgroundColor: 'var(--phantom-surface-card)',
              borderColor: 'var(--phantom-border-subtle)',
              maxHeight: 480,
              overflowY: 'auto',
            }}
          >
            <Stack gap="xs">
              <Text fw={700} fz="sm" c="var(--phantom-text-primary)">
                PhantomOS Features
              </Text>

              {/* Core Concepts */}
              <Text fw={700} fz="0.65rem" tt="uppercase" c="var(--phantom-text-muted)" style={{ letterSpacing: '0.05em', marginTop: 4 }}>
                Core Concepts
              </Text>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Project</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  A git repository you've opened. Each project tracks its repo path, default branch, and worktrees.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Worktree</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  An isolated working copy of a project. Your first worktree uses the main branch directly. Additional worktrees create <strong>git worktrees</strong> — separate directories with their own branch, so you can work on multiple features simultaneously.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Panes</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Split your workspace into terminals, editors, diffs, and dashboards. Drag to rearrange, split horizontally or vertically.
                </Text>
              </div>

              {/* Git Workflow */}
              <Text fw={700} fz="0.65rem" tt="uppercase" c="var(--phantom-text-muted)" style={{ letterSpacing: '0.05em', marginTop: 4 }}>
                Git Workflow
              </Text>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Changes View</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Right sidebar → Changes tab. Shows staged and unstaged files. Click <strong>+</strong> to stage, <strong>−</strong> to unstage, <strong>↩</strong> to discard. Click a file name to view its diff.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Commit</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Stage files, type a commit message, then click Commit or press <strong>⌘+Enter</strong>. The commit area appears when files are staged.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Push / Pull</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Push and Pull buttons in the Changes header. <strong>Push</strong> lights up green when you have commits to push. <strong>Pull</strong> lights up gold when the remote is ahead.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">More Git Actions (⋮ menu)</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  <strong>Undo last commit</strong> — moves changes back to staged. <strong>Stash / Pop stash</strong> — shelve and restore changes. <strong>Fetch remote</strong> — update remote refs.
                </Text>
              </div>

              {/* Branch & Repo */}
              <Text fw={700} fz="0.65rem" tt="uppercase" c="var(--phantom-text-muted)" style={{ letterSpacing: '0.05em', marginTop: 4 }}>
                Branch & Repo
              </Text>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Branch Switcher</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Right-click a worktree in the sidebar to switch branches, create new branches, or run fetch/pull/push.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Clone Repository</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Click "Clone" on the welcome page to clone a repo via HTTPS or SSH URL and auto-create a project.
                </Text>
              </div>

              {/* Workspace Features */}
              <Text fw={700} fz="0.65rem" tt="uppercase" c="var(--phantom-text-muted)" style={{ letterSpacing: '0.05em', marginTop: 4 }}>
                Workspace
              </Text>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Recipes</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Auto-detected build/serve/test commands for your project. Click ▶ to run in a terminal pane. Star favorites for quick access.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Running Servers</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Shows active dev servers with uptime. Click to open in browser or stop the process.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Plans</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Claude Code plan files detected for your worktree. Click to open in an editor pane.
                </Text>
              </div>

              {/* Gamification */}
              <Text fw={700} fz="0.65rem" tt="uppercase" c="var(--phantom-text-muted)" style={{ letterSpacing: '0.05em', marginTop: 4 }}>
                Gamification
              </Text>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Hunter Rank</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Earn XP by completing tasks, starting sessions, and maintaining streaks. Ranks go from E through SSS to National Level. Toggle with the ⚔ button.
                </Text>
              </div>

              {/* Keyboard Shortcuts */}
              <Text fw={700} fz="0.65rem" tt="uppercase" c="var(--phantom-text-muted)" style={{ letterSpacing: '0.05em', marginTop: 4 }}>
                Keyboard Shortcuts
              </Text>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                {[
                  ['⌘ + Enter', 'Commit staged changes'],
                  ['⌘ + J', 'New Claude session'],
                  ['⌘ + K', 'Open chat'],
                  ['⌘ + T', 'New terminal'],
                  ['⌘ + W', 'Close pane'],
                  ['⌘ + \\', 'Split pane'],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: 'contents' }}>
                    <Text fz="xs" ff="'JetBrains Mono', monospace" c="var(--phantom-accent-cyan)" fw={600}>{key}</Text>
                    <Text fz="xs" c="var(--phantom-text-secondary)">{desc}</Text>
                  </div>
                ))}
              </div>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
    </Group>
  );
};
