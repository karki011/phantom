/**
 * Hook for terminal lifecycle — create, resize, WebSocket PTY.
 * Connects xterm.js to a real shell via the PhantomOS server.
 * @author Subash Karki
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from './theme.js';

/** Port the Hono API server listens on — must match @phantom-os/shared API_PORT */
const API_PORT = 3849;

/**
 * Track active terminal sessions to prevent React StrictMode double-mount
 * from creating duplicate PTYs. Maps paneId → cleanup function.
 */
const activeTerminals = new Map<string, () => void>();

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

    // Prevent duplicate terminals for the same paneId.
    // If one already exists, clean it up first.
    if (activeTerminals.has(paneId)) {
      activeTerminals.get(paneId)!();
      activeTerminals.delete(paneId);
    }

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

    const openTerminal = () => {
      if (opened) return;
      opened = true;

      term.open(container);
      fit.fit();

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://localhost:${API_PORT}/ws/terminal/${paneId}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        const dims = fit.proposeDimensions();
        if (ws) {
          const md = metadataRef.current;
          ws.send(JSON.stringify({
            type: 'init',
            cwd: cwdRef.current || null,
            cols: dims?.cols ?? 80,
            rows: dims?.rows ?? 24,
            initialCommand: initialCommandRef.current || undefined,
            ...(md?.workspaceId && { workspaceId: md.workspaceId }),
            ...(md?.projectId && { projectId: md.projectId }),
            ...(md?.recipeCommand && { recipeCommand: md.recipeCommand }),
            ...(md?.recipeLabel && { recipeLabel: md.recipeLabel }),
            ...(md?.recipeCategory && { recipeCategory: md.recipeCategory }),
            ...(md?.port != null && { port: md.port }),
            ...(md?.port != null && { env: { PORT: String(md.port) } }),
          }));
        }
      };

      let gotFirstOutput = false;
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') {
            term.write(msg.data);
            if (!gotFirstOutput) {
              gotFirstOutput = true;
              setConnected(true);
            }
          }
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

    const observer = new ResizeObserver(() => {
      if (!opened) {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          openTerminal();
        }
        return;
      }
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize', cols: dims.cols, rows: dims.rows,
        }));
      }
    });
    observer.observe(container);

    // Only use ResizeObserver — remove the requestAnimationFrame fallback
    // that was causing a duplicate openTerminal() race.

    const cleanup = () => {
      observer.disconnect();
      ws?.close();
      term.dispose();
      activeTerminals.delete(paneId);
    };

    activeTerminals.set(paneId, cleanup);

    return cleanup;
  }, [containerRef, paneId]);

  return { terminal: termRef, fit: fitRef, connected };
};
