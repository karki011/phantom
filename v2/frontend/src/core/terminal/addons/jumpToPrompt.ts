// Author: Subash Karki
// Phantom — Cmd+Up / Cmd+Down jump-to-prompt + Cmd+P palette opener
//
// Wires keyboard shortcuts on the terminal host element. Reads the per-session
// command timeline from `shellIntegration` and uses xterm's
// `terminal.scrollToLine(absLine)` to jump the viewport to a previous /
// next prompt's `promptStartMarker.line`.
//
// Cmd+P (or Ctrl+P on linux) is forwarded to the caller via `ctx.onOpenPalette`
// so the host pane can render `<TerminalCommandPalette>` over the terminal.

import type { Terminal } from '@xterm/xterm';
import { getCommands } from './shellIntegration';

interface InstallCtx {
  /** Called when the user presses Cmd+P (or Ctrl+P on non-mac). */
  onOpenPalette: () => void;
}

/** Returns true when the platform-appropriate "command" modifier is held. */
function hasCmdModifier(e: KeyboardEvent): boolean {
  // macOS uses metaKey (⌘); other platforms use ctrlKey.
  const isMac =
    typeof navigator !== 'undefined' &&
    /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');
  return isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/**
 * Find the prompt line strictly above the current viewport top.
 * Returns the absolute buffer line, or null if none exists.
 */
function findPrevPromptLine(terminal: Terminal, sessionId: string): number | null {
  const cmds = getCommands(sessionId);
  if (cmds.length === 0) return null;

  // viewportY is relative to the active buffer. Convert to absolute via baseY.
  const buf = terminal.buffer.active;
  const viewportTopAbs = buf.baseY + buf.viewportY;

  // Walk newest → oldest, pick first marker strictly above viewport top.
  let candidate: number | null = null;
  for (let i = cmds.length - 1; i >= 0; i -= 1) {
    const m = cmds[i].promptStartMarker;
    if (m.isDisposed) continue;
    if (m.line < viewportTopAbs) {
      candidate = m.line;
      break;
    }
  }
  return candidate;
}

/**
 * Find the prompt line strictly below the current viewport top.
 * Returns the absolute buffer line, or null if none exists.
 */
function findNextPromptLine(terminal: Terminal, sessionId: string): number | null {
  const cmds = getCommands(sessionId);
  if (cmds.length === 0) return null;

  const buf = terminal.buffer.active;
  const viewportTopAbs = buf.baseY + buf.viewportY;

  for (let i = 0; i < cmds.length; i += 1) {
    const m = cmds[i].promptStartMarker;
    if (m.isDisposed) continue;
    if (m.line > viewportTopAbs) {
      return m.line;
    }
  }
  return null;
}

/**
 * Install jump-to-prompt + palette keybindings.
 *
 * Two layers cooperate:
 *   1. `attachCustomKeyEventHandler` — runs inside xterm's input pipeline
 *      and returns `false` so xterm does NOT forward Cmd+↑/↓/P to the PTY.
 *   2. A `keydown` listener on `host` performs the actual scroll / open.
 *      We register on `host` (not document) so other panes are unaffected.
 *
 * @returns cleanup function — restore xterm handler and remove the listener.
 */
export function installJumpToPrompt(
  terminal: Terminal,
  sessionId: string,
  host: HTMLElement,
  ctx: InstallCtx,
): () => void {
  const isOurKey = (e: KeyboardEvent): boolean => {
    if (!hasCmdModifier(e)) return false;
    return e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key.toLowerCase() === 'p';
  };

  // Layer 1: tell xterm not to consume our keys.
  // attachCustomKeyEventHandler: returning false stops xterm from handling the event.
  // We intentionally do NOT preventDefault here — that's done in the host listener
  // after we know we acted on the event.
  terminal.attachCustomKeyEventHandler((e) => !isOurKey(e));

  // Layer 2: actual handlers.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!isOurKey(e)) return;

    // Cmd+P → palette
    if (e.key.toLowerCase() === 'p') {
      e.preventDefault();
      e.stopPropagation();
      ctx.onOpenPalette();
      return;
    }

    // Cmd+↑ → previous prompt
    if (e.key === 'ArrowUp') {
      const line = findPrevPromptLine(terminal, sessionId);
      if (line !== null) {
        e.preventDefault();
        e.stopPropagation();
        terminal.scrollToLine(line);
      }
      return;
    }

    // Cmd+↓ → next prompt
    if (e.key === 'ArrowDown') {
      const line = findNextPromptLine(terminal, sessionId);
      if (line !== null) {
        e.preventDefault();
        e.stopPropagation();
        terminal.scrollToLine(line);
      }
    }
  };

  host.addEventListener('keydown', onKeyDown, { capture: true });

  return () => {
    host.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions);
    // Restore xterm's default key handling. Passing a handler that always
    // returns true means "let xterm process every key".
    terminal.attachCustomKeyEventHandler(() => true);
  };
}
