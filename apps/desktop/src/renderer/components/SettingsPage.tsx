/**
 * SettingsPage Component
 * Sidebar navigation + scrollable content panel for all user preferences.
 * Scales as new sections are added.
 *
 * @author Subash Karki
 */
import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Divider,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  useMantineColorScheme,
} from '@mantine/core';
import { useAtom } from 'jotai';
import { Palette, Volume2, Puzzle, Play } from 'lucide-react';

import {
  type FontScale,
  fontScaleAtom,
  fontFamilyAtom,
  FONT_FAMILY_OPTIONS,
  themeNameAtom,
} from '../atoms/system';
import { usePreferences } from '../hooks/usePreferences';
import { useCeremonySounds, SOUND_EVENTS, SOUND_STYLES, type SoundStyle, type SoundEvent } from '../hooks/useCeremonySounds';
import { themeRegistry } from '@phantom-os/theme';

// ---------------------------------------------------------------------------
// Section registry — add new sections here to scale
// ---------------------------------------------------------------------------

interface SectionDef {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionDef[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'sounds', label: 'Sounds', icon: <Volume2 size={16} /> },
  { id: 'features', label: 'Features', icon: <Puzzle size={16} /> },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_SCALE_OPTIONS: { label: string; value: string }[] = [
  { label: '90%', value: '0.9' },
  { label: '100%', value: '1' },
  { label: '110%', value: '1.1' },
  { label: '125%', value: '1.25' },
  { label: '150%', value: '1.5' },
];

// ---------------------------------------------------------------------------
// Shared styles
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

const subRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  minHeight: 36,
  paddingLeft: 20,
};

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

