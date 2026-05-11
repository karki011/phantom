// Phantom — Search Panel overlay (Cmd+Shift+F content search)
// Author: Subash Karki

import { createSignal, createEffect, onCleanup, Show, For, on } from 'solid-js';
import { Portal } from 'solid-js/web';
import { searchPanelVisible, closeSearchPanel } from '@/core/signals/search-panel';
import { activeWorktreeId } from '@/core/signals/app';
import { searchFileContents, type SearchResult } from '@/core/bindings/search';
import { openFileInEditor } from '@/core/editor/open-file';
import * as styles from './SearchPanel.css';

/** Debounce helper */
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as unknown as T;
}

/** Highlight a line's match by splitting into pre/match/post spans */
function HighlightedLine(props: { content: string; matchStart: number; matchEnd: number }) {
  const pre = () => props.content.slice(0, props.matchStart);
  const match = () => props.content.slice(props.matchStart, props.matchEnd);
  const post = () => props.content.slice(props.matchEnd);

  return (
    <span class={styles.lineContent}>
      {pre()}
      <span class={styles.matchHighlight}>{match()}</span>
      {post()}
    </span>
  );
}

/** Derive a short display path (last 2 segments) */
function shortPath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 2) return filePath;
  return '…/' + parts.slice(-2).join('/');
}

export function SearchPanel() {
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [loading, setLoading] = createSignal(false);

  const doSearch = debounce(async (q: string) => {
    const wtId = activeWorktreeId();
    if (!wtId || !q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const found = await searchFileContents(wtId, q.trim(), 100);
    setResults(found);
    setSelectedIndex(0);
    setLoading(false);
  }, 300);

  createEffect(on(query, (q) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    doSearch(q);
  }));

  // Reset state and focus input when panel opens
  createEffect(on(searchPanelVisible, (visible) => {
    if (visible) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      requestAnimationFrame(() => inputRef?.focus());
    }
  }));

  // Global Escape handler while panel is open
  function handleGlobalKeydown(e: KeyboardEvent) {
    if (!searchPanelVisible()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSearchPanel();
    }
  }

  createEffect(() => {
    if (searchPanelVisible()) {
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
      if (selected) selectResult(selected);
      return;
    }
  }

  function scrollSelectedIntoView() {
    requestAnimationFrame(() => {
      const el = listRef?.querySelector('[data-selected="true"]');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  function selectResult(result: SearchResult) {
    const wtId = activeWorktreeId();
    if (wtId) {
      openFileInEditor({
        workspaceId: wtId,
        filePath: result.filePath,
        line: result.lineNumber,
      });
    }
    closeSearchPanel();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      closeSearchPanel();
    }
  }

  const resultCountLabel = () => {
    const count = results().length;
    if (loading()) return '';
    if (!query().trim()) return '';
    if (count === 0) return '';
    return count >= 100 ? '100+ matches' : `${count} match${count === 1 ? '' : 'es'}`;
  };

  return (
    <Show when={searchPanelVisible()}>
      <Portal>
        <div class={styles.backdrop} onClick={handleBackdropClick}>
          <div class={styles.container}>
            {/* Search input row */}
            <div class={styles.searchRow}>
              <svg class={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                class={styles.searchInput}
                type="text"
                placeholder="Search file contents..."
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={handleInputKeydown}
                spellcheck={false}
                autocomplete="off"
              />
              <Show when={resultCountLabel()}>
                <span class={styles.resultCount}>{resultCountLabel()}</span>
              </Show>
            </div>

            {/* Results */}
            <Show when={query().trim()}>
              <div class={styles.resultsList} ref={listRef}>
                <Show when={loading() && results().length === 0}>
                  <div class={styles.emptyState}>Searching...</div>
                </Show>

                <Show when={!loading() && results().length === 0}>
                  <div class={styles.emptyState}>No matches found</div>
                </Show>

                <For each={results()}>
                  {(result, i) => (
                    <div
                      class={styles.resultItem}
                      data-selected={i() === selectedIndex() ? 'true' : 'false'}
                      onClick={() => selectResult(result)}
                      onMouseEnter={() => setSelectedIndex(i())}
                    >
                      <div class={styles.resultHeader}>
                        {/* File icon */}
                        <svg class={styles.fileIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M14 3v4a1 1 0 001 1h4M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7l-4-4z" />
                        </svg>
                        <span class={styles.filePath} title={result.filePath}>
                          {shortPath(result.filePath)}
                        </span>
                        <span class={styles.lineNumber}>:{result.lineNumber}</span>
                      </div>
                      <HighlightedLine
                        content={result.lineContent.trimStart()}
                        matchStart={Math.max(0, result.matchStart - (result.lineContent.length - result.lineContent.trimStart().length))}
                        matchEnd={Math.max(0, result.matchEnd - (result.lineContent.length - result.lineContent.trimStart().length))}
                      />
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Keyboard hint footer */}
            <div class={styles.shortcutHint}>
              <span class={styles.shortcutKey}>↑↓</span>
              <span class={styles.shortcutLabel}>navigate</span>
              <span class={styles.shortcutKey}>↵</span>
              <span class={styles.shortcutLabel}>open</span>
              <span class={styles.shortcutKey}>Esc</span>
              <span class={styles.shortcutLabel}>close</span>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
