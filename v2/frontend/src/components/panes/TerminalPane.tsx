// PhantomOS v2 — Terminal pane (xterm.js in pane system)
// Author: Subash Karki
//
// Integrates with the Terminal Runtime Registry so sessions survive
// SolidJS component unmount/remount cycles (tab switches, worktree changes).

import { onMount, onCleanup, createSignal, Show } from 'solid-js';
import '@xterm/xterm/css/xterm.css';
import * as termStyles from '@/styles/terminal.css';
import { PhantomLoader } from '@/shared/PhantomLoader/PhantomLoader';
import {
  createSession,
  attachSession,
  detachSession,
  hasSession,
  getSession,
} from '@/core/terminal/registry';
import {
  createTerminal as createBackendTerminal,
  writeTerminal,
  writeBubbleteaProgram,
  resizeTerminal,
  getTerminalScrollback,
} from '@/core/bindings';
import { vars } from '@/styles/theme.css';

interface TerminalPaneProps {
  paneId: string;
  cwd?: string;
  /** Present when rendered for a TUI pane — the Go-side session already exists. */
  sessionId?: string;
}

export default function TerminalPane(props: TerminalPaneProps) {
  let containerRef!: HTMLDivElement;
  let searchInputRef!: HTMLInputElement;
  // TUI panes supply their own sessionId; plain terminal panes use the paneId.
  const effectiveSessionId = props.sessionId || props.paneId;
  const isTui = !!props.sessionId;
  const sessionId = effectiveSessionId;
  const [showSearch, setShowSearch] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    // --- Reattach path: session already lives in the registry ---
    if (hasSession(sessionId)) {
      const session = attachSession(sessionId, containerRef);
      if (session) {
        // Give the container a frame to settle its dimensions before refitting
        requestAnimationFrame(() => {
          try {
            session.fitAddon.fit();
            session.terminal.focus();
          } catch {}
          setLoading(false);
        });
        return;
      }
    }

    // --- Cold-start path: resolve CSS custom property values at runtime ---
    const cs = getComputedStyle(containerRef);
    const resolve = (cssVar: string, fallback: string): string => {
      const raw = cssVar.replace(/^var\(/, '').replace(/\)$/, '');
      return cs.getPropertyValue(raw).trim() || fallback;
    };

    const session = createSession(sessionId, {
      theme: {
        background: resolve(vars.color.terminalBg, '#0a0a1a'),
        foreground: resolve(vars.color.terminalText, '#e0def4'),
        cursor: resolve(vars.color.terminalCursor, '#b794f6'),
        selectionBackground: resolve(vars.color.terminalSelection, 'rgba(139,92,255,0.3)'),
      },
    });

    // Attach wrapper into visible container
    attachSession(sessionId, containerRef);

    const { WebLinksAddon } = await import('@xterm/addon-web-links');
    session.terminal.loadAddon(new WebLinksAddon());

    const { SearchAddon } = await import('@xterm/addon-search');
    const searchAddon = new SearchAddon();
    session.terminal.loadAddon(searchAddon);
    session.searchAddon = searchAddon;

    // Wire user input to Go backend — TUI panes use WriteBubbleteaProgram
    session.terminal.onData((data: string) => {
      if (isTui) {
        void writeBubbleteaProgram(sessionId, data);
      } else {
        void writeTerminal(sessionId, data);
      }
    });

    // Wire resize events to Go backend
    session.terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      void resizeTerminal(sessionId, cols, rows);
    });

    // Create PTY on the Go side — skipped for TUI panes (PTY already exists)
    if (!isTui) {
      const { cols, rows } = session.terminal;
      await createBackendTerminal(sessionId, props.cwd ?? '', cols, rows);
    }

    // Subscribe to terminal output events emitted from Go via Wails runtime
    const runtime = (window as any).runtime;
    if (typeof runtime?.EventsOn === 'function') {
      const cleanup = runtime.EventsOn(
        `terminal:${sessionId}:data`,
        (data: string) => {
          try {
            // Go sends base64-encoded bytes — decode to Uint8Array so xterm
            // receives raw bytes (UTF-8, ANSI sequences) without Latin1 corruption.
            const binary = atob(data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            session.terminal.write(bytes);
          } catch {
            session.terminal.write(data);
          }
        },
      );
      // Wails EventsOn returns a cleanup function
      if (typeof cleanup === 'function') {
        session.unsubscribe = cleanup;
      }
    }

    // Restore scrollback from previous session (best-effort)
    try {
      const scrollback = await getTerminalScrollback(sessionId);
      if (scrollback) {
        session.terminal.write(scrollback);
      }
    } catch {
      /* first launch — no scrollback to restore */
    }

    // Final fit, focus, and reveal (minimum 600ms so the loader animation is visible)
    const mountedAt = performance.now();
    requestAnimationFrame(() => {
      try {
        session.fitAddon.fit();
        session.terminal.focus();
      } catch {}
      const elapsed = performance.now() - mountedAt;
      const remaining = Math.max(0, 600 - elapsed);
      setTimeout(() => setLoading(false), remaining);
    });
  });

  // ResizeObserver: refit xterm whenever the pane container resizes
  onMount(() => {
    const ro = new ResizeObserver(() => {
      const session = getSession(sessionId);
      if (session?.attached) {
        try {
          session.fitAddon.fit();
        } catch {}
      }
    });
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  // Cmd+F: toggle search bar
  onMount(() => {
    function handleKeydown(e: KeyboardEvent): void {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'f') {
        // Only intercept when this terminal container is focused
        if (!containerRef.contains(document.activeElement) && document.activeElement !== containerRef) return;
        e.preventDefault();
        setShowSearch(true);
        // Auto-focus input on next frame after Show renders
        requestAnimationFrame(() => searchInputRef?.focus());
      }
      if (e.key === 'Escape' && showSearch()) {
        e.preventDefault();
        closeSearch();
      }
    }
    containerRef.addEventListener('keydown', handleKeydown);
    // Also listen at document level so xterm canvas key events are caught
    document.addEventListener('keydown', handleKeydown);
    onCleanup(() => {
      containerRef.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('keydown', handleKeydown);
    });
  });

  function closeSearch(): void {
    setShowSearch(false);
    setSearchQuery('');
    // Return focus to terminal
    const session = getSession(sessionId);
    session?.terminal.focus();
  }

  function handleSearchInput(e: Event): void {
    const query = (e.currentTarget as HTMLInputElement).value;
    setSearchQuery(query);
    if (query) {
      const session = getSession(sessionId);
      session?.searchAddon?.findNext(query, { incremental: true });
    }
  }

  function findNext(): void {
    const query = searchQuery();
    if (!query) return;
    const session = getSession(sessionId);
    session?.searchAddon?.findNext(query);
  }

  function findPrevious(): void {
    const query = searchQuery();
    if (!query) return;
    const session = getSession(sessionId);
    session?.searchAddon?.findPrevious(query);
  }

  function handleSearchKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.shiftKey ? findPrevious() : findNext();
    }
    if (e.key === 'Escape') {
      closeSearch();
    }
  }

  onCleanup(() => {
    // Detach but keep the session alive — PTY stays running for reattach
    detachSession(sessionId);
  });

  return (
    <div class={termStyles.terminalWrapper}>
      <Show when={loading()}>
        <PhantomLoader message="Initializing terminal…" />
      </Show>
      <div class={termStyles.terminalContainer} ref={containerRef!} />
      <Show when={showSearch()}>
        <div class={termStyles.searchBar}>
          <input
            ref={searchInputRef!}
            class={termStyles.searchInput}
            type="text"
            placeholder="Search..."
            value={searchQuery()}
            onInput={handleSearchInput}
            onKeyDown={handleSearchKeydown}
          />
          <button class={termStyles.searchButton} onClick={findPrevious} title="Previous match (Shift+Enter)">
            ↑
          </button>
          <button class={termStyles.searchButton} onClick={findNext} title="Next match (Enter)">
            ↓
          </button>
          <button class={termStyles.searchCloseButton} onClick={closeSearch} title="Close (Esc)">
            ✕
          </button>
        </div>
      </Show>
    </div>
  );
}
