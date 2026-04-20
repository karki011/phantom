// PhantomOS v2 — xterm.js terminal pane with WebSocket and PTY reattach
// Author: Subash Karki

import { onMount, onCleanup } from 'solid-js';
import { Terminal as XTerm } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { vars } from '../styles/theme.css';
import { createTerminal, writeTerminal, resizeTerminal, getTerminalScrollback } from '../core/bindings';
import * as styles from './Terminal.css';
import type { WsMessage } from '../core/types';

export interface TerminalProps {
  sessionId: string;
  cwd: string;
}

const WS_URL = 'ws://localhost:9741/ws';

export function Terminal(props: TerminalProps) {
  let containerRef!: HTMLDivElement;
  let term: XTerm | undefined;
  let fitAddon: FitAddon | undefined;
  let ws: WebSocket | undefined;
  let resizeObserver: ResizeObserver | undefined;

  onMount(async () => {
    // 1. Instantiate xterm with theme tokens
    const cs = getComputedStyle(containerRef);
    const resolve = (v: string, fallback: string) =>
      cs.getPropertyValue(v.replace(/^var\(/, '').replace(/\)$/, '')).trim() || fallback;

    term = new XTerm({
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      theme: {
        background: resolve(vars.color.terminalBg, '#0a0a0f'),
        foreground: resolve(vars.color.terminalText, '#e2e8f0'),
        cursor: resolve(vars.color.terminalCursor, '#7c3aed'),
        selectionBackground: resolve(vars.color.terminalSelection, 'rgba(124, 58, 237, 0.3)'),
      },
      allowProposedApi: true,
    });

    // 2. Addons
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const webgl = new WebglAddon();
    // WebGL can fail in some environments; fall back gracefully
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);

    // 3. Mount to DOM
    term.open(containerRef);
    fitAddon.fit();

    // 4. Cold restore: write scrollback before attaching PTY
    const scrollback = await getTerminalScrollback(props.sessionId);
    if (scrollback) {
      term.write(scrollback);
    }

    // 5. Create PTY on the backend
    await createTerminal(props.sessionId, props.cwd, term.cols, term.rows);

    // 6. WebSocket connection
    ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';

    ws.addEventListener('message', (ev) => {
      try {
        const msg: WsMessage =
          typeof ev.data === 'string'
            ? JSON.parse(ev.data)
            : JSON.parse(new TextDecoder().decode(ev.data as ArrayBuffer));

        if (msg.type === 'terminal:data' && msg.session_id === props.sessionId) {
          const decoded = atob(msg.payload);
          term?.write(decoded);
        }
      } catch {
        // Malformed message — drop silently
      }
    });

    // 7. User input → backend
    term.onData((data) => {
      void writeTerminal(props.sessionId, data);
    });

    // 8. Resize → backend
    term.onResize(({ cols, rows }) => {
      void resizeTerminal(props.sessionId, cols, rows);
    });

    // 9. ResizeObserver to refit when pane size changes
    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit();
    });
    resizeObserver.observe(containerRef);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    ws?.close();
    term?.dispose();
    // NOTE: Do NOT call DestroyTerminal — PTY stays alive for reattach
  });

  return (
    <div class={styles.terminalPane}>
      <div class={styles.terminalHeader}>
        <span>Terminal</span>
        <span style={{ opacity: '0.4' }}>·</span>
        <span class={styles.terminalCwdLabel}>{props.cwd}</span>
      </div>
      <div class={styles.terminalContainer} ref={containerRef} />
    </div>
  );
}
