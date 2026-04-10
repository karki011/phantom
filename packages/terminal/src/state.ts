/**
 * Terminal State — module-level maps that survive React unmount/remount.
 * Adopts Superset's deferred-detach pattern for persistent terminal sessions.
 * @author Subash Karki
 */
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

export interface TerminalSession {
  term: Terminal;
  fit: FitAddon;
  ws: WebSocket | null;
  connected: boolean;
  observer: ResizeObserver | null;
}

/** Active terminal sessions — survives React unmount/remount */
export const sessions = new Map<string, TerminalSession>();

/** Pending detach timeouts — cancel on remount to keep session alive */
export const pendingDetaches = new Map<string, ReturnType<typeof setTimeout>>();

/** How long to wait before actually closing the WebSocket after unmount */
export const DETACH_DELAY_MS = 2000;
