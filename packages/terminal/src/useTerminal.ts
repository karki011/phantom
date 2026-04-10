/**
 * useTerminal — Superset-inspired terminal lifecycle hook.
 *
 * Uses module-level state (state.ts) so xterm + WebSocket survive React
 * unmount/remount cycles. On unmount, detach is deferred by DETACH_DELAY_MS.
 * If the component remounts before the timeout fires, the existing session
 * is reattached to the new DOM container — zero flicker, no reconnection.
 *
 * @author Subash Karki
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from './theme.js';
import {
  sessions,
  pendingDetaches,
  DETACH_DELAY_MS,
  type TerminalSession,
} from './state.js';

/** Port the Hono API server listens on — must match @phantom-os/shared API_PORT */
const API_PORT = 3849;

export const useTerminal = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  paneId: string,
  cwd?: string,
  initialCommand?: string,
  metadata?: {
    workspaceId?: string;
    projectId?: string;
    recipeCommand?: string;
    recipeLabel?: string;
    recipeCategory?: string;
    port?: number | null;
  },
) => {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const initialCommandRef = useRef(initialCommand);
  initialCommandRef.current = initialCommand;
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---------------------------------------------------------------
    // 1. Check for pending detach — cancel it, session is still alive
    // ---------------------------------------------------------------
    const pendingTimeout = pendingDetaches.get(paneId);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingDetaches.delete(paneId);
    }

    // ---------------------------------------------------------------
    // 2. Reattach existing session (deferred detach was cancelled)
    // ---------------------------------------------------------------
    const existing = sessions.get(paneId);
    if (existing) {
      // Reattach xterm to new container DOM element
      existing.term.open(container);
      existing.fit.fit();
      termRef.current = existing.term;
      fitRef.current = existing.fit;
      setConnected(existing.connected);

      // Re-setup ResizeObserver for the new container
      existing.observer?.disconnect();
      const observer = new ResizeObserver(() => {
        existing.fit.fit();
        const dims = existing.fit.proposeDimensions();
        if (dims && existing.ws && existing.ws.readyState === WebSocket.OPEN) {
          existing.ws.send(JSON.stringify({
            type: 'resize', cols: dims.cols, rows: dims.rows,
          }));
        }
      });
      observer.observe(container);
      existing.observer = observer;

      // Cleanup: deferred detach on unmount
      return () => {
        observer.disconnect();
        existing.observer = null;
        scheduleDetach(paneId);
      };
    }

    // ---------------------------------------------------------------
    // 3. Fresh session — create xterm + WebSocket + PTY
    // ---------------------------------------------------------------
    const term = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'bar',
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    termRef.current = term;
    fitRef.current = fit;

    const session: TerminalSession = {
      term,
      fit,
      ws: null,
      connected: false,
      observer: null,
    };
    sessions.set(paneId, session);

    let opened = false;

    const openTerminal = () => {
      if (opened) return;
      opened = true;

      term.open(container);
      fit.fit();

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://localhost:${API_PORT}/ws/terminal/${paneId}`;
      const ws = new WebSocket(wsUrl);
      session.ws = ws;

      ws.onopen = () => {
        const dims = fit.proposeDimensions();
        const md = metadataRef.current;
        ws.send(JSON.stringify({
          type: 'init',
          cwd: cwdRef.current || null,
          cols: dims?.cols ?? 80,
          rows: dims?.rows ?? 24,
          initialCommand: initialCommandRef.current || undefined,
          ...(md?.workspaceId && { worktreeId: md.workspaceId }),
          ...(md?.projectId && { projectId: md.projectId }),
          ...(md?.recipeCommand && { recipeCommand: md.recipeCommand }),
          ...(md?.recipeLabel && { recipeLabel: md.recipeLabel }),
          ...(md?.recipeCategory && { recipeCategory: md.recipeCategory }),
          ...(md?.port != null && { port: md.port }),
          ...(md?.port != null && { env: { PORT: String(md.port) } }),
        }));
      };

      let gotFirstOutput = false;
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') {
            term.write(msg.data);
            if (!gotFirstOutput) {
              gotFirstOutput = true;
              session.connected = true;
              setConnected(true);
            }
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        term.write('\r\n\x1b[33m[Connection error]\x1b[0m\r\n');
      };

      ws.onclose = () => {
        term.write('\r\n\x1b[90m[Disconnected]\x1b[0m\r\n');
        session.connected = false;
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });
    };

    const observer = new ResizeObserver(() => {
      if (!opened) {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          openTerminal();
        }
        return;
      }
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims && session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          type: 'resize', cols: dims.cols, rows: dims.rows,
        }));
      }
    });
    observer.observe(container);
    session.observer = observer;

    // Cleanup: deferred detach on unmount
    return () => {
      observer.disconnect();
      session.observer = null;
      scheduleDetach(paneId);
    };
  }, [containerRef, paneId]);

  return { terminal: termRef, fit: fitRef, connected };
};

// ---------------------------------------------------------------------------
// Deferred detach — schedules cleanup after DETACH_DELAY_MS
// ---------------------------------------------------------------------------

function scheduleDetach(paneId: string): void {
  // If already pending, don't double-schedule
  if (pendingDetaches.has(paneId)) return;

  const timeout = setTimeout(() => {
    const session = sessions.get(paneId);
    if (session) {
      session.ws?.close();
      session.term.dispose();
      sessions.delete(paneId);
    }
    pendingDetaches.delete(paneId);
  }, DETACH_DELAY_MS);

  pendingDetaches.set(paneId, timeout);
}
