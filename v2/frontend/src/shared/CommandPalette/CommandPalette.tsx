// PhantomOS v2 — Command palette component (Cmd+K)
// Author: Subash Karki

import { createSignal, createEffect, createMemo, on, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Search } from 'lucide-solid';
import { commandPaletteVisible, closeCommandPalette } from '@/core/signals/command-palette';
import { getAllActions, sortByCategory, type CommandAction, type ActionCategory } from './actions';
import { fuzzyFilter } from './fuzzy';
import * as styles from './CommandPalette.css';

// Category display order
const CATEGORY_ORDER: ActionCategory[] = [
  'Terminal', 'Navigation', 'Git', 'Session', 'Worktree', 'Theme', 'Zoom', 'System',
];

export const CommandPalette = () => {
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  // Build filtered + sorted action list reactively
  const filteredActions = createMemo(() => {
    const all = getAllActions();
    const q = query().trim();

    // Filter only enabled actions
    const enabled = all.filter((a) => a.enabled == null || a.enabled());

    if (!q) {
      // No query: show all, grouped by category order
      return sortByCategory(enabled);
    }

    // Fuzzy filter
    const results = fuzzyFilter(
      enabled,
      q,
      (action) => [action.label, ...(action.keywords ?? [])],
    );

    return results.map((r) => r.item);
  });

  // Group actions by category for rendering headers
  const groupedActions = createMemo(() => {
    const actions = filteredActions();
    const groups: { category: ActionCategory; actions: CommandAction[] }[] = [];
    let lastCategory: ActionCategory | null = null;

    for (const action of actions) {
      if (action.category !== lastCategory) {
        groups.push({ category: action.category, actions: [] });
        lastCategory = action.category;
      }
      groups[groups.length - 1].actions.push(action);
    }

    return groups;
  });

  // Flat list for keyboard navigation index
  const flatList = createMemo(() => filteredActions());

  // Reset state when palette opens
  createEffect(on(commandPaletteVisible, (visible) => {
    if (visible) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef?.focus());
    }
  }));

  // Global Escape handler
  createEffect(() => {
    if (!commandPaletteVisible()) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeCommandPalette();
      }
    };
    document.addEventListener('keydown', handler, true);
    onCleanup(() => document.removeEventListener('keydown', handler, true));
  });

  const handleInputKeydown = (e: KeyboardEvent) => {
    const count = flatList().length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % Math.max(count, 1));
      scrollSelectedIntoView();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + Math.max(count, 1)) % Math.max(count, 1));
      scrollSelectedIntoView();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = flatList()[selectedIndex()];
      if (selected) executeAction(selected);
      return;
    }
  };

  const scrollSelectedIntoView = () => {
    requestAnimationFrame(() => {
      listRef?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const executeAction = (action: CommandAction) => {
    closeCommandPalette();
    // Execute after closing so the palette doesn't block any UI the action opens
    queueMicrotask(() => action.execute());
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) closeCommandPalette();
  };

  // Build a flat index map for keyboard navigation across grouped rendering
  const flatIndexMap = createMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const group of groupedActions()) {
      for (const action of group.actions) {
        map.set(action.id, idx++);
      }
    }
    return map;
  });

  return (
    <Show when={commandPaletteVisible()}>
      <Portal>
        <div class={styles.backdrop} onClick={handleBackdropClick}>
          <div class={styles.container}>
            {/* Search */}
            <div class={styles.searchRow}>
              <Search size={16} class={styles.searchIcon} />
              <input
                ref={inputRef}
                class={styles.searchInput}
                type="text"
                placeholder="Type a command..."
                value={query()}
                onInput={(e) => {
                  setQuery(e.currentTarget.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleInputKeydown}
                spellcheck={false}
                autocomplete="off"
              />
              <span class={styles.escBadge}>ESC</span>
            </div>

            {/* Action list */}
            <div class={styles.actionList} ref={listRef}>
              <Show
                when={flatList().length > 0}
                fallback={<div class={styles.emptyState}>No matching commands</div>}
              >
                <For each={groupedActions()}>
                  {(group) => (
                    <>
                      <div class={styles.categoryHeader}>{group.category}</div>
                      <For each={group.actions}>
                        {(action) => {
                          const myIndex = () => flatIndexMap().get(action.id) ?? 0;
                          return (
                            <div
                              class={styles.actionItem}
                              data-selected={myIndex() === selectedIndex() ? 'true' : 'false'}
                              onClick={() => executeAction(action)}
                              onMouseEnter={() => setSelectedIndex(myIndex())}
                            >
                              <action.icon size={14} class={styles.actionIcon} />
                              <span class={styles.actionLabel}>{action.label}</span>
                              <Show when={action.shortcut}>
                                <span class={styles.shortcutBadge}>{action.shortcut}</span>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </>
                  )}
                </For>
              </Show>
            </div>

            {/* Footer hints */}
            <div class={styles.footer}>
              <span>
                <span class={styles.footerKbd}>{'↑↓'}</span> navigate
              </span>
              <span>
                <span class={styles.footerKbd}>{'↵'}</span> select
              </span>
              <span>
                <span class={styles.footerKbd}>esc</span> close
              </span>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};
