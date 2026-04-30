// Phantom — Quick Open overlay (Cmd+P file finder)
// Author: Subash Karki

import { createSignal, createEffect, onCleanup, Show, For, on } from 'solid-js';
import { Portal } from 'solid-js/web';
import { quickOpenVisible, closeQuickOpen } from '@/core/signals/quickopen';
import { activeWorktreeId } from '@/core/signals/app';
import { searchWorkspaceFiles } from '@/core/bindings';
import { openFileInEditor } from '@/core/editor/open-file';
import type { FileEntry } from '@/core/types';
import * as styles from './QuickOpen.css';

/** Debounce helper */
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as unknown as T;
}

/** Return file-type icon as SVG string based on extension */
function getFileIconPath(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  // Simple: use a generic file icon; specific icons per extension can be added later
  if (['ts', 'tsx'].includes(ext)) return 'M14 3v4a1 1 0 001 1h4M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7l-4-4z'; // doc
  if (['css', 'scss'].includes(ext)) return 'M14 3v4a1 1 0 001 1h4M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7l-4-4z';
  if (['go'].includes(ext)) return 'M14 3v4a1 1 0 001 1h4M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7l-4-4z';
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return 'M14 3v4a1 1 0 001 1h4M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7l-4-4z';
  return 'M14 3v4a1 1 0 001 1h4M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7l-4-4z';
}

export function QuickOpen() {
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [loading, setLoading] = createSignal(false);

  // Search when query changes
  const doSearch = debounce(async (q: string) => {
    const wtId = activeWorktreeId();
    if (!wtId || !q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const files = await searchWorkspaceFiles(wtId, q.trim());
    setResults(files.slice(0, 30));
    setSelectedIndex(0);
    setLoading(false);
  }, 150);

  createEffect(on(query, (q) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    doSearch(q);
  }));

  // Reset state when opening
  createEffect(on(quickOpenVisible, (visible) => {
    if (visible) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      // Focus input after portal mounts
      requestAnimationFrame(() => inputRef?.focus());
    }
  }));

  // Close on Escape key (global handler while open)
  function handleGlobalKeydown(e: KeyboardEvent) {
    if (!quickOpenVisible()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeQuickOpen();
      return;
    }
  }

  // Register global listener
  createEffect(() => {
    if (quickOpenVisible()) {
      document.addEventListener('keydown', handleGlobalKeydown, true);
      onCleanup(() => document.removeEventListener('keydown', handleGlobalKeydown, true));
    }
  });

  function handleInputKeydown(e: KeyboardEvent) {
    const items = results();
    const count = items.length;

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
      const selected = items[selectedIndex()];
      if (selected) selectFile(selected);
      return;
    }
  }

  function scrollSelectedIntoView() {
    requestAnimationFrame(() => {
      const el = listRef?.querySelector('[data-selected="true"]');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  function selectFile(file: FileEntry) {
    const wtId = activeWorktreeId();
    if (wtId) {
      openFileInEditor({ workspaceId: wtId, filePath: file.path });
    }
    closeQuickOpen();
  }

  function handleBackdropClick(e: MouseEvent) {
    // Close if clicking the backdrop (not the container)
    if (e.target === e.currentTarget) {
      closeQuickOpen();
    }
  }

  /** Derive the directory path (everything before the filename) */
  function dirPath(entry: FileEntry): string {
    const idx = entry.path.lastIndexOf('/');
    return idx > 0 ? entry.path.slice(0, idx) : '';
  }

  return (
    <Show when={quickOpenVisible()}>
      <Portal>
        <div class={styles.backdrop} onClick={handleBackdropClick}>
          <div class={styles.container}>
            {/* Search input */}
            <div class={styles.searchRow}>
              <svg class={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                class={styles.searchInput}
                type="text"
                placeholder="Search files by name or path..."
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={handleInputKeydown}
                spellcheck={false}
                autocomplete="off"
              />
            </div>

            {/* Results — only show when there's a query */}
            <Show when={query().trim()}>
              <div class={styles.resultsList} ref={listRef}>
                <Show when={results().length === 0 && !loading()}>
                  <div class={styles.emptyState}>
                    No matching files
                  </div>
                </Show>

                <Show when={loading() && results().length === 0}>
                  <div class={styles.emptyState}>
                    Searching...
                  </div>
                </Show>

                <For each={results()}>
                  {(entry, i) => (
                    <div
                      class={styles.resultItem}
                      data-selected={i() === selectedIndex() ? 'true' : 'false'}
                      onClick={() => selectFile(entry)}
                      onMouseEnter={() => setSelectedIndex(i())}
                    >
                      <svg class={styles.fileIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d={getFileIconPath(entry.name)} />
                      </svg>
                      <div class={styles.resultText}>
                        <span class={styles.fileName}>{entry.name}</span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
