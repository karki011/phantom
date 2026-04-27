// PhantomOS v2 — Documentation modal
// Author: Subash Karki

import { createSignal, createMemo, createEffect, onCleanup, For, Show, Switch, Match } from 'solid-js';
import { Dialog } from '@kobalte/core/dialog';
import { X } from 'lucide-solid';
import { DOC_SECTIONS } from './docs-content';
import type { ContentSection, DocItem } from './docs-content';
import { docsVisible, closeDocs } from '@/core/signals/docs';
import * as styles from './Docs.css';

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

/** Extract plain text from a ContentSection for search indexing. */
const extractSectionText = (section: ContentSection): string => {
  const parts: string[] = [];
  if (section.text) parts.push(section.text);
  if (section.items) parts.push(section.items.join(' '));
  if (section.headers) parts.push(section.headers.join(' '));
  if (section.rows) parts.push(section.rows.flat().join(' '));
  if (section.shortcuts) {
    for (const s of section.shortcuts) {
      parts.push(s.keys.join(' '));
      parts.push(s.action);
    }
  }
  return parts.join(' ');
};

/** Extract all searchable plain text from a DocItem. */
const extractItemText = (item: DocItem): string => {
  const parts = [item.label, item.content.title];
  for (const section of item.content.sections) {
    parts.push(extractSectionText(section));
  }
  return parts.join(' ');
};

interface SearchResult {
  id: string;
  label: string;
  matchSnippet: string;
}

/** Find the surrounding snippet around the first match of `query` in `text`. */
const findSnippet = (text: string, query: string): string => {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return '';

  const snippetRadius = 40;
  const start = Math.max(0, idx - snippetRadius);
  const end = Math.min(text.length, idx + query.length + snippetRadius);
  let snippet = '';
  if (start > 0) snippet += '...';
  snippet += text.slice(start, end).trim();
  if (end < text.length) snippet += '...';
  return snippet;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DocsScreen = () => {
  const [activePageId, setActivePageId] = createSignal(DOC_SECTIONS[0]?.items[0]?.id ?? '');
  const [searchQuery, setSearchQuery] = createSignal('');
  let searchInputRef: HTMLInputElement | undefined;

  const activePage = () => {
    for (const section of DOC_SECTIONS) {
      const item = section.items.find((i) => i.id === activePageId());
      if (item) return item.content;
    }
    return null;
  };

  // Compute search results reactively
  const searchResults = createMemo<SearchResult[]>(() => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];
    for (const section of DOC_SECTIONS) {
      for (const item of section.items) {
        const fullText = extractItemText(item);
        if (fullText.toLowerCase().includes(q)) {
          results.push({
            id: item.id,
            label: item.label,
            matchSnippet: findSnippet(fullText, q),
          });
        }
      }
    }
    return results;
  });

  // Auto-select first result when search results change
  createEffect(() => {
    const results = searchResults();
    if (results.length > 0) {
      setActivePageId(results[0].id);
    }
  });

  // Clear search when modal closes
  createEffect(() => {
    if (!docsVisible()) {
      setSearchQuery('');
    }
  });

  // Keyboard shortcut: Cmd/Ctrl+F to focus search
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!docsVisible()) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      e.stopPropagation();
      searchInputRef?.focus();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleKeyDown, true);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown, true));
  }

  return (
    <Dialog open={docsVisible()} onOpenChange={(open) => { if (!open) closeDocs(); }}>
      <Dialog.Portal>
        <Dialog.Overlay class={styles.docsOverlay} />
        <Dialog.Content class={styles.docsModal}>
          {/* Close button */}
          <button class={styles.docsClose} onClick={closeDocs} aria-label="Close docs">
            <X size={16} />
          </button>

          <div class={styles.docsLayout}>
            {/* Left sidebar navigation */}
            <nav class={styles.docsSidebar}>
              <Dialog.Title class={styles.sidebarTitle}>Documentation</Dialog.Title>

              {/* Search input */}
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search docs... (Cmd+F)"
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  const results = searchResults();
                  if (results.length === 0) return;
                  const currentIdx = results.findIndex((r) => r.id === activePageId());
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = currentIdx < results.length - 1 ? currentIdx + 1 : 0;
                    setActivePageId(results[next].id);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = currentIdx > 0 ? currentIdx - 1 : results.length - 1;
                    setActivePageId(results[prev].id);
                  }
                }}
                class={styles.searchInput}
              />

              <Show
                when={searchQuery().trim()}
                fallback={
                  /* Normal section navigation */
                  <For each={DOC_SECTIONS}>
                    {(section) => (
                      <>
                        <div class={styles.sidebarSection}>{section.title}</div>
                        <For each={section.items}>
                          {(item) => (
                            <button
                              class={styles.sidebarItem}
                              data-active={activePageId() === item.id}
                              onClick={() => setActivePageId(item.id)}
                            >
                              {item.label}
                            </button>
                          )}
                        </For>
                      </>
                    )}
                  </For>
                }
              >
                {/* Search results */}
                <div class={styles.sidebarSection}>
                  {searchResults().length} result{searchResults().length !== 1 ? 's' : ''}
                </div>
                <Show
                  when={searchResults().length > 0}
                  fallback={<div class={styles.noResults}>No matching docs found</div>}
                >
                  <For each={searchResults()}>
                    {(result) => (
                      <button
                        class={styles.sidebarItem}
                        data-active={activePageId() === result.id}
                        onClick={() => setActivePageId(result.id)}
                      >
                        <div>
                          {result.label}
                          <span class={styles.searchResultSnippet}>
                            {result.matchSnippet}
                          </span>
                        </div>
                      </button>
                    )}
                  </For>
                </Show>
              </Show>
            </nav>

            {/* Right content area */}
            <main class={styles.docsContent}>
              <Show when={activePage()}>
                {(page) => (
                  <div class={styles.docPage}>
                    <h1 class={styles.docTitle}>{page().title}</h1>
                    <For each={page().sections}>
                      {(section) => (
                        <DocSectionRenderer section={section} searchQuery={searchQuery().trim()} />
                      )}
                    </For>
                  </div>
                )}
              </Show>
            </main>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Content highlighting helper
