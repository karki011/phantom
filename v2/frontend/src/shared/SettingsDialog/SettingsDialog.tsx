// PhantomOS v2 — Settings dialog shell
// Author: Subash Karki

import { For, Switch, Match, lazy } from 'solid-js';
import { Palette, Code2, Terminal, Sparkles, Cpu, Settings } from 'lucide-solid';
import { PhantomModal } from '@/shared/PhantomModal/PhantomModal';
import {
  settingsOpen,
  settingsSection,
  setSettingsSection,
  closeSettings,
  type SettingsSection,
} from '@/core/signals/settings';
import * as styles from './SettingsDialog.css';

const AppearanceSection = lazy(() => import('./sections/AppearanceSection'));
const EditorSection = lazy(() => import('./sections/EditorSection'));
const TerminalSection = lazy(() => import('./sections/TerminalSection'));
const FeaturesSection = lazy(() => import('./sections/FeaturesSection'));
const ProvidersSection = lazy(() => import('./sections/ProvidersSection'));
const SystemSection = lazy(() => import('./sections/SystemSection'));

const sidebarItems: { id: SettingsSection; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'editor', label: 'Editor', icon: Code2 },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'features', label: 'Features', icon: Sparkles },
  { id: 'providers', label: 'Providers', icon: Cpu },
  { id: 'system', label: 'System', icon: Settings },
];

export function SettingsDialog() {
  function handleOpenChange(open: boolean) {
    if (!open) closeSettings();
  }

  return (
    <PhantomModal
      open={settingsOpen}
      onOpenChange={handleOpenChange}
      title="Settings"
      size="2xl"
    >
      <div class={styles.settingsLayout}>
        <nav class={styles.settingsSidebar}>
          <For each={sidebarItems}>
            {(item) => (
              <button
                type="button"
                class={`${styles.sidebarItem} ${settingsSection() === item.id ? styles.sidebarItemActive : ''}`}
                onClick={() => setSettingsSection(item.id)}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            )}
          </For>
        </nav>

        <div class={styles.settingsContent}>
          <Switch>
            <Match when={settingsSection() === 'appearance'}>
              <AppearanceSection />
            </Match>
            <Match when={settingsSection() === 'editor'}>
              <EditorSection />
            </Match>
            <Match when={settingsSection() === 'terminal'}>
              <TerminalSection />
            </Match>
            <Match when={settingsSection() === 'features'}>
              <FeaturesSection />
            </Match>
            <Match when={settingsSection() === 'providers'}>
              <ProvidersSection />
            </Match>
            <Match when={settingsSection() === 'system'}>
              <SystemSection />
            </Match>
          </Switch>
        </div>
      </div>
    </PhantomModal>
  );
}
