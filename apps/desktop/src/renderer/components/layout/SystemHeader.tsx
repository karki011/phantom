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
import { ArrowLeft, Circle, HelpCircle, Moon, Palette, Sun, Swords, Type } from 'lucide-react';
import { themeRegistry } from '@phantom-os/theme';

import { type FontScale, fontScaleAtom, themeNameAtom } from '../../atoms/system';
import { usePreferences } from '../../hooks/usePreferences';
import { useRouter } from '../../hooks/useRouter';

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

export const SystemHeader = ({ activeSessions, isConnected: isBackendConnected }: SystemHeaderProps) => {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [fontScale, setFontScale] = useAtom(fontScaleAtom);
  const [themeName, setThemeName] = useAtom(themeNameAtom);
  const { isHome, navigate } = useRouter();
  const { isEnabled, setPref } = usePreferences();
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

      {/* Center: Connection status */}
      <Group
        gap="0.375rem"
        style={{ cursor: activeSessions > 0 ? 'pointer' : 'default', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
        <Popover width={320} position="bottom-end" shadow="md" withArrow>
          <Popover.Target>
            <ActionIcon variant="subtle" size="lg" aria-label="Help">
              <HelpCircle size={18} aria-hidden="true" />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown
            style={{
              backgroundColor: 'var(--phantom-surface-card)',
              borderColor: 'var(--phantom-border-subtle)',
            }}
          >
            <Stack gap="sm">
              <Text fw={700} fz="sm" c="var(--phantom-text-primary)">
                PhantomOS Concepts
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
                  An isolated working copy of a project. Your first worktree uses the main branch directly. Each additional worktree creates a <strong>git worktree</strong> — a separate directory with its own branch and files, so you can work on multiple features without stashing or switching branches.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Panes</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Split your worktree into terminals, editors, session dashboards, and more. Drag panes to rearrange, split horizontally or vertically.
                </Text>
              </div>
              <div>
                <Text fw={600} fz="xs" c="var(--phantom-accent-glow)">Hunter Rank</Text>
                <Text fz="xs" c="var(--phantom-text-secondary)">
                  Your gamification level. Earn XP by completing tasks, starting sessions, and maintaining streaks. Ranks go from E through SSS to National Level.
                </Text>
              </div>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
    </Group>
  );
};