// ---------------------------------------------------------------------------

/** Split text around query matches and wrap matches in highlight spans. */
const HighlightedText = (props: { text: string; query: string }) => {
  const parts = createMemo(() => {
    const q = props.query.toLowerCase();
    if (!q) return [{ text: props.text, highlight: false }];

    const result: { text: string; highlight: boolean }[] = [];
    let remaining = props.text;

    while (remaining.length > 0) {
      const idx = remaining.toLowerCase().indexOf(q);
      if (idx === -1) {
        result.push({ text: remaining, highlight: false });
        break;
      }
      if (idx > 0) {
        result.push({ text: remaining.slice(0, idx), highlight: false });
      }
      result.push({ text: remaining.slice(idx, idx + q.length), highlight: true });
      remaining = remaining.slice(idx + q.length);
    }
    return result;
  });

  return (
    <>
      <For each={parts()}>
        {(part) => (
          <Show when={part.highlight} fallback={<>{part.text}</>}>
            <mark class={styles.searchHighlight}>{part.text}</mark>
          </Show>
        )}
      </For>
    </>
  );
};

// ---------------------------------------------------------------------------
// Section renderer (with highlighting support)
// ---------------------------------------------------------------------------

const DocSectionRenderer = (props: { section: ContentSection; searchQuery: string }) => {
  const q = () => props.searchQuery;

  return (
    <Switch>
      <Match when={props.section.type === 'heading'}>
        <h2 class={styles.docSubtitle}>
          <HighlightedText text={props.section.text!} query={q()} />
        </h2>
      </Match>
      <Match when={props.section.type === 'h3'}>
        <h3 class={styles.docH3}>
          <HighlightedText text={props.section.text!} query={q()} />
        </h3>
      </Match>
      <Match when={props.section.type === 'paragraph'}>
        <p class={styles.docParagraph}>
          <HighlightedText text={props.section.text!} query={q()} />
        </p>
      </Match>
      <Match when={props.section.type === 'code'}>
        <pre class={styles.docCodeBlock}>
          <code>
            <HighlightedText text={props.section.text!} query={q()} />
          </code>
        </pre>
      </Match>
      <Match when={props.section.type === 'divider'}>
        <hr class={styles.docDivider} />
      </Match>
      <Match when={props.section.type === 'list'}>
        <ul class={styles.docList}>
          <For each={props.section.items}>
            {(item) => (
              <li>
                <HighlightedText text={item} query={q()} />
              </li>
            )}
          </For>
        </ul>
      </Match>
      <Match when={props.section.type === 'table'}>
        <table class={styles.docTable}>
          <Show when={props.section.headers}>
            <thead>
              <tr>
                <For each={props.section.headers}>
                  {(h) => (
                    <th>
                      <HighlightedText text={h} query={q()} />
                    </th>
                  )}
                </For>
              </tr>
            </thead>
          </Show>
          <tbody>
            <For each={props.section.rows}>
              {(row) => (
                <tr>
                  <For each={row}>
                    {(cell) => (
                      <td>
                        <HighlightedText text={cell} query={q()} />
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Match>
      <Match when={props.section.type === 'shortcuts'}>
        <table class={styles.docTable}>
          <thead>
            <tr>
              <th>Shortcut</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.section.shortcuts}>
              {(s) => (
                <tr>
                  <td>
                    <span class={styles.docShortcut}>
                      <For each={s.keys}>{(key) => <kbd>{key}</kbd>}</For>
                    </span>
                  </td>
                  <td>
                    <HighlightedText text={s.action} query={q()} />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Match>
    </Switch>
  );
};
