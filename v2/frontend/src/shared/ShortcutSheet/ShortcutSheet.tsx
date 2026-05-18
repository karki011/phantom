// Phantom — Keyboard Shortcut Sheet overlay (Cmd+/)
// Author: Subash Karki

import { Show, For, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { shortcutSheetVisible, closeShortcutSheet } from '@/core/signals/shortcut-sheet';
import * as styles from './ShortcutSheet.css';

// ── Shortcut Data ─────────────────────────────────────────────────────────────

interface Shortcut {
  label: string;
  keys: string[];
}

interface ShortcutCategory {
  name: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: 'Terminal',
    shortcuts: [
      { label: 'New Terminal Tab', keys: ['⌘', 'T'] },
      { label: 'Split Terminal Right', keys: ['⌘', '\\'] },
      { label: 'Split Terminal Down', keys: ['⌘', '⇧', '\\'] },
      { label: 'Close Active Tab', keys: ['⌘', 'W'] },
      { label: 'Toggle Prompt Composer', keys: ['⌘', 'I'] },
      { label: 'Toggle Composer Drawer', keys: ['⌘', 'J'] },
    ],
  },
  {
    name: 'Navigation',
    shortcuts: [
      { label: 'Quick Open File', keys: ['⌘', 'P'] },
      { label: 'Command Palette', keys: ['⌘', 'K'] },
      { label: 'Search in Files', keys: ['⌘', '⇧', 'F'] },
      { label: 'Keyboard Shortcuts', keys: ['⌘', '/'] },
      { label: 'Switch to System Tab', keys: ['⌘', '1'] },
      { label: 'Switch to Project Tab', keys: ['⌘', '2'] },
      { label: 'Open Settings', keys: ['⌘', ','] },
      { label: 'Toggle Left Sidebar', keys: ['⌘', 'B'] },
      { label: 'Toggle Right Sidebar', keys: ['⌘', '⇧', 'B'] },
      { label: 'Next Tab', keys: ['⌘', '⇧', ']'] },
      { label: 'Previous Tab', keys: ['⌘', '⇧', '['] },
      { label: 'Navigate Forward', keys: ['⌘', ']'] },
      { label: 'Navigate Back', keys: ['⌘', '['] },
      { label: 'Cycle Pane Focus Right', keys: ['⌘', '⌥', '→'] },
      { label: 'Cycle Pane Focus Left', keys: ['⌘', '⌥', '←'] },
    ],
  },
  {
    name: 'Worktree',
    shortcuts: [
      { label: 'Switch Live Session (forward)', keys: ['⌃', '⇥'] },
      { label: 'Switch Live Session (backward)', keys: ['⌃', '⇧', '⇥'] },
    ],
  },
  {
    name: 'Git',
    shortcuts: [
      { label: 'Toggle Git Blame', keys: ['⌘', '⇧', 'G'] },
      { label: 'Open Recipe Picker', keys: ['⌘', '⇧', 'R'] },
    ],
  },
  {
    name: 'Zoom',
    shortcuts: [
      { label: 'Zoom In', keys: ['⌘', '+'] },
      { label: 'Zoom Out', keys: ['⌘', '-'] },
      { label: 'Reset Zoom', keys: ['⌘', '0'] },
    ],
  },
  {
    name: 'General',
    shortcuts: [
      { label: 'Close Overlay / Cancel', keys: ['Esc'] },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ShortcutSheet() {
  // Close on Escape
  function handleKeydown(e: KeyboardEvent) {
    if (!shortcutSheetVisible()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeShortcutSheet();
    }
  }

  createEffect(() => {
    if (shortcutSheetVisible()) {
      document.addEventListener('keydown', handleKeydown, true);
      onCleanup(() => document.removeEventListener('keydown', handleKeydown, true));
    }
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      closeShortcutSheet();
    }
  }

  return (
    <Show when={shortcutSheetVisible()}>
      <Portal>
        <div class={styles.backdrop} onClick={handleBackdropClick}>
          <div class={styles.container}>
            {/* Header */}
            <div class={styles.header}>
              <span class={styles.title}>Keyboard Shortcuts</span>
              <span class={styles.closeHint}>ESC to close</span>
            </div>

            {/* Body */}
            <div class={styles.body}>
              <For each={SHORTCUT_CATEGORIES}>
                {(category) => (
                  <div class={styles.categoryBlock}>
                    <div class={styles.categoryTitle}>{category.name}</div>
                    <div class={styles.shortcutGrid}>
                      <For each={category.shortcuts}>
                        {(shortcut) => (
                          <div class={styles.shortcutRow}>
                            <span class={styles.shortcutLabel}>{shortcut.label}</span>
                            <div class={styles.keyCombo}>
                              <For each={shortcut.keys}>
                                {(key) => <kbd class={styles.keyCap}>{key}</kbd>}
                              </For>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
