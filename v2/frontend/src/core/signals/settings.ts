// PhantomOS v2 — Settings dialog signals
// Author: Subash Karki

import { createSignal } from 'solid-js';

export type SettingsSection = 'appearance' | 'editor' | 'terminal' | 'features' | 'providers' | 'system';

const [settingsOpen, setSettingsOpen] = createSignal(false);
const [settingsSection, setSettingsSection] = createSignal<SettingsSection>('appearance');

export function openSettings(section?: SettingsSection): void {
  if (section) setSettingsSection(section);
  setSettingsOpen(true);
}

export function closeSettings(): void {
  setSettingsOpen(false);
}

export { settingsOpen, setSettingsOpen, settingsSection, setSettingsSection };
