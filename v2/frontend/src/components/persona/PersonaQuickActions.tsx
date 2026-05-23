// Author: Subash Karki

import type { Component } from 'solid-js';
import { For } from 'solid-js';
import { sendToPersona } from '@/core/persona/signals';
import * as styles from './PersonaDropdown.css';

interface QuickAction {
  label: string;
  query: string;
}

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { label: 'Claude status', query: 'what is claude doing' },
  { label: 'Git status', query: 'git status' },
  { label: 'What changed', query: 'what changed' },
  { label: 'Terminals', query: 'how many terminals are open' },
];

export const PersonaQuickActions: Component = () => {
  return (
    <div class={styles.quickActionsBar}>
      <For each={DEFAULT_QUICK_ACTIONS}>
        {(action) => (
          <button
            type="button"
            class={styles.quickActionChip}
            onClick={() => sendToPersona(action.query)}
            aria-label={`Quick action: ${action.label}`}
          >
            {action.label}
          </button>
        )}
      </For>
    </div>
  );
};
