// PhantomOS v2 — Terminal pane (xterm.js in pane system)
// Author: Subash Karki
//
// Integrates with the Terminal Runtime Registry so sessions survive
// SolidJS component unmount/remount cycles (tab switches, worktree changes).

import { onMount, onCleanup } from 'solid-js';
import '@xterm/xterm/css/xterm.css';
import * as termStyles from '@/styles/terminal.css';
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
  resizeTerminal,
  getTerminalScrollback,
} from '@/core/bindings';
import { vars } from '@/styles/theme.css';

interface TerminalPaneProps {
  paneId: string;
  cwd?: string;
}

export default function TerminalPane(props: TerminalPaneProps) {
  let containerRef!: HTMLDivElement;
  const sessionId = props.paneId;

  onMount(async () => {
    // --- Reattach path: session already lives in the registry ---
    if (hasSession(sessionId)) {
      const session = attachSession(sessionId, containerRef);
      if (session) {
        // Give the container a frame to settle its dimensions before refitting
        requestAnimationFrame(() => {
          try {
            session.fitAddon.fit();
          } catch {}
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

    // Wire user input to Go backend
    session.terminal.onData((data: string) => {
      void writeTerminal(sessionId, data);
    });

    // Wire resize events to Go backend
    session.terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      void resizeTerminal(sessionId, cols, rows);
    });

    // Create PTY on the Go side
    const { cols, rows } = session.terminal;
    await createBackendTerminal(sessionId, props.cwd ?? '', cols, rows);

    // Subscribe to terminal output events emitted from Go via Wails runtime
    const runtime = (window as any).runtime;
    if (typeof runtime?.EventsOn === 'function') {
      const cleanup = runtime.EventsOn(
        `terminal:${sessionId}:data`,
        (data: string) => {
          try {
            // Go sends base64-encoded bytes
            session.terminal.write(atob(data));
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

    // Final fit after everything is wired up
    requestAnimationFrame(() => {
      try {
        session.fitAddon.fit();
      } catch {}
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

  onCleanup(() => {
    // Detach but keep the session alive — PTY stays running for reattach
    detachSession(sessionId);
  });

  return <div class={termStyles.terminalContainer} ref={containerRef!} />;
}
