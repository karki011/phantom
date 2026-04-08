/**
 * Hook for terminal lifecycle — create, resize, WebSocket PTY.
 * Connects xterm.js to a real shell via the PhantomOS server.
 * @author Subash Karki
 */
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from './theme.js';

/** Port the Hono API server listens on — must match @phantom-os/shared API_PORT */
const API_PORT = 3849;

export const useTerminal = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  paneId: string,
  cwd?: string,
) => {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

    let ws: WebSocket | null = null;
    let opened = false;

    /**
     * Open the terminal and connect the WebSocket only once the
     * container has non-zero dimensions. This avoids the
     * "Cannot read properties of undefined (reading 'dimensions')"
     * crash that occurs when xterm.js tries to measure a zero-size
     * element.
     */
    const openTerminal = () => {
      if (opened) return;
      opened = true;

      term.open(container);
      fit.fit();

      // --- WebSocket to PTY server ---
      // Connect directly to the Hono server, bypassing the Vite dev proxy.
      // The proxy on port 3850 conflicts with WebSocket upgrade handling in
      // @hono/node-server, causing ERR_CONNECTION_RESET.
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://localhost:${API_PORT}/ws/terminal/${paneId}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        // Send init with cwd before resize so the server spawns PTY in the right directory
        if (ws) {
          ws.send(JSON.stringify({ type: 'init', cwd: cwd || null }));
        }
        const dims = fit.proposeDimensions();
        if (dims && ws) {
          ws.send(JSON.stringify({
            type: 'resize', cols: dims.cols, rows: dims.rows,
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') term.write(msg.data);
        } catch { /* ignore */ }
      };

      ws.onerror = (event) => {
        console.error('[Terminal] WebSocket error:', event);
      };

      ws.onclose = () => {
        term.write('\r\n[Disconnected]\r\n');
      };

      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });
    };

    // Use a ResizeObserver to wait for the container to have
    // dimensions before opening xterm.
    const observer = new ResizeObserver(() => {
      if (!opened) {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          openTerminal();
        }
        return;
      }

      // Normal resize handling after the terminal is open.
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize', cols: dims.cols, rows: dims.rows,
        }));
      }
    });
    observer.observe(container);

    // If the container already has dimensions (common when
    // re-mounting), open immediately on the next frame.
    if (container.offsetWidth > 0 && container.offsetHeight > 0) {
      requestAnimationFrame(() => openTerminal());
    }

    return () => {
      observer.disconnect();
      ws?.close();
      term.dispose();
    };
  }, [containerRef, paneId, cwd]);

  return { terminal: termRef, fit: fitRef };
};
