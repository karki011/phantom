// Author: Subash Karki

import { For } from 'solid-js';
import { activeScreen, setActiveScreen, type ScreenId } from '../../core/signals/navigation';
import * as styles from './Dock.css';

interface DockItem {
  id: ScreenId;
  label: string;
  icon: string;
}

const dockItems: DockItem[] = [
  { id: 'command', label: 'Command', icon: '⌘' },
  { id: 'smart-view', label: 'Stream', icon: '◈' },
  { id: 'git-ops', label: 'Git', icon: '⎇' },
  { id: 'eagle-eye', label: 'Eagle Eye', icon: '◉' },
  { id: 'wards', label: 'Wards', icon: '⛊' },
  { id: 'playground', label: 'AI Lab', icon: '⬡' },
  { id: 'codeburn', label: 'Burn', icon: '◔' },
  { id: 'hunter', label: 'Hunter', icon: '⚔' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

interface DockProps {
  class?: string;
}

export const Dock = (props: DockProps) => {
  return (
    <nav class={`${styles.dock}${props.class ? ` ${props.class}` : ''}`}>
      <For each={dockItems}>
        {(item) => (
          <button
            class={styles.dockButton}
            classList={{ [styles.dockButtonActive]: activeScreen() === item.id }}
            onClick={() => setActiveScreen(item.id)}
          >
            <span class={styles.dockIcon}>{item.icon}</span>
            <span class={styles.dockLabel}>{item.label}</span>
          </button>
        )}
      </For>
    </nav>
  );
};
