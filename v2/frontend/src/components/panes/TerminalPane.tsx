// PhantomOS v2 — Terminal pane (xterm.js in pane system)
// Author: Subash Karki
//
// Integrates with the Terminal Runtime Registry so sessions survive
// SolidJS component unmount/remount cycles (tab switches, worktree changes).

import { onMount, onCleanup, createSignal, createEffect, Show } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import '@xterm/xterm/css/xterm.css';
import * as termStyles from '@/styles/terminal.css';
import {
  createSession,
  attachSession,
  detachSession,
  hasSession,
  getSession,
} from '@/core/terminal/registry';
import { activeTerminalThemeId, resolveTerminalTheme } from '@/core/terminal/theme-manager';
import {
  createTerminal as createBackendTerminal,
  restoreTerminal as restoreBackendTerminal,
  writeTerminal,
  writeBubbleteaProgram,
  resizeTerminal,
  getTerminalScrollback,
  runTerminalCommand,
} from '@/core/bindings';
import { vars } from '@/styles/theme.css';

interface TerminalPaneProps {
  paneId: string;
  cwd?: string;
  /** Worktree ID this terminal belongs to (for session linking). */
  worktreeId?: string;
  /** Project ID this terminal belongs to (for session linking). */
  projectId?: string;
  /** Present when rendered for a TUI pane — the Go-side session already exists. */
  sessionId?: string;
  /** Initial command to execute after the PTY is ready (plain terminal panes only). */
  command?: string;
  /** When true, restore from saved scrollback instead of creating fresh PTY. */
  restore?: boolean;
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
  const isReattach = hasSession(sessionId);

  onMount(async () => {
    // --- Reattach path: session already lives in the registry ---
    if (isReattach) {
      const session = attachSession(sessionId, containerRef);
      if (session) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            try {
              session.fitAddon.fit();
              session.terminal.focus();
            } catch {}
          }),
        );
        return;
      }
    }

    // --- Cold-start path: resolve CSS custom property values at runtime ---
    const cs = getComputedStyle(containerRef);
    const resolve = (cssVar: string, fallback: string): string => {
      const raw = cssVar.replace(/^var\(/, '').replace(/\)$/, '');
      return cs.getPropertyValue(raw).trim() || fallback;
    };

    const explicitTheme = resolveTerminalTheme(activeTerminalThemeId());
    const session = createSession(sessionId, {
      theme: explicitTheme ?? {
        background: resolve(vars.color.terminalBg, '#0a0a1a'),
        foreground: resolve(vars.color.terminalText, '#c8c5d4'),
        cursor: resolve(vars.color.terminalCursor, '#b794f6'),
        selectionBackground: resolve(vars.color.terminalSelection, 'rgba(139,92,255,0.3)'),
      },
    });

    // Attach wrapper into visible container
    attachSession(sessionId, containerRef);

    const { WebLinksAddon } = await import('@xterm/addon-web-links');
    const { openURL } = await import('@/core/bindings');
    const linkTooltip = document.createElement('div');
    Object.assign(linkTooltip.style, {
      position: 'fixed', background: 'rgba(0,0,0,0.85)', color: '#e0def4',
      padding: '3px 8px', borderRadius: '4px', fontSize: '12px',
      pointerEvents: 'none', zIndex: '9999', display: 'none',
      maxWidth: '400px', wordBreak: 'break-all',
    });
    document.body.appendChild(linkTooltip);
    onCleanup(() => linkTooltip.remove());
    session.terminal.loadAddon(new WebLinksAddon(
      (_event, url) => openURL(url),
      {
        hover(event: MouseEvent, text: string) {
          linkTooltip.textContent = text;
          linkTooltip.style.display = 'block';
          linkTooltip.style.left = `${event.clientX + 12}px`;
          linkTooltip.style.top = `${event.clientY - 28}px`;
        },
        leave() {
          linkTooltip.style.display = 'none';
        },
      },
    ));

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

    // Wait for the container to be visible (non-zero dimensions) before
    // creating the PTY. When a tab is created, SolidJS may render it with
    // display:none initially — creating the PTY at that point gives wrong
    // cols/rows and the terminal appears oversized.
    const waitForVisible = (): Promise<void> => {
      return new Promise((resolve) => {
        if (containerRef.offsetWidth > 0 && containerRef.offsetHeight > 0) {
          resolve();
          return;
        }
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            requestAnimationFrame(() => resolve());
          }
        });
        io.observe(containerRef);
      });
    };

    await waitForVisible();

    // Fit now that the container has real dimensions
    try { session.fitAddon.fit(); } catch {}

    // Create or restore PTY on the Go side — skipped for TUI panes (PTY already exists)
    if (!isTui) {
      if (props.restore) {
        await restoreBackendTerminal(sessionId);
      } else {
        const { cols, rows } = session.terminal;
        await createBackendTerminal(sessionId, props.worktreeId ?? '', props.projectId ?? '', props.cwd ?? '', cols, rows);
      }
    }

    // Subscribe to terminal output events emitted from Go via Wails runtime
    const runtime = (window as any).runtime;
    if (typeof runtime?.EventsOn === 'function') {
      const cleanup = runtime.EventsOn(
        `terminal:${sessionId}:data`,
        (data: string) => {
          try {
            const binary = atob(data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            session.terminal.write(bytes);
          } catch {
            session.terminal.write(data);
          }
        },
      );
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

    // Final fit, focus, and reveal
    requestAnimationFrame(() => {
      try {
        session.fitAddon.fit();
        session.terminal.focus();
      } catch {}
    });

    // Wait for shell readiness before sending initial command.
    // Matches v1 pattern: wait for prompt regex, 3 output chunks, or 2s timeout.
    if (props.command) {
      const command = props.command;
      let outputCount = 0;
      let sent = false;
      const promptPattern = /[$#%>❯➜]\s*$/;

      const sendCommand = () => {
        if (sent) return;
        sent = true;
        session.terminal.onData(() => {}); // no-op to avoid leak
        void runTerminalCommand(sessionId, command);
      };

      const disposable = session.terminal.onData((data: string) => {
        if (sent) return;
        outputCount++;
        if (outputCount >= 3 || promptPattern.test(data)) {
          disposable.dispose();
          setTimeout(sendCommand, 100);
        }
      });

      // Fallback: send after 2s regardless
      setTimeout(() => {
        disposable.dispose();
        sendCommand();
      }, 2000);
    }
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

  // IntersectionObserver: refit when the terminal becomes visible (tab switch).
  // Hides the container briefly to prevent a flash of wrong-sized content,
  // then reveals after fit completes.
  onMount(() => {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const session = getSession(sessionId);
          if (session) {
            containerRef.style.visibility = 'hidden';
            requestAnimationFrame(() => {
              try { session.fitAddon.fit(); } catch {}
              containerRef.style.visibility = '';
            });
          }
        }
      }
    });
    io.observe(containerRef);
    onCleanup(() => io.disconnect());
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
      <div class={termStyles.terminalContainer} ref={containerRef!} />
      <Show when={showSearch()}>
        <div class={termStyles.searchBar}>
          <TextField class={termStyles.searchInput}>
            <TextField.Input
              ref={searchInputRef!}
              class={termStyles.searchInputField}
              placeholder="Search..."
              value={searchQuery()}
              onInput={handleSearchInput}
              onKeyDown={handleSearchKeydown}
            />
          </TextField>
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
