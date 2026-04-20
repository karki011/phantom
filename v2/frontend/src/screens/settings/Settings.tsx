// Author: Subash Karki

import { createSignal, For, onMount } from 'solid-js';
import { Tabs } from '@kobalte/core/tabs';
import { ToggleGroup } from '@kobalte/core/toggle-group';
import { TextField } from '@kobalte/core/text-field';
import { Switch } from '@kobalte/core/switch';
import { activeTheme, applyTheme, activeFontStyle, applyFontStyle, type ThemeId, type FontStyleId } from '../../core/signals/theme';
import { getPref, setPref, loadPref } from '../../core/signals/preferences';
import * as styles from './Settings.css';

const themes: { id: ThemeId; name: string; type: 'dark' | 'light'; accent: string }[] = [
  { id: 'system-core-dark', name: 'System Core', type: 'dark', accent: '#56CCFF' },
  { id: 'system-core-light', name: 'System Core', type: 'light', accent: '#169DDB' },
  { id: 'shadow-monarch-dark', name: 'Shadow Monarch', type: 'dark', accent: '#8B5CFF' },
  { id: 'shadow-monarch-light', name: 'Shadow Monarch', type: 'light', accent: '#6F45E8' },
  { id: 'hunter-rank-dark', name: 'Hunter Rank', type: 'dark', accent: '#3DDC97' },
  { id: 'hunter-rank-light', name: 'Hunter Rank', type: 'light', accent: '#12B76A' },
];

const fontStyles: { id: FontStyleId; label: string; sample: string; family: string }[] = [
  { id: 'system', label: 'System', sample: 'Aa Bb Cc', family: 'system-ui' },
  { id: 'mono', label: 'Monospace', sample: 'Aa Bb Cc', family: 'JetBrains Mono, monospace' },
  { id: 'gaming', label: 'Gaming', sample: 'Aa Bb Cc', family: 'Orbitron, sans-serif' },
];

export function Settings() {
  const [operatorName, setOperatorName] = createSignal('');
  const [gamificationEnabled, setGamificationEnabled] = createSignal(true);
  const [wardLevel, setWardLevel] = createSignal('medium');

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    const [name, gamification, ward] = await Promise.all([
      loadPref('operator_name'),
      loadPref('gamification_enabled'),
      loadPref('ward_level'),
    ]);
    setOperatorName(name);
    setGamificationEnabled((gamification || 'true') === 'true');
    setWardLevel(ward || 'medium');
  });

  function handleOperatorNameInput(value: string) {
    setOperatorName(value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void setPref('operator_name', value);
    }, 500);
  }

  function toggleGamification(checked: boolean) {
    setGamificationEnabled(checked);
    void setPref('gamification_enabled', String(checked));
  }

  function handleWardLevel(level: string) {
    setWardLevel(level);
    void setPref('ward_level', level);
  }

  function handleResetOnboarding() {
    void setPref('onboarding_completed', '').then(() => {
      window.location.reload();
    });
  }

  return (
    <Tabs orientation="vertical" defaultValue="theme" class={styles.settingsLayout}>
      <Tabs.List class={styles.sidebar}>
        <Tabs.Trigger value="theme" class={styles.sidebarItem}>Domain Theme</Tabs.Trigger>
        <Tabs.Trigger value="font" class={styles.sidebarItem}>Font Style</Tabs.Trigger>
        <Tabs.Trigger value="operator" class={styles.sidebarItem}>Operator</Tabs.Trigger>
        <Tabs.Trigger value="gamification" class={styles.sidebarItem}>Gamification</Tabs.Trigger>
        <Tabs.Trigger value="wards" class={styles.sidebarItem}>Ward Defense</Tabs.Trigger>
        <Tabs.Trigger value="danger" class={styles.sidebarItemDanger}>Danger Zone</Tabs.Trigger>
      </Tabs.List>

      <div class={styles.settingsContent}>
        <Tabs.Content value="theme" class={styles.settingsSection}>
          <ToggleGroup value={activeTheme()} onChange={(val) => { if (val) applyTheme(val as ThemeId); }} class={styles.themeGrid}>
            <For each={themes}>
              {(theme) => (
                <ToggleGroup.Item value={theme.id} class={styles.themeCard}>
                  <div class={styles.themePreview} style={{ background: theme.accent }} />
                  <div class={styles.themeName}>{theme.name}</div>
                  <div class={styles.themeType}>{theme.type === 'dark' ? 'DARK' : 'LIGHT'}</div>
                </ToggleGroup.Item>
              )}
            </For>
          </ToggleGroup>
        </Tabs.Content>

        <Tabs.Content value="font" class={styles.settingsSection}>
          <ToggleGroup value={activeFontStyle()} onChange={(val) => { if (val) applyFontStyle(val as FontStyleId); }} class={styles.fontGrid}>
            <For each={fontStyles}>
              {(font) => (
                <ToggleGroup.Item value={font.id} class={styles.fontCard}>
                  <div class={styles.fontSample} style={{ 'font-family': font.family }}>{font.sample}</div>
                  <div class={styles.fontLabel}>{font.label}</div>
                </ToggleGroup.Item>
              )}
            </For>
          </ToggleGroup>
        </Tabs.Content>

        <Tabs.Content value="operator" class={styles.settingsSection}>
          <div class={styles.fieldRow}>
            <div class={styles.fieldLabel}>Operator Name</div>
            <TextField>
              <TextField.Input
                class={styles.textInput}
                type="text"
                value={operatorName()}
                onInput={(e) => handleOperatorNameInput(e.currentTarget.value)}
              />
            </TextField>
          </div>
        </Tabs.Content>

        <Tabs.Content value="gamification" class={styles.settingsSection}>
          <div class={styles.fieldRow}>
            <div class={styles.fieldLabel}>Enable XP & Achievements</div>
            <Switch checked={gamificationEnabled()} onChange={toggleGamification} class={styles.switchRoot}>
              <Switch.Input class={styles.switchInput} />
              <Switch.Control class={styles.switchControl}>
                <Switch.Thumb class={styles.switchThumb} />
              </Switch.Control>
            </Switch>
          </div>
        </Tabs.Content>

        <Tabs.Content value="wards" class={styles.settingsSection}>
          <div class={styles.fieldRow}>
            <div class={styles.fieldLabel}>Defense Level</div>
            <ToggleGroup value={wardLevel()} onChange={(val) => { if (val) handleWardLevel(val); }} class={styles.selectGroup}>
              <For each={['Low', 'Medium', 'High']}>
                {(level) => (
                  <ToggleGroup.Item value={level.toLowerCase()} class={styles.selectOption}>
                    {level}
                  </ToggleGroup.Item>
                )}
              </For>
            </ToggleGroup>
          </div>
        </Tabs.Content>

        <Tabs.Content value="danger" class={styles.settingsSection}>
          <div class={styles.sectionDescription}>
            Reset onboarding to re-experience the System Awakening sequence
          </div>
          <button class={styles.dangerButton} onClick={handleResetOnboarding}>
            Reset Onboarding
          </button>
        </Tabs.Content>
      </div>
    </Tabs>
  );
}
