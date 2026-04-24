// PhantomOS v2 — Terminal Runtime Registry
// Author: Subash Karki
//
// Module-level singleton that keeps xterm.js instances alive across
// SolidJS component unmount/remount cycles (worktree switches, tab changes).

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { getZoomConfig } from '../signals/zoom';

export const MONO_FONT_FAMILY = '"Hack", monospace';

export interface TerminalSession {
  terminal: Terminal;
  fitAddon: FitAddon;
  wrapper: HTMLDivElement;
  sessionId: string;
  attached: boolean;
  unsubscribe?: () => void;
  /** SearchAddon instance — available only when @xterm/addon-search is installed */
  searchAddon?: { findNext(term: string, opts?: object): void; findPrevious(term: string, opts?: object): void };
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
    fontSize: getZoomConfig().terminalFontSize,
    fontFamily: opts?.fontFamily ?? MONO_FONT_FAMILY,
    fontWeight: '300',
    fontWeightBold: '400',
    lineHeight: 1.18,
    letterSpacing: 0.2,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowTransparency: true,
    theme: opts?.theme ?? {},
    scrollback: 500,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

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

  // Open into offscreen first so xterm initialises without needing visible dimensions
  getOffscreen().appendChild(wrapper);
  terminal.open(wrapper);

  const session: TerminalSession = {
    terminal,
    fitAddon,
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

  // Move wrapper from wherever it is into the visible container
  container.appendChild(session.wrapper);
  session.attached = true;

  // Fit after a frame — container must have real dimensions by then
  requestAnimationFrame(() => {
    try {
      session.fitAddon.fit();
    } catch {
      /* ignore fit errors on zero-size containers */
    }
  });

  return session;
}

export function detachSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

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
