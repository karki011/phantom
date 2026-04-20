// Author: Subash Karki

import { createSignal, createMemo, For, Show, onMount, onCleanup } from 'solid-js';
import { paletteOpen, setPaletteOpen, setActiveScreen, type ScreenId } from '../../core/signals/navigation';
import * as styles from './CommandPalette.css';

type PaletteItem = { id: string; screenId?: ScreenId; label: string; icon: string; hint: string };

const commands: PaletteItem[] = [
  { id: 'nav-command', screenId: 'command', label: 'Command Center', icon: '⌘', hint: 'Dashboard' },
  { id: 'nav-stream', screenId: 'smart-view', label: 'Smart View', icon: '◈', hint: 'Stream' },
  { id: 'nav-git', screenId: 'git-ops', label: 'Git Ops', icon: '⎇', hint: 'Branches' },
  { id: 'nav-eagle', screenId: 'eagle-eye', label: 'Eagle Eye', icon: '◉', hint: 'Worktrees' },
  { id: 'nav-wards', screenId: 'wards', label: 'Wards', icon: '⛊', hint: 'Safety' },
  { id: 'nav-lab', screenId: 'playground', label: 'AI Playground', icon: '⬡', hint: 'Pipelines' },
  { id: 'nav-burn', screenId: 'codeburn', label: 'CodeBurn', icon: '◔', hint: 'Costs' },
  { id: 'nav-hunter', screenId: 'hunter', label: 'Hunter Stats', icon: '⚔', hint: 'Gamification' },
  { id: 'nav-settings', screenId: 'settings', label: 'Settings', icon: '⚙', hint: 'Preferences' },
];

export function CommandPalette() {
  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  const filtered = createMemo(() => {
    const q = query().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)
    );
  });

  const selectItem = (item: PaletteItem) => {
    if (item.screenId) {
      setActiveScreen(item.screenId);
    }
    setPaletteOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!paletteOpen()) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered().length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered()[selectedIndex()];
      if (item) selectItem(item);
    } else if (e.key === 'Escape') {
      setPaletteOpen(false);
    }
  };

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const next = !paletteOpen();
      setPaletteOpen(next);
      if (next) {
        setQuery('');
        setSelectedIndex(0);
        requestAnimationFrame(() => inputRef?.focus());
      }
    } else if (e.key === 'Escape' && paletteOpen()) {
      setPaletteOpen(false);
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleGlobalKeyDown));
  });

  return (
    <Show when={paletteOpen()}>
      <div
        class={styles.overlay}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setPaletteOpen(false);
        }}
      >
        <div class={styles.palette} onKeyDown={handleKeyDown}>
          <div class={styles.searchRow}>
            <span class={styles.searchIcon}>⌕</span>
            <input
              ref={(el) => (inputRef = el)}
              class={styles.searchInput}
              placeholder="Search screens..."
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setSelectedIndex(0);
              }}
              autofocus
            />
          </div>
          <div class={styles.resultList}>
            <Show
              when={filtered().length > 0}
              fallback={<div class={styles.empty}>No results found</div>}
            >
              <For each={filtered()}>
                {(item, index) => (
                  <div
                    class={`${styles.resultItem}${index() === selectedIndex() ? ` ${styles.resultItemSelected}` : ''}`}
                    onMouseDown={() => selectItem(item)}
                    onMouseEnter={() => setSelectedIndex(index())}
                  >
                    <span class={styles.resultIcon}>{item.icon}</span>
                    <span class={styles.resultLabel}>{item.label}</span>
                    <span class={styles.resultHint}>{item.hint}</span>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
