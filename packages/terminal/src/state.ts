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
    existing.fit.fit();

    // Repaint canvas — renderer skips frames while wrapper is detached
    existing.term.refresh(0, existing.term.rows - 1);

    // Send resize so server/PTY knows current dimensions
    if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
      const dims = existing.fit.proposeDimensions();
      if (dims) {
        existing.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    }

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
  fit.fit();

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

  // Connect WebSocket
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://localhost:${API_PORT}/ws/terminal/${paneId}`;
  const ws = new WebSocket(wsUrl);
  session.ws = ws;

  ws.onopen = () => {
    session.connected = true;
    const dims = fit.proposeDimensions();
    const md = options?.metadata;
    ws.send(JSON.stringify({
      type: 'init',
      cwd: options?.cwd || null,
      cols: dims?.cols ?? 80,
      rows: dims?.rows ?? 24,
      initialCommand: options?.initialCommand || undefined,
      ...(md?.workspaceId && { worktreeId: md.workspaceId }),
      ...(md?.projectId && { projectId: md.projectId }),
      ...(md?.recipeCommand && { recipeCommand: md.recipeCommand }),
      ...(md?.recipeLabel && { recipeLabel: md.recipeLabel }),
      ...(md?.recipeCategory && { recipeCategory: md.recipeCategory }),
      ...(md?.port != null && { port: md.port }),
      ...(md?.port != null && { env: { PORT: String(md.port) } }),
    }));
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
    term.write('\r\n\x1b[33m[Connection error]\x1b[0m\r\n');
  };

  ws.onclose = () => {
    session.connected = false;
  };

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
