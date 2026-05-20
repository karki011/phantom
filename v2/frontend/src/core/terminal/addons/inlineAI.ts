// Phantom — Inline AI intercept addon for xterm.js
// Author: Subash Karki
//
// Tracks the current input line buffer. When the user presses Enter and
// the line starts with `? `, intercepts before the PTY and routes the
// prompt text to the AI composer with working-directory context.

import { addTabWithData } from '../../panes/signals';
import { getSessionCwd } from './shellIntegration';

/**
 * Install the inline AI intercept on a terminal session.
 *
 * Returns a `processData` function that must be called with every `onData`
 * event BEFORE writing to the PTY. When it returns `true` the data was
 * intercepted and should NOT be forwarded.
 */
export function installInlineAI(
  terminal: import('@xterm/xterm').Terminal,
  sessionId: string,
  writeToTerminal: (data: string) => void,
): { processData: (data: string) => boolean } {
  // Track what the user has typed on the current prompt line.
  let lineBuffer = '';

  // Reset buffer whenever the shell signals a fresh prompt (OSC 633;B).
  // Returning false lets shellIntegration's own handler fire too.
  terminal.parser.registerOscHandler(633, (payload: string) => {
    const letter = payload.charAt(0);
    if (letter === 'B') {
      lineBuffer = '';
    }
    return false;
  });

  /**
   * Process a single `onData` event.
   * @returns `true` if the data was intercepted (caller must NOT send to PTY).
   */
  function processData(data: string): boolean {
    // ── Enter ────────────────────────────────────────────────────────
    if (data === '\r' || data === '\n') {
      const trimmed = lineBuffer.trim();
      if (trimmed.startsWith('? ')) {
        const prompt = trimmed.slice(2).trim();
        if (prompt.length > 0) {
          // Clear the terminal line visually so the `? …` text disappears
          writeToTerminal('\x15'); // Ctrl-U clear line
          writeToTerminal('\r');   // carriage return

          const cwd = getSessionCwd(sessionId) ?? '';
          const escapedPrompt = prompt.replace(/"/g, '\\"');
          addTabWithData('terminal', 'AI', {
            cwd,
            command: `claude --dangerously-skip-permissions "${escapedPrompt}"`,
          });

          lineBuffer = '';
          return true; // intercepted
        }
      }
      // Normal Enter — reset buffer, pass through
      lineBuffer = '';
      return false;
    }

    // ── Backspace ────────────────────────────────────────────────────
    if (data === '\x7f' || data === '\b') {
      lineBuffer = lineBuffer.slice(0, -1);
      return false;
    }

    // ── Ctrl-U (clear line) ──────────────────────────────────────────
    if (data === '\x15') {
      lineBuffer = '';
      return false;
    }

    // ── Ctrl-W (delete word) ─────────────────────────────────────────
    if (data === '\x17') {
      lineBuffer = lineBuffer.replace(/\S+\s*$/, '');
      return false;
    }

    // ── Ctrl-C (cancel) ──────────────────────────────────────────────
    if (data === '\x03') {
      lineBuffer = '';
      return false;
    }

    // ── Escape / control sequences (arrows, fn keys) — ignore ────────
    if (data.startsWith('\x1b')) {
      return false;
    }

    // ── Printable character ──────────────────────────────────────────
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      lineBuffer += data;
      return false;
    }

    // ── Paste (multi-char, non-escape) ───────────────────────────────
    if (data.length > 1 && !data.startsWith('\x1b')) {
      // Multi-line paste — don't intercept (append for tracking but
      // never treat as a `? ` command since it spans lines).
      if (data.includes('\r') || data.includes('\n')) {
        lineBuffer = '';
        return false;
      }
      lineBuffer += data;
      return false;
    }

    return false;
  }

  return { processData };
}
