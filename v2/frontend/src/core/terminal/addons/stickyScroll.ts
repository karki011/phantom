// Phantom — Sticky-scroll overlay for the running terminal command
// Author: Subash Karki
//
// While a command is running and the user has scrolled past its prompt, pin
// the prompt line at the top of the viewport so they always see what produced
// the output they're looking at.
//
// Reference: VS Code's terminalStickyScrollOverlay.ts (positioning math for
// "viewport top below promptStart" check). We render via a DOM overlay rather
// than an xterm decoration to keep the implementation simple — decorations
// re-flow with the buffer; we want a fixed bar.

import type { Terminal } from '@xterm/xterm';
import {
  getCurrentCommand,
  onCommandFinished,
  type TerminalCommand,
} from '@/core/terminal/addons/shellIntegration';
import {
  stickyOverlay,
  stickyOverlayVisible,
} from '@/styles/stickyScroll.css';

/**
 * Install the sticky-scroll overlay on a terminal/host pair.
 *
 * @param terminal  The xterm.js instance whose buffer we read.
 * @param sessionId The shell-integration session id (matches terminal).
 * @param host      The positioned ancestor that owns the terminal viewport.
 *                  Must be `position: relative|absolute|fixed` so the overlay
 *                  pins to its top edge.
 * @returns A cleanup function that disposes listeners and removes the DOM node.
 */
export function installStickyScroll(
  terminal: Terminal,
  sessionId: string,
  host: HTMLElement,
): () => void {
  const overlay = document.createElement('div');
  overlay.className = stickyOverlay;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.dataset.phantomStickyScroll = 'true';
  host.appendChild(overlay);

  // The "running" command is whichever entry has been executed (C) but not yet
  // finished (D). shellIntegration's `getCurrentCommand` returns the in-flight
  // entry; we treat it as "running" once `executedMarker` is set.
  //
  // We deliberately recompute on every scroll instead of caching across events
  // — the cost is one map lookup + a viewport-top compare, both O(1).
  const computeRunning = (): TerminalCommand | null => {
    const cur = getCurrentCommand(sessionId);
    if (!cur || !cur.executedMarker) return null;
    return cur;
  };

  /** Read the prompt line (0-indexed buffer line) as plain text. */
  const readPromptText = (line: number): string => {
    const bufferLine = terminal.buffer.active.getLine(line);
    if (!bufferLine) return '';
    // `translateToString(true)` trims trailing whitespace — perfect for prompts.
    return bufferLine.translateToString(true);
  };

  const update = (): void => {
    const running = computeRunning();
    if (!running) {
      hide();
      return;
    }

    const promptLine = running.promptStartMarker.line;
    // If the marker has been disposed (buffer scrolled past xterm's scrollback
    // limit), `.line` returns -1. Bail out — there's nothing to pin.
    if (promptLine < 0) {
      hide();
      return;
    }

    const buf = terminal.buffer.active;
    // viewportY is the buffer line index of the topmost visible row.
    // Pin the overlay only when the prompt is ABOVE the viewport, i.e. the
    // user has scrolled down past it.
    if (buf.viewportY <= promptLine) {
      hide();
      return;
    }

    const text = readPromptText(promptLine);
    if (!text) {
      hide();
      return;
    }

    show(text);
  };

  let visible = false;
  let lastText = '';

  const show = (text: string): void => {
    if (text !== lastText) {
      overlay.textContent = text;
      lastText = text;
    }
    if (!visible) {
      overlay.classList.add(stickyOverlayVisible);
      visible = true;
    }
  };

  const hide = (): void => {
    if (visible) {
      overlay.classList.remove(stickyOverlayVisible);
      visible = false;
    }
  };

  // Match xterm's canvas font/colour so the pinned line reads as a continuation
  // of the buffer rather than a separate UI chrome.
  const syncFontFromXterm = (): void => {
    const xtermEl = terminal.element;
    if (!xtermEl) return;
    const cs = getComputedStyle(xtermEl);
    overlay.style.fontFamily = cs.fontFamily;
    // Don't override fontSize — the CSS module locks it to match terminal rows.
  };
  syncFontFromXterm();

  const scrollDisposable = terminal.onScroll(update);
  // The shell may transition C→D without a scroll event (e.g. user is at
  // bottom). Re-check on command-finished so we hide promptly.
  const finishedUnsub = onCommandFinished(sessionId, () => {
    update();
  });

  // Initial sync in case a command is already running when we install.
  update();

  return () => {
    try {
      scrollDisposable.dispose();
    } catch {
      /* ignore */
    }
    try {
      finishedUnsub();
    } catch {
      /* ignore */
    }
    overlay.remove();
  };
}
