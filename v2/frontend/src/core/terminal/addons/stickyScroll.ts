// Phantom — Sticky-scroll overlay for the running terminal command
// Author: Subash Karki
//
// DISABLED: The sticky-scroll overlay pinned the last shell command at the top
// of the terminal pane. This was distracting — users saw stale command text
// ("if ! grep -q validate-agent-spawn...") stuck at the top of the terminal.
// The function signature is preserved so callers don't need changes.
//
// To re-enable, restore the implementation from git history.

import type { Terminal } from '@xterm/xterm';

/**
 * Install the sticky-scroll overlay on a terminal/host pair.
 *
 * Currently disabled — returns a no-op cleanup immediately.
 */
export function installStickyScroll(
  _terminal: Terminal,
  _sessionId: string,
  _host: HTMLElement,
): () => void {
  return () => {};
}
