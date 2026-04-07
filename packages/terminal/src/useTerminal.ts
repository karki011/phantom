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

const WS_PORT = 3849;

export const useTerminal = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  paneId: string,
) => {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // --- WebSocket to PTY server ---
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const host = location.hostname || 'localhost';
    const wsUrl = `${proto}://${host}:${WS_PORT}/ws/terminal/${paneId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      const dims = fit.proposeDimensions();
      if (dims) {
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Resize handler
    const observer = new ResizeObserver(() => {
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize', cols: dims.cols, rows: dims.rows,
        }));
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      ws.close();
      term.dispose();
    };
  }, [containerRef, paneId]);

  return { terminal: termRef, fit: fitRef };
};
