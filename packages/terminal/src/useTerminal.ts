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

export const useTerminal = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  paneId: string,
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
      // Connect through the same host:port as the page so the Vite dev proxy
      // (or any reverse proxy in production) handles the upgrade correctly.
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://${location.host}/ws/terminal/${paneId}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
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
  }, [containerRef, paneId]);

  return { terminal: termRef, fit: fitRef };
};
