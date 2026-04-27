// PhantomOS v2 — xterm.js terminal pane with WebSocket and PTY reattach
// Author: Subash Karki

import { onMount, onCleanup } from 'solid-js';
import { Terminal as XTerm } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { vars } from '../styles/theme.css';
import { createTerminal, writeTerminal, resizeTerminal, getTerminalScrollback } from '../core/bindings';
import { MONO_FONT_FAMILY } from '../core/terminal/registry';
import { getZoomConfig } from '../core/signals/zoom';
import * as styles from './Terminal.css';
import type { WsMessage } from '../core/types';

export interface TerminalProps {
  sessionId: string;
  cwd: string;
}

const WS_URL = 'ws://localhost:9741/ws';

function waitForLayout(el: HTMLElement, maxMs = 500): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      if (el.clientWidth > 200 || performance.now() - start > maxMs) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

export function Terminal(props: TerminalProps) {
  let containerRef!: HTMLDivElement;
  let term: XTerm | undefined;
  let fitAddon: FitAddon | undefined;
  let ws: WebSocket | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let intersectionObserver: IntersectionObserver | undefined;

  onMount(async () => {
    // 1. Instantiate xterm with theme tokens
    const cs = getComputedStyle(containerRef);
    const resolve = (v: string, fallback: string) =>
      cs.getPropertyValue(v.replace(/^var\(/, '').replace(/\)$/, '')).trim() || fallback;

    term = new XTerm({
      fontFamily: MONO_FONT_FAMILY,
      fontSize: getZoomConfig().terminalFontSize,
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

    // 3. Mount to DOM and wait for container to have real dimensions
    term.open(containerRef);
    await waitForLayout(containerRef);
    fitAddon.fit();

    // 4. Cold restore: write scrollback before attaching PTY
    const scrollback = await getTerminalScrollback(props.sessionId);
    if (scrollback) {
      term.write(scrollback);
    }

    // 5. Create PTY on the backend (cols/rows are now accurate)
    await createTerminal(props.sessionId, props.cwd, term.cols, term.rows);

    // 5b. Safety refit — catch cases where layout settles after PTY creation
    setTimeout(() => {
      if (containerRef.clientWidth > 200) fitAddon?.fit();
    }, 150);

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

    // 9. ResizeObserver on both container and its parent (catches sidebar toggles)
    let resizeRaf = 0;
    const debouncedFit = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (containerRef.offsetWidth > 0 && containerRef.offsetHeight > 0) {
          fitAddon?.fit();
        }
      });
    };
    resizeObserver = new ResizeObserver(debouncedFit);
    resizeObserver.observe(containerRef);
    if (containerRef.parentElement?.parentElement) {
      resizeObserver.observe(containerRef.parentElement.parentElement);
    }

    // 10. IntersectionObserver — refit when tab becomes visible
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) debouncedFit();
      },
      { threshold: 0.1 },
    );
    intersectionObserver.observe(containerRef);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    ws?.close();
    term?.dispose();
    // NOTE: Do NOT call DestroyTerminal — PTY stays alive for reattach
  });

  return (
    <div class={styles.terminalPane}>
      <div class={styles.terminalHeader}>
        <span>Terminal</span>
        <span class={styles.dimmed}>·</span>
        <span class={styles.terminalCwdLabel}>{props.cwd}</span>
      </div>
      <div class={styles.terminalContainer} ref={containerRef} />
    </div>
  );
}
