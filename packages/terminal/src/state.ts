/**
 * Terminal Runtime Registry — module-level singleton that keeps xterm + WebSocket
 * alive across React unmount/remount (worktree switches).
 * Matches Superset's v2 pattern: detach only removes wrapper from DOM,
 * WebSocket stays alive, no timers, no reconnection needed.
 * @author Subash Karki
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from './theme.js';

const API_PORT = 3849;

export interface TerminalSession {
  term: Terminal;
  fit: FitAddon;
  ws: WebSocket | null;
  connected: boolean;
  observer: ResizeObserver | null;
  container: HTMLDivElement | null;
  /** Persistent wrapper div — xterm opens into this once, never re-opened */
  wrapper: HTMLDivElement;
  /** True if this session is being restored from cold boot */
  coldRestore: boolean;
  /** True if the restore banner should show */
  showRestoreBanner: boolean;
  /** Saved viewport scroll position — restored on reattach */
  savedViewportY?: number;
  /** Whether the user was scrolled to the bottom when detached */
  wasAtBottom?: boolean;
}

export interface AttachOptions {
  cwd?: string;
  initialCommand?: string;
  metadata?: {
    workspaceId?: string;
    projectId?: string;
    recipeCommand?: string;
    recipeLabel?: string;
    recipeCategory?: string;
    port?: number | null;
  };
  coldRestore?: boolean;
}

/** Active terminal sessions — survives React unmount/remount */
export const sessions = new Map<string, TerminalSession>();

/** Check if a session exists in the registry */
export const hasSession = (paneId: string): boolean => sessions.has(paneId);

/** Get a session from the registry */
export const getSession = (paneId: string): TerminalSession | undefined => sessions.get(paneId);

/**
 * Attach a terminal session to a DOM container.
 * If session exists: move wrapper into container, refresh canvas, focus.
 * If new: create xterm + WebSocket, open into wrapper, append to container.
 */
