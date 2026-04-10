/**
 * useTerminal — Terminal lifecycle hook.
 * Creates xterm.js + WebSocket on mount, cleans up on unmount.
 * Simple and reliable — no session reuse across mounts.
 *
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
 * Guard against React StrictMode double-mount creating duplicate PTYs.
 * If a terminal for this paneId is being set up, skip the duplicate.
 */
const initializing = new Set<string>();

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

    // StrictMode guard: skip if already initializing this paneId
    if (initializing.has(paneId)) return;
    initializing.add(paneId);

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
        const md = metadataRef.current;
        ws!.send(JSON.stringify({
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

    return () => {
      observer.disconnect();
      ws?.close();
      term.dispose();
      initializing.delete(paneId);
    };
  }, [containerRef, paneId]);

  return { terminal: termRef, fit: fitRef, connected };
};