export const SettingsPage = () => {
  const [activeSection, setActiveSection] = useState('appearance');
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [fontScale, setFontScale] = useAtom(fontScaleAtom);
  const [fontFamily, setFontFamily] = useAtom(fontFamilyAtom);
  const [themeName, setThemeName] = useAtom(themeNameAtom);
  const { prefs, isEnabled, setPref } = usePreferences();

  const isDark = colorScheme === 'dark';
  const soundsOn = isEnabled('sounds');
  const gamificationOn = isEnabled('gamification');
  const cavemanOn = isEnabled('caveman');

  const soundVolume = prefs.sounds_volume ? Number(prefs.sounds_volume) : 0.5;
  const soundStyle = (prefs.sounds_style ?? 'electronic') as SoundStyle;

  const isSoundEnabled = (key: string): boolean => {
    if (key in prefs) return prefs[key] === 'true';
    return true;
  };

  const eventMap: Partial<Record<SoundEvent, boolean>> = {};
  for (const evt of SOUND_EVENTS) {
    eventMap[evt.key] = isSoundEnabled(`sounds_evt_${evt.key}`);
  }

  const previewSounds = useCeremonySounds({
    enabled: true,
    volume: soundVolume,
    style: soundStyle,
    events: eventMap,
  });

  const themeOptions = themeRegistry.map((t) => ({
    label: (
      <Group gap={6} wrap="nowrap" justify="center">
        <Box
          w={10}
          h={10}
          style={{
            borderRadius: '50%',
            background: t.colors[t.primaryColor]?.[5] ?? '#888',
            border: '1px solid var(--phantom-border-subtle)',
            flexShrink: 0,
          }}
        />
        <span>{t.label}</span>
      </Group>
    ),
    value: t.name,
  }));

  const fontFamilyOptions = FONT_FAMILY_OPTIONS.map((o) => ({
    label: o.label,
    value: o.value,
  }));

  // -- Section content renderers --

  const renderAppearance = () => (
    <Stack gap="md">
      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Theme</div>
        <Stack gap="sm">
          <div style={rowStyle}>
            <Text style={rowLabelStyle}>Color Theme</Text>
            <SegmentedControl
              size="xs"
              data={themeOptions}
              value={themeName}
              onChange={(val) => setThemeName(val)}
              styles={{
                root: {
                  background: 'var(--phantom-surface-elevated, rgba(255,255,255,0.04))',
                  border: '1px solid var(--phantom-border-subtle)',
                },
              }}
            />
          </div>

          <Divider color="var(--phantom-border-subtle)" />

          <div style={rowStyle}>
            <div>
              <Text style={rowLabelStyle}>Dark Mode</Text>
              <Text style={rowDescStyle}>Toggle between dark and light color scheme</Text>
            </div>
            <Switch
              checked={isDark}
              onChange={toggleColorScheme}
              color="cyan"
              size="md"
              aria-label="Toggle dark mode"
            />
          </div>
        </Stack>
      </Paper>

      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Typography</div>
        <Stack gap="sm">
          <div style={rowStyle}>
            <Text style={rowLabelStyle}>Font Family</Text>
            <Select
              size="xs"
              w={180}
              data={fontFamilyOptions}
              value={fontFamily}
              onChange={(val) => { if (val) setFontFamily(val as typeof fontFamily); }}
              allowDeselect={false}
              styles={{
                input: {
                  background: 'var(--phantom-surface-elevated, rgba(255,255,255,0.04))',
                  borderColor: 'var(--phantom-border-subtle)',
                  color: 'var(--phantom-text-primary)',
                },
                dropdown: {
                  background: 'var(--phantom-surface-card)',
                  borderColor: 'var(--phantom-border-subtle)',
                },
              }}
            />
          </div>

          <Divider color="var(--phantom-border-subtle)" />

          <div style={rowStyle}>
            <Text style={rowLabelStyle}>Font Scale</Text>
            <SegmentedControl
              size="xs"
              data={FONT_SCALE_OPTIONS}
              value={String(fontScale)}
              onChange={(val) => setFontScale(Number(val) as FontScale)}
              styles={{
                root: {
                  background: 'var(--phantom-surface-elevated, rgba(255,255,255,0.04))',
                  border: '1px solid var(--phantom-border-subtle)',
                },
              }}
            />
          </div>
        </Stack>
      </Paper>
    </Stack>
  );

  const renderSounds = () => (
    <Stack gap="md">
      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>General</div>
        <Stack gap="sm">
          <div style={rowStyle}>
            <div>
              <Text style={rowLabelStyle}>Enable Sounds</Text>
              <Text style={rowDescStyle}>Master toggle for all ceremony sound effects</Text>
            </div>
            <Switch
              checked={soundsOn}
              onChange={(e) => setPref('sounds', e.currentTarget.checked ? 'true' : 'false')}
              color="cyan"
              size="md"
              aria-label="Enable sounds"
            />
          </div>

          <Divider color="var(--phantom-border-subtle)" />

          <div style={{ ...rowStyle, opacity: soundsOn ? 1 : 0.4, transition: 'opacity 150ms ease' }}>
            <div>
              <Text style={rowLabelStyle}>Volume</Text>
              <Text style={rowDescStyle}>{Math.round(soundVolume * 100)}%</Text>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(soundVolume * 100)}
              onChange={(e) => setPref('sounds_volume', String(Number(e.target.value) / 100))}
              disabled={!soundsOn}
              style={{
                width: 140,
                accentColor: 'var(--phantom-accent-cyan, #00d4ff)',
                cursor: soundsOn ? 'pointer' : 'not-allowed',
              }}
            />
          </div>

          <Divider color="var(--phantom-border-subtle)" />

          <div style={{ ...rowStyle, alignItems: 'flex-start', opacity: soundsOn ? 1 : 0.4, transition: 'opacity 150ms ease' }}>
            <div>
              <Text style={rowLabelStyle}>Sound Style</Text>
              <Text style={rowDescStyle}>{SOUND_STYLES[soundStyle]?.description ?? ''}</Text>
            </div>
            <SegmentedControl
              size="xs"
              disabled={!soundsOn}
              data={Object.entries(SOUND_STYLES).map(([key, s]) => ({ label: s.label, value: key }))}
              value={soundStyle}
              onChange={(val) => setPref('sounds_style', val)}
              styles={{
                root: {
                  background: 'var(--phantom-surface-elevated, rgba(255,255,255,0.04))',
                  border: '1px solid var(--phantom-border-subtle)',
                },
              }}
            />
          </div>
        </Stack>
      </Paper>

      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Boot Events</div>
        <Stack gap="xs">
          {SOUND_EVENTS.filter(e => e.group === 'boot').map((evt) => (
            <div
              key={evt.key}
              style={{ ...subRowStyle, paddingLeft: 0, opacity: soundsOn ? 1 : 0.4, transition: 'opacity 150ms ease' }}
            >
              <div style={{ flex: 1 }}>
                <Text style={rowLabelStyle}>{evt.label}</Text>
                <Text style={rowDescStyle}>{evt.description}</Text>
              </div>
              <Group gap={8} wrap="nowrap">
                <div
                  onClick={() => soundsOn && previewSounds.preview(evt.key)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: soundsOn ? 'pointer' : 'not-allowed',
                    border: '1px solid var(--phantom-border-subtle)',
                    background: 'var(--phantom-surface-elevated, rgba(255,255,255,0.04))',
                    opacity: soundsOn ? 0.7 : 0.3, transition: 'opacity 150ms ease',
                  }}
                  title="Preview"
                >
                  <Play size={12} style={{ color: 'var(--phantom-accent-cyan)' }} />
                </div>
                <Switch
                  checked={isSoundEnabled(`sounds_evt_${evt.key}`)}
                  onChange={(e) => setPref(`sounds_evt_${evt.key}`, e.currentTarget.checked ? 'true' : 'false')}
                  disabled={!soundsOn}
                  color="cyan"
                  size="sm"
                />
              </Group>
            </div>
          ))}
        </Stack>
      </Paper>

      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Shutdown Events</div>
        <Stack gap="xs">
          {SOUND_EVENTS.filter(e => e.group === 'shutdown').map((evt) => (
            <div
              key={evt.key}
              style={{ ...subRowStyle, paddingLeft: 0, opacity: soundsOn ? 1 : 0.4, transition: 'opacity 150ms ease' }}
            >
              <div style={{ flex: 1 }}>
                <Text style={rowLabelStyle}>{evt.label}</Text>
                <Text style={rowDescStyle}>{evt.description}</Text>
              </div>
              <Group gap={8} wrap="nowrap">
                <div
                  onClick={() => soundsOn && previewSounds.preview(evt.key)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: soundsOn ? 'pointer' : 'not-allowed',
                    border: '1px solid var(--phantom-border-subtle)',
                    background: 'var(--phantom-surface-elevated, rgba(255,255,255,0.04))',
                    opacity: soundsOn ? 0.7 : 0.3, transition: 'opacity 150ms ease',
                  }}
                  title="Preview"
                >
                  <Play size={12} style={{ color: 'var(--phantom-accent-cyan)' }} />
                </div>
                <Switch
                  checked={isSoundEnabled(`sounds_evt_${evt.key}`)}
                  onChange={(e) => setPref(`sounds_evt_${evt.key}`, e.currentTarget.checked ? 'true' : 'false')}
                  disabled={!soundsOn}
                  color="cyan"
                  size="sm"
                />
              </Group>
            </div>
          ))}
        </Stack>
      </Paper>

      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Terminal Events</div>
        <Text style={{ ...rowDescStyle, marginBottom: 8 }}>
          Sounds triggered by Claude Code sessions across your worktrees.
          Includes project and branch context so you know which session finished.
        </Text>
        <Stack gap="xs">
          {SOUND_EVENTS.filter(e => e.group === 'terminal').map((evt) => (
            <div
              key={evt.key}
              style={{ ...subRowStyle, paddingLeft: 0, opacity: soundsOn ? 1 : 0.4, transition: 'opacity 150ms ease' }}
            >
              <div style={{ flex: 1 }}>
                <Text style={rowLabelStyle}>{evt.label}</Text>
                <Text style={rowDescStyle}>{evt.description}</Text>
              </div>
              <Group gap={8} wrap="nowrap">
                <div
                  onClick={() => soundsOn && previewSounds.preview(evt.key)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: soundsOn ? 'pointer' : 'not-allowed',
                    border: '1px solid var(--phantom-border-subtle)',
                    background: 'var(--phantom-surface-elevated, rgba(255,255,255,0.04))',
                    opacity: soundsOn ? 0.7 : 0.3, transition: 'opacity 150ms ease',
                  }}
                  title="Preview"
                >
                  <Play size={12} style={{ color: 'var(--phantom-accent-cyan)' }} />
                </div>
                <Switch
                  checked={isSoundEnabled(`sounds_evt_${evt.key}`)}
                  onChange={(e) => setPref(`sounds_evt_${evt.key}`, e.currentTarget.checked ? 'true' : 'false')}
                  disabled={!soundsOn}
                  color="cyan"
                  size="sm"
                />
              </Group>
            </div>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );

  const renderFeatures = () => (
    <Stack gap="md">
      <Paper style={sectionCardStyle}>
        <div style={sectionTitleStyle}>Toggles</div>
        <Stack gap="sm">
          <div style={rowStyle}>
            <div>
              <Text style={rowLabelStyle}>Gamification</Text>
              <Text style={rowDescStyle}>
                Earn XP, level up your Hunter Rank, and track streaks across sessions
              </Text>
            </div>
            <Switch
              checked={gamificationOn}
              onChange={(e) => setPref('gamification', e.currentTarget.checked ? 'true' : 'false')}
              color="cyan"
              size="md"
              aria-label="Enable gamification"
            />
          </div>

          <Divider color="var(--phantom-border-subtle)" />

          <div style={rowStyle}>
            <div style={{ maxWidth: '70%' }}>
              <Text style={rowLabelStyle}>Concise Mode</Text>
              <Text style={rowDescStyle}>
                Makes Claude respond with fewer tokens — cutting ~65-75% of output verbosity while
                keeping full technical accuracy
              </Text>
            </div>
            <Switch
              checked={cavemanOn}
              onChange={(e) => setPref('caveman', e.currentTarget.checked ? 'true' : 'false')}
              color="cyan"
              size="md"
              aria-label="Enable concise mode"
            />
          </div>
        </Stack>
      </Paper>
    </Stack>
  );

  const SECTION_RENDERERS: Record<string, () => React.ReactNode> = {
    appearance: renderAppearance,
    sounds: renderSounds,
    features: renderFeatures,
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ---- Sidebar ---- */}
      <div
        style={{
          width: 200,
          minWidth: 200,
          borderRight: '1px solid var(--phantom-border-subtle)',
          background: 'var(--phantom-surface-bg)',
          padding: '24px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {/* Sidebar title */}
        <Text
          ff="Orbitron, sans-serif"
          fz="0.7rem"
          fw={800}
          c="var(--phantom-text-muted)"
          tt="uppercase"
          style={{ letterSpacing: '0.12em', padding: '0 16px', marginBottom: 12 }}
        >
          Settings
        </Text>

        {SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <div
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                cursor: 'pointer',
                borderLeft: isActive
                  ? '2px solid var(--phantom-accent-cyan, #00d4ff)'
                  : '2px solid transparent',
                background: isActive
                  ? 'rgba(0, 212, 255, 0.06)'
                  : 'transparent',
                transition: 'all 120ms ease',
              }}
            >
              <span
                style={{
                  color: isActive
                    ? 'var(--phantom-accent-cyan, #00d4ff)'
                    : 'var(--phantom-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 120ms ease',
                }}
              >
                {section.icon}
              </span>
              <Text
                fz="0.82rem"
                fw={isActive ? 600 : 400}
                c={isActive ? 'var(--phantom-text-primary)' : 'var(--phantom-text-secondary)'}
                style={{ transition: 'color 120ms ease' }}
              >
                {section.label}
              </Text>
            </div>
          );
        })}
      </div>

      {/* ---- Content ---- */}
      <ScrollArea h="100%" offsetScrollbars style={{ flex: 1 }}>
        <div style={{ maxWidth: 640, padding: '24px 32px 48px' }}>
          {SECTION_RENDERERS[activeSection]?.()}
        </div>
      </ScrollArea>
    </div>
  );
};
