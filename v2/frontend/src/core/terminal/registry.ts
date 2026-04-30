// PhantomOS v2 — Terminal Runtime Registry
// Author: Subash Karki
//
// Module-level singleton that keeps xterm.js instances alive across
// SolidJS component unmount/remount cycles (worktree switches, tab changes).

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SerializeAddon } from '@xterm/addon-serialize';
import { getZoomConfig } from '../signals/zoom';
import { loadPref } from '../signals/preferences';
import { saveTerminalSnapshot } from '../bindings/terminal';

export const MONO_FONT_FAMILY = '"Hack", monospace';

// Cached user terminal display prefs — loaded once at startup, applied to every new session.
let userPrefs: {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontWeightBold?: string;
  lineHeight?: number;
  letterSpacing?: number;
  brightness?: number;
} = {};

export const getTerminalUserPrefs = (): Readonly<typeof userPrefs> => userPrefs;

export async function initTerminalPrefs(): Promise<void> {
  const [family, size, weight, bold, lh, ls, br] = await Promise.all([
    loadPref('terminal_fontFamily'),
    loadPref('terminal_fontSize'),
    loadPref('terminal_fontWeight'),
    loadPref('terminal_fontWeightBold'),
    loadPref('terminal_lineHeight'),
    loadPref('terminal_letterSpacing'),
    loadPref('terminal_brightness'),
  ]);
  if (family) userPrefs.fontFamily = `"${family}", monospace`;
  if (size) userPrefs.fontSize = Number(size);
  if (weight) userPrefs.fontWeight = weight;
  if (bold) userPrefs.fontWeightBold = bold;
  if (lh) userPrefs.lineHeight = Number(lh);
  if (ls) userPrefs.letterSpacing = Number(ls);
  if (br) userPrefs.brightness = Number(br);
}

export interface TerminalSession {
  terminal: Terminal;
  fitAddon: FitAddon;
  /** SerializeAddon — produces a string that replays full xterm visual state via terminal.write(). */
  serializeAddon: SerializeAddon;
  wrapper: HTMLDivElement;
  sessionId: string;
  attached: boolean;
  /** Working directory for this terminal session — used to resolve relative file paths in link detection */
  cwd?: string;
  unsubscribe?: () => void;
  /** SearchAddon instance — available only when @xterm/addon-search is installed */
  searchAddon?: { findNext(term: string, opts?: object): void; findPrevious(term: string, opts?: object): void };
  /** Cached serialize() output captured on the most recent detachSession call. */
  lastSerializedState?: string;
}

const sessions = new Map<string, TerminalSession>();

// Offscreen container for detached terminals — real 800x400 but positioned off-screen
// so xterm.js internal layout engine stays active.
let offscreen: HTMLDivElement | null = null;

function getOffscreen(): HTMLDivElement {
  if (!offscreen) {
    offscreen = document.createElement('div');
    offscreen.style.cssText =
      'position:fixed;left:-9999px;top:0;width:800px;height:400px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(offscreen);
  }
  return offscreen;
}

export function createSession(
  sessionId: string,
  opts?: { theme?: Record<string, string>; fontFamily?: string },
): TerminalSession {
  if (sessions.has(sessionId)) return sessions.get(sessionId)!;

  const terminal = new Terminal({
    fontSize: userPrefs.fontSize ?? getZoomConfig().terminalFontSize,
    fontFamily: userPrefs.fontFamily ?? opts?.fontFamily ?? MONO_FONT_FAMILY,
    fontWeight: userPrefs.fontWeight ?? '300',
    fontWeightBold: userPrefs.fontWeightBold ?? '400',
    lineHeight: userPrefs.lineHeight ?? 1.18,
    letterSpacing: userPrefs.letterSpacing ?? 0.2,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowTransparency: true,
    theme: opts?.theme ?? {},
    scrollback: 500,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // SerializeAddon — captures full xterm state (cursor, alt-screen, colors,
  // scrollback) as a string we can replay verbatim with terminal.write().
  // Loaded eagerly so it tracks all output from the moment the session opens.
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon);

  // WebGL renderer for smooth scrolling and GPU-accelerated rendering.
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    terminal.loadAddon(webgl);
  } catch {
    /* canvas fallback is fine */
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:100%;height:100%;';
  if (userPrefs.brightness && userPrefs.brightness !== 100) {
    wrapper.style.filter = `brightness(${userPrefs.brightness}%)`;
  }

  // Open into offscreen first so xterm initialises without needing visible dimensions
  getOffscreen().appendChild(wrapper);
  terminal.open(wrapper);

  const session: TerminalSession = {
    terminal,
    fitAddon,
    serializeAddon,
    wrapper,
    sessionId,
    attached: false,
  };

  sessions.set(sessionId, session);
  return session;
}

export function attachSession(
  sessionId: string,
  container: HTMLElement,
): TerminalSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  container.appendChild(session.wrapper);
  session.attached = true;

  const fitWhenReady = (attempt = 0) => {
    const w = container.clientWidth;
    const h = container.clientHeight;

    if (w > 50 && h > 50) {
      try {
        session.fitAddon.fit();
      } catch { /* ignore */ }
      return;
    }

    if (attempt < 10) {
      requestAnimationFrame(() => fitWhenReady(attempt + 1));
    }
  };

  requestAnimationFrame(() => fitWhenReady());

  return session;
}

export function detachSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Snapshot the full xterm state BEFORE moving the wrapper. We persist the
  // string to the Go side so a future cold-start can replay it via
  // terminal.write() and restore cursor/alt-screen/colors in one shot.
  // Best-effort: a serialize() failure must never block detach.
  try {
    const state = session.serializeAddon.serialize();
    session.lastSerializedState = state;
    // Fire-and-forget — DB write happens in background.
    void saveTerminalSnapshot(sessionId, state);
  } catch {
    /* ignore — detach must always succeed */
  }

  // Move wrapper back to offscreen — keeps xterm + PTY alive
  getOffscreen().appendChild(session.wrapper);
  session.attached = false;
}

export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.unsubscribe?.();
  session.terminal.dispose();
  session.wrapper.remove();
  sessions.delete(sessionId);
}

export function getSession(sessionId: string): TerminalSession | null {
  return sessions.get(sessionId) ?? null;
}

export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}

export function getAllSessions(): TerminalSession[] {
  return Array.from(sessions.values());
}

export function safeFit(session: TerminalSession): boolean {
  const parent = session.wrapper.parentElement;
  if (!parent) return false;
  // Skip if detached/hidden (offsetParent null) or zero-sized — fit() at 0×0
  // would propose 1×1 cells and SIGHUP the foreground process.
  if (parent.offsetParent === null) return false;
  if (parent.clientWidth < 50 || parent.clientHeight < 50) return false;
  try { session.fitAddon.fit(); } catch {}
  return true;
}
