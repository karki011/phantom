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
import { WebglAddon } from '@xterm/addon-webgl';
import { getTerminalTheme } from './theme.js';

/** Log scroll state for debugging — shows both xterm internal and DOM viewport positions */
function logScroll(label: string, term: Terminal, paneId?: string): void {
  const buf = term.buffer.active;
  const viewport = term.element?.querySelector('.xterm-viewport') as HTMLElement | null;
  const id = paneId ? paneId.slice(0, 8) : '?';
  console.log(
    `[TermScroll] ${label} pane=${id}`,
    `viewportY=${buf.viewportY}`,
    `baseY=${buf.baseY}`,
    `lines=${buf.length}`,
    `rows=${term.rows}`,
    `atBottom=${buf.viewportY >= buf.baseY}`,
    viewport ? `DOM:scrollTop=${Math.round(viewport.scrollTop)} scrollHeight=${viewport.scrollHeight} clientHeight=${viewport.clientHeight}` : 'DOM:no-viewport',
  );
}

/**
 * Force xterm to recalculate viewport scroll dimensions.
 * Fixes: viewport scroll desync after fit() where mouse-wheel
 * scrolling appears broken until text selection triggers a recalc.
 * Reading then writing scrollTop forces a reflow of the scroll geometry.
 */
function syncViewport(term: Terminal, label?: string): void {
  const viewport = term.element?.querySelector('.xterm-viewport') as HTMLElement | null;
  if (!viewport) return;
  const before = viewport.scrollTop;
  // eslint-disable-next-line no-self-assign -- intentional reflow trigger
  viewport.scrollTop = before;
  const after = viewport.scrollTop;
  if (label && before !== after) {
    console.log(`[TermScroll] syncViewport(${label}) scrollTop changed: ${Math.round(before)} → ${Math.round(after)}`);
  }
}

const apiBase = (window as any).__PHANTOM_API_BASE ?? '';
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
  /** Flag to prevent ResizeObserver from interfering during reattach scroll restoration */
  _restoringScroll?: boolean;
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

/**
 * Offscreen container — keeps detached terminal wrappers in the DOM
 * so xterm.js viewport scroll state stays valid across worktree switches.
 * Mirrors VS Code's pattern of keeping hidden terminals in the DOM.
 */
const offscreen = typeof document !== 'undefined' ? (() => {
  const el = document.createElement('div');
  el.id = 'phantom-terminal-offscreen';
  // Real dimensions (not 0×0) so xterm viewport scroll geometry stays valid.
  // Off-screen via fixed positioning — no visibility:hidden (which skips paint).
  el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;height:400px;overflow:hidden;pointer-events:none;';
  document.body.appendChild(el);
  return el;
})() : null;

/** Check if a session exists in the registry */
export const hasSession = (paneId: string): boolean => sessions.has(paneId);

/** Get a session from the registry */
export const getSession = (paneId: string): TerminalSession | undefined => sessions.get(paneId);