export const attachSession = async (
  paneId: string,
  container: HTMLDivElement,
  options?: AttachOptions,
): Promise<TerminalSession> => {
  const existing = sessions.get(paneId);

  if (existing) {
    console.log(`[TermReg] REATTACH ${paneId.slice(0,8)} ws=${existing.ws?.readyState} bufferLines=${existing.term.buffer.active.length}`);

    // Move wrapper back into the visible container
    existing.container = container;
    container.appendChild(existing.wrapper);

    // Defer fit() until after browser layout — calling it synchronously
    // after appendChild measures the container before it has real dimensions,
    // which collapses the PTY to ~8 cols.
    requestAnimationFrame(() => {
      existing.fit.fit();

      // Repaint canvas — renderer skips frames while wrapper is detached
      existing.term.refresh(0, existing.term.rows - 1);

      // Restore scroll position saved during detach
      const buf = existing.term.buffer.active;
      if (existing.wasAtBottom) {
        // User was following live output — scroll to current bottom
        existing.term.scrollToBottom();
      } else if (existing.savedViewportY != null) {
        // User was scrolled up reviewing history — restore exact position
        // Clamp to current baseY in case buffer was trimmed
        const target = Math.min(existing.savedViewportY, buf.baseY);
        existing.term.scrollToLine(target);
      }
      existing.savedViewportY = undefined;
      existing.wasAtBottom = undefined;

      // Send resize so server/PTY knows current dimensions
      if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
        const dims = existing.fit.proposeDimensions();
        if (dims) {
          existing.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      }
    });

    // Resume ResizeObserver
    existing.observer?.disconnect();
    existing.observer = createResizeObserver(paneId, container);

    // Focus the terminal
    existing.term.focus();

    return existing;
  }

  // ─── Create new session ──────────────────────────────────────────────

  console.log(`[TermReg] CREATE ${paneId.slice(0,8)}`);

  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';

  const term = new Terminal({
    theme: getTerminalTheme(),
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    cursorBlink: true,
    cursorStyle: 'bar',
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());

  const session: TerminalSession = {
    term,
    fit,
    ws: null,
    connected: false,
    observer: null,
    container,
    wrapper,
    coldRestore: options?.coldRestore ?? false,
    showRestoreBanner: false,
  };
  sessions.set(paneId, session);

  // Open xterm into the persistent wrapper (done ONCE)
  container.appendChild(wrapper);
  term.open(wrapper);
  // Defer initial fit — synchronous fit() before browser layout yields ~8 cols.
  // The WebSocket onopen handler will call fit() again before sending init dims.
  requestAnimationFrame(() => fit.fit());

  // If cold restore, fetch and write scrollback BEFORE connecting WebSocket
  if (options?.coldRestore) {
    try {
      const resp = await fetch(`/api/terminal-sessions/scrollback/${paneId}`);
      if (resp.ok) {
        const { scrollback } = await resp.json();
        if (scrollback) {
          term.write(scrollback);
          session.showRestoreBanner = true;
        }
      }
    } catch {
      // Ignore — will just start fresh
    }
  }

  // Connect WebSocket with auto-reconnect
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://localhost:${API_PORT}/ws/terminal/${paneId}`;

  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 20;
  const RECONNECT_DELAYS = [500, 1000, 2000, 3000, 5000]; // escalating backoff

  function connectWs(isReconnect = false) {
    const ws = new WebSocket(wsUrl);
    session.ws = ws;

    ws.onopen = () => {
      session.connected = true;
      reconnectAttempts = 0;
      // Re-fit to ensure accurate dimensions — the deferred rAF fit may
      // not have fired yet if the WebSocket connected very quickly.
      fit.fit();
      const dims = fit.proposeDimensions();
      const md = options?.metadata;
      ws.send(JSON.stringify({
        type: 'init',
        cwd: options?.cwd || null,
        cols: dims?.cols ?? 80,
        rows: dims?.rows ?? 24,
        initialCommand: isReconnect ? undefined : (options?.initialCommand || undefined),
        reconnect: isReconnect || undefined,
        ...(md?.workspaceId && { worktreeId: md.workspaceId }),
        ...(md?.projectId && { projectId: md.projectId }),
        ...(md?.recipeCommand && { recipeCommand: md.recipeCommand }),
        ...(md?.recipeLabel && { recipeLabel: md.recipeLabel }),
        ...(md?.recipeCategory && { recipeCategory: md.recipeCategory }),
        ...(md?.port != null && { port: md.port }),
      }));

      if (isReconnect) {
        term.write('\r\n\x1b[32m[Reconnected]\x1b[0m\r\n');
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') {
          term.write(msg.data);
          if (!session.connected) session.connected = true;
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      if (!isReconnect) {
        term.write('\r\n\x1b[33m[Connection error]\x1b[0m\r\n');
      }
    };

    ws.onclose = () => {
      session.connected = false;

      // Auto-reconnect unless session was disposed
      if (!sessions.has(paneId)) return;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        term.write('\r\n\x1b[31m[Connection lost — max reconnect attempts reached. Close and reopen tab.]\x1b[0m\r\n');
        return;
      }

      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1)];
      reconnectAttempts++;

      if (reconnectAttempts === 1) {
        term.write('\r\n\x1b[33m[Connection lost — reconnecting...]\x1b[0m');
      }

      setTimeout(() => {
        if (sessions.has(paneId)) {
          connectWs(true);
        }
      }, delay);
    };
  }

  connectWs(false);

  // Wire terminal input — references session.ws so reconnection would work
  term.onData((data) => {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  // Set up ResizeObserver
  session.observer = createResizeObserver(paneId, container);

  return session;
};

/**
 * Detach a terminal session from its DOM container.
 * Just removes the wrapper from the DOM — xterm + WebSocket stay alive.
 * Matches Superset's detachFromContainer exactly.
 */
export const detachSession = (paneId: string): void => {
  const session = sessions.get(paneId);
  if (!session) return;

  console.log(`[TermReg] DETACH ${paneId.slice(0,8)} — wrapper stays alive, ws stays open`);

  // Save viewport scroll position BEFORE removing from DOM
  const buf = session.term.buffer.active;
  session.savedViewportY = buf.viewportY;
  session.wasAtBottom = buf.viewportY >= buf.baseY;

  // Disconnect ResizeObserver
  session.observer?.disconnect();
  session.observer = null;

  // Remove wrapper from DOM but keep it in memory
  session.wrapper.remove();
  session.container = null;

  // WebSocket stays open — PTY output continues to be written to xterm buffer.
  // When reattached, refresh() repaints the canvas with buffered content.
};

/**
 * Fully dispose a terminal session — kill PTY, close WebSocket, dispose xterm.
 * Called when a terminal pane is explicitly closed by the user.
 */
export const disposeSession = (paneId: string): void => {
  const session = sessions.get(paneId);
  if (!session) return;

  console.log(`[TermReg] DISPOSE ${paneId.slice(0,8)} — killing PTY + closing ws`);

  // Send kill message — server will close the ws after killing the PTY.
  // Don't call ws.close() here — it races with the send and the kill message
  // may not arrive before the close frame.
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type: 'kill' }));
  }

  // Disconnect observer
  session.observer?.disconnect();

  // Remove wrapper from DOM
  session.wrapper.remove();

  // Dispose xterm
  session.term.dispose();

  // Remove from registry
  sessions.delete(paneId);
};

/** Dispose all sessions — call on app shutdown */
export const disposeAllSessions = (): void => {
  for (const paneId of sessions.keys()) {
    disposeSession(paneId);
  }
};

/** Listen for terminal pane close events from the pane system */
if (typeof window !== 'undefined') {
  window.addEventListener('phantom:terminal-kill', ((event: CustomEvent<{ paneId: string }>) => {
    disposeSession(event.detail.paneId);
  }) as EventListener);
}

// ─── Internal helpers ─────────────────────────────────────────────────

function createResizeObserver(paneId: string, container: HTMLDivElement): ResizeObserver {
  const observer = new ResizeObserver(() => {
    const session = sessions.get(paneId);
    if (!session) return;
    session.fit.fit();
    const dims = session.fit.proposeDimensions();
    if (dims && session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
    }
  });
  observer.observe(container);
  return observer;
}
