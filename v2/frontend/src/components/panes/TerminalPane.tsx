// PhantomOS v2 — Terminal pane (xterm.js in pane system)
// Author: Subash Karki
//
// Integrates with the Terminal Runtime Registry so sessions survive
// SolidJS component unmount/remount cycles (tab switches, worktree changes).

import { onMount, onCleanup, createSignal, createEffect, createMemo, Show } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import type { ILink } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import * as termStyles from '@/styles/terminal.css';
import { TaskOverlay } from '@/shared/TaskOverlay/TaskOverlay';
import { sessions } from '@/core/signals/sessions';
import { cwdMatchesBidirectional } from '@/core/utils/path-match';
import { onWailsEvent } from '@/core/events';
import {
  createSession,
  attachSession,
  detachSession,
  hasSession,
  getSession,
  safeFit,
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
import { openFileInEditor } from '@/core/editor/open-file';

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
  const [linkedSessionId, setLinkedSessionId] = createSignal<string | null>(null);
  const isReattach = hasSession(sessionId);

  // Derive linked AI session: explicit link > command parse > CWD match > any active session
  const derivedSessionId = createMemo(() => {
    if (linkedSessionId()) return linkedSessionId();

    const activeSessions = sessions().filter(
      (s) => s.status === 'active' || s.status === 'paused',
    );

    // Try extracting session ID from the terminal command (e.g. claude --resume --session-id <id>)
    const cmd = props.command ?? '';
    if (cmd) {
      const sidMatch = cmd.match(/--session-id\s+(\S+)/);
      if (sidMatch) {
        const found = activeSessions.find((s) => s.id === sidMatch[1]);
        if (found) return found.id;
      }
    }

    // Try matching by CWD (bidirectional) — prefer most recently started
    const cwd = props.cwd;
    if (cwd) {
      const matches = activeSessions
        .filter((s) => cwdMatchesBidirectional(s.cwd, cwd))
        .sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0));
      if (matches.length > 0) return matches[0].id;
    }

    // Fallback: if there's exactly one active session, use it
    if (activeSessions.length === 1) return activeSessions[0].id;

    return null;
  });

  onWailsEvent<{ paneId: string; sessionId: string }>('terminal:linked', (data) => {
    if (data.paneId === sessionId) setLinkedSessionId(data.sessionId);
  });

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
        setTimeout(() => {
          try { session.fitAddon.fit(); } catch {}
        }, 150);
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

    // Store the working directory on the session for file path resolution
    if (props.cwd) session.cwd = props.cwd;
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

    // --- File path link provider: makes file paths in terminal output clickable ---
    const FILE_PATH_REGEX = /(?<![a-zA-Z0-9_\-/])(?:\.{1,2}\/[\w.\-/]+|~\/[\w.\-/]+|\/(?:Users|home|tmp|var|opt|etc)\/[\w.\-/]+|(?:src|lib|libs|app|apps|packages|tests?|spec|docs?|scripts?|config|\.ai|\.claude|\.github|\.vscode)\/[\w.\-/]+)(?:\.\w+)(?::\d+(?::\d+)?)?/g;
    const FILE_EXTENSIONS = new Set([
      'ts', 'tsx', 'js', 'jsx', 'md', 'json', 'yaml', 'yml', 'sh', 'css',
      'go', 'py', 'toml', 'html', 'sql', 'env', 'lock', 'mjs', 'cjs',
      'rs', 'rb', 'java', 'c', 'cpp', 'h', 'hpp', 'vue', 'svelte', 'scss',
      'less', 'graphql', 'gql', 'prisma', 'proto', 'xml', 'csv', 'txt',
    ]);

    // Create a reusable tooltip for file path hover (similar to WebLinksAddon tooltip)
    const fileTooltip = document.createElement('div');
    Object.assign(fileTooltip.style, {
      position: 'fixed', background: 'rgba(0,0,0,0.85)', color: '#e0def4',
      padding: '3px 8px', borderRadius: '4px', fontSize: '12px',
      pointerEvents: 'none', zIndex: '9999', display: 'none',
      maxWidth: '400px', wordBreak: 'break-all',
    });
    document.body.appendChild(fileTooltip);
    onCleanup(() => fileTooltip.remove());

    session.terminal.registerLinkProvider({
      provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void) {
        const line = session.terminal.buffer.active.getLine(bufferLineNumber);
        if (!line) { callback(undefined); return; }
        const text = line.translateToString();

        // Skip lines that are purely URLs (already handled by WebLinksAddon)
        if (/^\s*https?:\/\//.test(text.trim())) { callback(undefined); return; }

        const links: ILink[] = [];
        FILE_PATH_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
          const fullMatch = match[0];

          // Skip if this looks like a URL fragment
          const before = text.slice(Math.max(0, match.index - 8), match.index);
          if (/https?:\/\//.test(before)) continue;

          // Extract line:column suffix if present
          const lineColMatch = fullMatch.match(/^(.+?)(?::(\d+)(?::(\d+))?)?$/);
          if (!lineColMatch) continue;
          const pathPart = lineColMatch[1];
          const lineNum = lineColMatch[2] ? parseInt(lineColMatch[2], 10) : undefined;
          const colNum = lineColMatch[3] ? parseInt(lineColMatch[3], 10) : undefined;

          // Validate extension
          const extMatch = pathPart.match(/\.(\w+)$/);
          if (!extMatch || !FILE_EXTENSIONS.has(extMatch[1])) continue;

          const startX = match.index + 1; // xterm uses 1-based columns
          links.push({
            range: {
              start: { x: startX, y: bufferLineNumber },
              end: { x: startX + fullMatch.length, y: bufferLineNumber },
            },
            text: fullMatch,
            decorations: {
              pointerCursor: true,
              underline: true,
            },
            activate: (_event: MouseEvent, _text: string) => {
              // Resolve path relative to terminal's cwd
              let filePath = pathPart;
              const cwd = session.cwd || props.cwd || '';

              if (filePath.startsWith('./')) {
                filePath = filePath.slice(2);
              }
              // Relative paths get resolved against cwd
              if (!filePath.startsWith('/') && !filePath.startsWith('~')) {
                filePath = cwd ? `${cwd.replace(/\/$/, '')}/${filePath}` : filePath;
              }
              // Expand ~ to the user's home directory (derive from cwd or fall back)
              if (filePath.startsWith('~/')) {
                // cwd is typically /Users/<name>/... — extract home from it
                const homeMatch = cwd.match(/^(\/(?:Users|home)\/[^/]+)/);
                if (homeMatch) {
                  filePath = filePath.replace(/^~/, homeMatch[1]);
                }
              }

              openFileInEditor({
                workspaceId: props.worktreeId ?? '',
                filePath,
                line: lineNum,
                column: colNum,
              });
            },
            hover: (event: MouseEvent, _text: string) => {
              const cwd = session.cwd || props.cwd || '';
              const displayPath = pathPart.startsWith('/') || pathPart.startsWith('~')
                ? pathPart
                : cwd ? `${cwd.replace(/\/$/, '')}/${pathPart.replace(/^\.\//, '')}` : pathPart;
              fileTooltip.textContent = `Open ${displayPath}${lineNum ? `:${lineNum}` : ''}`;
              fileTooltip.style.display = 'block';
              fileTooltip.style.left = `${event.clientX + 12}px`;
              fileTooltip.style.top = `${event.clientY - 28}px`;
            },
            leave: (_event: MouseEvent, _text: string) => {
              fileTooltip.style.display = 'none';
            },
          });
        }
        callback(links.length > 0 ? links : undefined);
      },
    });

    const { SearchAddon } = await import('@xterm/addon-search');
    const searchAddon = new SearchAddon();
    session.terminal.loadAddon(searchAddon);
    session.searchAddon = searchAddon;

    // Shift+Enter → send CSI u sequence so Claude Code recognizes it as newline
    session.terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type === 'keydown' && e.key === 'Enter' && e.shiftKey) {
        void writeTerminal(sessionId, '\x1b[13;2u');
        return false;
      }
      return true;
    });

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

    // Safety net: refit after flex layout fully settles
    setTimeout(() => {
      try { session.fitAddon.fit(); } catch {}
    }, 250);

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

  // ResizeObserver: refit xterm whenever the pane container resizes.
  // safeFit() skips when the container has zero dimensions (e.g. parent
  // has display:none during a tab switch) to avoid reflowing content to
  // MINIMUM_COLS and sending a bogus resize to the PTY backend.
  onMount(() => {
    const ro = new ResizeObserver(() => {
      const session = getSession(sessionId);
      if (session?.attached) safeFit(session);
    });
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  // IntersectionObserver: refit when the terminal becomes visible (tab switch).
  // Uses setTimeout to wait for flex layout to fully settle before measuring.
  onMount(() => {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const session = getSession(sessionId);
          if (session) {
            containerRef.style.visibility = 'hidden';
            setTimeout(() => {
              safeFit(session);
              containerRef.style.visibility = '';
            }, 50);
          }
        }
      }
    });
    io.observe(containerRef);
    onCleanup(() => io.disconnect());
  });


  // Refit when the app regains focus (e.g. user switches to another OS window and back)
  onMount(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          const session = getSession(sessionId);
          if (session?.attached) safeFit(session);
        }, 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    onCleanup(() => document.removeEventListener('visibilitychange', handleVisibility));
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

  const handleTerminalDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Internal sidebar drag
    const phantomPath = e.dataTransfer?.getData('text/phantom-path');
    if (phantomPath) {
      void writeTerminal(sessionId, phantomPath + ' ');
      return;
    }

    // External file drop from Finder
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const paths = Array.from(files)
        .map((f) => (f as any).path ?? f.name)
        .join(' ');
      void writeTerminal(sessionId, paths + ' ');
    }
  };

  return (
    <div
      class={termStyles.terminalWrapper}
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDrop={handleTerminalDrop}
    >
      <div class={termStyles.terminalContainer} ref={containerRef!} />
      <TaskOverlay sessionId={derivedSessionId()} worktreePath={props.cwd ?? ''} />
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