/** Track in-progress attach calls to prevent concurrent attaches for the same pane */
const attaching = new Set<string>();

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
  if (attaching.has(paneId)) {
    // Already attaching — wait for the in-progress attach to finish
    const existing = sessions.get(paneId);
    if (existing) return existing;
    // Shouldn't happen, but fall through to create
  }
  attaching.add(paneId);

  try {
  const existing = sessions.get(paneId);

  if (existing) {
    console.log(`[TermReg] REATTACH ${paneId.slice(0,8)} ws=${existing.ws?.readyState} bufferLines=${existing.term.buffer.active.length}`);

    // Move wrapper back into the visible container
    existing.container = container;
    container.appendChild(existing.wrapper);

    // Capture scroll intent before any DOM work mutates xterm state
    const restoreWasAtBottom = existing.wasAtBottom;
    const restoreViewportY = existing.savedViewportY;
    existing.savedViewportY = undefined;
    existing.wasAtBottom = undefined;

    logScroll('REATTACH:before-move', existing.term, paneId);
    console.log(`[TermScroll] REATTACH saved: wasAtBottom=${restoreWasAtBottom} viewportY=${restoreViewportY}`);

    // Block ResizeObserver from interfering during scroll restoration
    existing._restoringScroll = true;

    // Single rAF — wrapper was kept in the DOM (offscreen container) so
    // xterm viewport dimensions are still valid. Just need to re-fit
    // to the new container size and restore scroll.
    requestAnimationFrame(() => {
      logScroll('REATTACH:rAF-before-fit', existing.term, paneId);

      existing.fit.fit();
      logScroll('REATTACH:after-fit', existing.term, paneId);

      syncViewport(existing.term, 'reattach-post-fit');
      logScroll('REATTACH:after-syncViewport', existing.term, paneId);

      // Repaint canvas — renderer skips frames while wrapper was offscreen
      existing.term.refresh(0, existing.term.rows - 1);

      // Send resize so server/PTY knows current dimensions
      if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
        const dims = existing.fit.proposeDimensions();
        if (dims) {
          existing.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      }

      // Restore scroll — viewport geometry is valid since wrapper stayed in DOM
      const buf = existing.term.buffer.active;
      if (restoreWasAtBottom) {
        console.log(`[TermScroll] REATTACH:scrollToBottom`);
        existing.term.scrollToBottom();
      } else if (restoreViewportY != null) {
        const target = Math.min(restoreViewportY, buf.baseY);
        console.log(`[TermScroll] REATTACH:scrollToLine target=${target} (saved=${restoreViewportY} baseY=${buf.baseY})`);
        existing.term.scrollToLine(target);
      } else {
        console.log(`[TermScroll] REATTACH:scrollToBottom (no saved position)`);
        existing.term.scrollToBottom();
      }
      logScroll('REATTACH:after-scroll-restore', existing.term, paneId);

      // Force DOM scrollTop to match xterm's internal viewportY —
      // scrollToBottom()/scrollToLine() update xterm's buffer state but do NOT
      // set DOM scrollTop when the element was reparented between containers.
      // Without this, the DOM stays at scrollTop=0 and the first user scroll
      // starts from the top instead of the restored position.
      const viewport = existing.term.element?.querySelector('.xterm-viewport') as HTMLElement | null;
      if (viewport && buf.baseY > 0) {
        viewport.scrollTop = (buf.viewportY / buf.baseY) * (viewport.scrollHeight - viewport.clientHeight);
      } else if (viewport) {
        viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
      }
      logScroll('REATTACH:after-DOM-scrollTop-fix', existing.term, paneId);

      // Clear the flag and resume ResizeObserver AFTER scroll is restored
      existing._restoringScroll = false;
      existing.observer?.disconnect();
      existing.observer = createResizeObserver(paneId, container);
      console.log(`[TermScroll] REATTACH:complete — ResizeObserver resumed`);
    });

    // Check WebSocket health — if it died while detached, the terminal
    // would appear blank because no output is flowing. Reconnect now.
    if (!existing.ws || existing.ws.readyState === WebSocket.CLOSED || existing.ws.readyState === WebSocket.CLOSING) {
      console.log(`[TermReg] REATTACH-RECONNECT ${paneId.slice(0,8)} — ws dead, triggering reconnect`);
      existing.connected = false;
      // Call the stored reconnect function directly instead of dispatching
      // a synthetic focus event (which fires ALL focus handlers in the app).
      if ((existing as any)._reconnect) {
        (existing as any)._reconnect();
      }
    }

    // Focus the terminal
    existing.term.focus();

    return existing;
  }

  // ─── Create new session ──────────────────────────────────────────────

  console.log(`[TermReg] CREATE ${paneId.slice(0,8)}`);

  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.overflow = 'hidden';

  const term = new Terminal({
    theme: getTerminalTheme(),
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 500,
    fastScrollModifier: 'alt',
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

  // Load WebGL renderer — deferred until fonts are ready so the glyph atlas
  // builds against correct metrics (falls back to canvas on error).
  const loadWebgl = () => {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => { webgl.dispose(); });
      term.loadAddon(webgl);
    } catch {
      // WebGL not available — canvas renderer is the automatic fallback
    }
  };
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready
      .then(() => {
        if (!sessions.has(paneId)) return;
        loadWebgl();
      })
      .catch(() => loadWebgl());
  } else {
    loadWebgl();
  }

  // Double-rAF: first frame completes browser layout, second measures stable
  // dimensions.  Prevents xterm viewport getting 0-height on mount (which
  // breaks mouse-wheel scroll until a text-selection forces a recalc).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fit.fit();
      syncViewport(term);
    });
  });

  // Also re-fit once custom web fonts are loaded. Without this, fit() on a
  // fresh page measures cell dimensions against the fallback system font
  // (wrong glyph width/height → wrong row count). When the real font later
  // arrives, xterm does NOT auto-remeasure; the pty stays sized to the
  // fallback dimensions and subsequent output lands outside the visible
  // area, producing a "blank terminal until I tab away and back" bug.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    const beforeRows = term.rows;
    document.fonts.ready.then(() => {
      if (!sessions.has(paneId)) return;
      const prevRows = term.rows;
      try { fit.fit(); } catch { /* 0×0 — ResizeObserver will retry */ }
      syncViewport(term, 'fonts-ready:refit');
      term.refresh(0, term.rows - 1);
      const afterRows = term.rows;
      console.log(
        `[TermReg] FONTS-READY ${paneId.slice(0,8)} — rows: ${beforeRows}→${prevRows}→${afterRows}`,
      );
      // Propagate the corrected size to the pty so shell redraws at the real
      // row count. Only send if dims actually changed to avoid spurious
      // SIGWINCH churn on the shell side.
      if (session.ws?.readyState === WebSocket.OPEN && afterRows !== prevRows) {
        const dims = fit.proposeDimensions();
        if (dims?.cols && dims?.rows) {
          session.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
          console.log(
            `[TermReg] FONTS-READY ${paneId.slice(0,8)} — sent resize ${dims.cols}x${dims.rows}`,
          );
        }
      }
    }).catch(() => { /* font load failures are non-fatal */ });
  }

  // If cold restore, fetch and write scrollback BEFORE connecting WebSocket
  if (options?.coldRestore) {
    try {
      const resp = await fetch(`${apiBase}/api/terminal-sessions/scrollback/${paneId}`);
      if (resp.ok) {
        const { scrollback } = await resp.json();
        if (scrollback) {
          term.write(scrollback);
          session.showRestoreBanner = true;
          // Force a fit + repaint after the restored write. Without this the
          // scrollback lands on a canvas sized from an earlier (possibly 0×0)
          // layout pass — the buffer is correct but the pixels aren't painted
          // until a later ResizeObserver tick (which is what happened when
          // users switched tabs to "fix" a blank terminal on refresh).
          requestAnimationFrame(() => {
            try { fit.fit(); } catch { /* 0×0 — ResizeObserver will retry */ }
            syncViewport(term, 'cold-restore:after-write');
            term.refresh(0, term.rows - 1);
            term.scrollToBottom();
          });
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

  /** Reset reconnect counter — called on window focus so a sleeping laptop
   *  doesn't permanently exhaust retries while the lid was closed. */
  const resetReconnectOnFocus = () => {
    if (!sessions.has(paneId)) {
      window.removeEventListener('focus', resetReconnectOnFocus);
      return;
    }
    const s = sessions.get(paneId)!;
    if (!s.connected && s.ws?.readyState !== WebSocket.OPEN) {
      console.log(`[TermReg] FOCUS-RECONNECT ${paneId.slice(0,8)} — resetting retries`);
      reconnectAttempts = 0;
      connectWs(true);
    }
  };
  window.addEventListener('focus', resetReconnectOnFocus);

  function connectWs(isReconnect = false) {
    // Don't open duplicate sockets
    if (session.ws && session.ws.readyState === WebSocket.CONNECTING) return;

    const ws = new WebSocket(wsUrl);
    session.ws = ws;

    ws.onopen = () => {
      session.connected = true;
      reconnectAttempts = 0;
      // Preserve scroll position across fit() — reconnection should not
      // reset the viewport (mirrors VS Code's pattern).
      logScroll('ws.onopen:before-fit', term, paneId);
      const buf = term.buffer.active;
      const wasBottom = buf.viewportY >= buf.baseY;
      const savedY = buf.viewportY;
      fit.fit();
      syncViewport(term, 'ws.onopen');
      if (wasBottom) {
        term.scrollToBottom();
      } else {
        term.scrollToLine(Math.min(savedY, buf.baseY));
      }
      // Force DOM scrollTop to match xterm's internal viewportY
      const vp = term.element?.querySelector('.xterm-viewport') as HTMLElement | null;
      if (vp && buf.baseY > 0) {
        vp.scrollTop = (buf.viewportY / buf.baseY) * (vp.scrollHeight - vp.clientHeight);
      } else if (vp) {
        vp.scrollTop = vp.scrollHeight - vp.clientHeight;
      }
      logScroll('ws.onopen:after-restore', term, paneId);
      // Symmetric with the REATTACH branch — force a repaint on first connect
      // so any content written before ws.onopen (cold-restore scrollback) is
      // guaranteed to be on screen.
      term.refresh(0, term.rows - 1);
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

  // Store reconnect fn so reattach can trigger it directly (avoids synthetic focus dispatch)
  (session as any)._reconnect = () => {
    reconnectAttempts = 0;
    connectWs(true);
  };

  // Wire terminal input — references session.ws so reconnection would work
  // Store the disposable so it can be cleaned up in disposeSession
  const onDataDisposable = term.onData((data) => {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input', data }));
    }
  });
  (session as any)._onDataDisposable = onDataDisposable;

  // Debug: monitor xterm scroll events to catch unexpected scrolling
  term.onScroll((newY) => {
    const buf = term.buffer.active;
    console.log(`[TermScroll] xterm.onScroll pane=${paneId.slice(0,8)} newViewportY=${newY} baseY=${buf.baseY} atBottom=${newY >= buf.baseY}`);
  });

  // Forward OSC title changes (e.g. from peon-ping) to update pane tab labels
  term.onTitleChange((title) => {
    window.dispatchEvent(new CustomEvent('phantom:terminal-title', {
      detail: { paneId, title },
    }));
  });
  (session as any)._focusHandler = resetReconnectOnFocus;

  // Debug: monitor DOM viewport scroll events — catches browser-initiated scrolls
  const xtermViewport = term.element?.querySelector('.xterm-viewport') as HTMLElement | null;
  if (xtermViewport) {
    xtermViewport.addEventListener('scroll', () => {
      const buf = term.buffer.active;
      console.log(`[TermScroll] DOM:scroll pane=${paneId.slice(0,8)} scrollTop=${Math.round(xtermViewport.scrollTop)} scrollHeight=${xtermViewport.scrollHeight} clientHeight=${xtermViewport.clientHeight} viewportY=${buf.viewportY} baseY=${buf.baseY}`);
    }, { passive: true });
  }

  // Set up ResizeObserver
  session.observer = createResizeObserver(paneId, container);

  return session;
  } finally {
    attaching.delete(paneId);
  }
};

/**
 * Detach a terminal session from its DOM container.
 * Moves the wrapper to an offscreen container (not removed from DOM) so
 * xterm.js viewport scroll state stays valid. Mirrors VS Code's pattern.
 * WebSocket stays alive — PTY output continues flowing to the xterm buffer.
 */
export const detachSession = (paneId: string): void => {
  const session = sessions.get(paneId);
  if (!session) return;

  logScroll('DETACH:before-save', session.term, paneId);
  console.log(`[TermReg] DETACH ${paneId.slice(0,8)} — wrapper moves offscreen, ws stays open`);

  // Save viewport scroll position before moving offscreen
  const buf = session.term.buffer.active;
  session.savedViewportY = buf.viewportY;
  session.wasAtBottom = buf.viewportY >= buf.baseY;
  console.log(`[TermScroll] DETACH saved: viewportY=${buf.viewportY} wasAtBottom=${session.wasAtBottom}`);

  // Disconnect ResizeObserver
  session.observer?.disconnect();
  session.observer = null;

  // Move wrapper to offscreen container — keeps xterm viewport alive in the DOM
  // so scroll state, scrollHeight, and internal tracking stay valid.
  if (offscreen) {
    offscreen.appendChild(session.wrapper);
  } else {
    session.wrapper.remove();
  }
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

  // Guard: skip dispose if session is mid-reattach (workspace switch race)
  if (attaching.has(paneId)) {
    console.warn(`[TermReg] DISPOSE BLOCKED ${paneId.slice(0,8)} — session is being reattached`);
    return;
  }

  console.log(`[TermReg] DISPOSE ${paneId.slice(0,8)} — killing PTY + closing ws`);

  // Send kill message — server will close the ws after killing the PTY.
  // Don't call ws.close() here — it races with the send and the kill message
  // may not arrive before the close frame.
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type: 'kill' }));
  }

  // Dispose onData listener
  (session as any)._onDataDisposable?.dispose();

  // Remove focus-reconnect handler
  if ((session as any)._focusHandler) {
    window.removeEventListener('focus', (session as any)._focusHandler);
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
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const session = sessions.get(paneId);
      // Skip if session was disposed, detached, or mid-reattach scroll restoration
      if (!session || !session.container) return;
      if (session._restoringScroll) {
        console.log(`[TermScroll] ResizeObserver:SKIPPED (restoring) pane=${paneId.slice(0,8)}`);
        return;
      }
      // Skip if container is not visible (e.g. hidden tab)
      if (container.offsetParent === null || container.clientHeight === 0) {
        console.log(`[TermScroll] ResizeObserver:SKIPPED (hidden) pane=${paneId.slice(0,8)}`);
        return;
      }

      logScroll('ResizeObserver:before-fit', session.term, paneId);

      // Preserve scroll position across fit()
      const buf = session.term.buffer.active;
      const wasAtBottom = buf.viewportY >= buf.baseY;
      const savedY = buf.viewportY;

      session.fit.fit();
      syncViewport(session.term, 'resize-observer');

      // Restore scroll position after fit
      if (wasAtBottom) {
        session.term.scrollToBottom();
      } else {
        session.term.scrollToLine(Math.min(savedY, buf.baseY));
      }

      // Force DOM scrollTop to match xterm's internal viewportY
      const vp = session.term.element?.querySelector('.xterm-viewport') as HTMLElement | null;
      if (vp && buf.baseY > 0) {
        vp.scrollTop = (buf.viewportY / buf.baseY) * (vp.scrollHeight - vp.clientHeight);
      } else if (vp) {
        vp.scrollTop = vp.scrollHeight - vp.clientHeight;
      }
      logScroll('ResizeObserver:after-restore', session.term, paneId);

      const dims = session.fit.proposeDimensions();
      if (dims && session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    }, 250);
  });
  observer.observe(container);
  return observer;
}
