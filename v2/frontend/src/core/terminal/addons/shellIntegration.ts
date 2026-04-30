// Phantom — xterm.js OSC 633 shell integration addon
// Author: Subash Karki
//
// Parses OSC 633 sequences emitted by our injected bash/zsh integration
// scripts and turns them into a structured per-session command timeline.
//
// Protocol (subset we care about):
//   ESC ] 633 ; A           BEL  → prompt start
//   ESC ] 633 ; B           BEL  → prompt end / command start
//   ESC ] 633 ; C           BEL  → command executed (output begins)
//   ESC ] 633 ; D [;<exit>] BEL  → command finished
//   ESC ] 633 ; E ; <cmd>   BEL  → command line
//   ESC ] 633 ; P ; Cwd=<p> BEL  → cwd update
//
// Storage is module-level so the timeline survives Solid component
// remounts (matches the registry pattern in ../registry.ts).

import type { IMarker, Terminal } from '@xterm/xterm';

export interface TerminalCommand {
  command: string;
  cwd?: string;
  exitCode?: number;
  promptStartMarker: IMarker;
  commandStartMarker?: IMarker;
  executedMarker?: IMarker;
  endMarker?: IMarker;
  hasOutput: boolean;
  timestamp: number;
}

type CommandFinishedListener = (cmd: TerminalCommand) => void;
type TitleListener = (title: string) => void;

interface SessionState {
  terminal: Terminal;
  commands: TerminalCommand[];
  /** Command currently being assembled — promoted to commands[] on D (finished). */
  current: TerminalCommand | null;
  cwd?: string;
  /** Latest OSC 0/1/2 title emitted by the shell or foreground program. */
  title?: string;
  listeners: Set<CommandFinishedListener>;
  titleListeners: Set<TitleListener>;
  oscDisposable?: { dispose: () => void };
  titleDisposable?: { dispose: () => void };
}

const sessions = new Map<string, SessionState>();

/**
 * Decode the OSC 633 escape sequence value. Inverse of the bash/zsh
 * `__phantom_escape_value` helpers — backslashes were doubled, semicolons
 * and control chars were emitted as `\xNN`.
 */
function unescapeOscValue(input: string): string {
  // Replace \xNN with the byte, then collapse \\ → \. Order matters.
  const hexExpanded = input.replace(/\\x([0-9a-fA-F]{2})/g, (_m, h) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  return hexExpanded.replace(/\\\\/g, '\\');
}

function getOrCreateState(sessionId: string, terminal: Terminal): SessionState {
  let state = sessions.get(sessionId);
  if (!state) {
    state = {
      terminal,
      commands: [],
      current: null,
      listeners: new Set(),
      titleListeners: new Set(),
    };
    sessions.set(sessionId, state);
  }
  return state;
}

/** Emit `cmd` to all listeners, swallowing listener errors. */
function emitFinished(state: SessionState, cmd: TerminalCommand): void {
  for (const fn of state.listeners) {
    try {
      fn(cmd);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[shellIntegration] listener threw:', err);
    }
  }
}

/** Emit a new title to all title listeners, swallowing listener errors. */
function emitTitle(state: SessionState, title: string): void {
  for (const fn of state.titleListeners) {
    try {
      fn(title);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[shellIntegration] title listener threw:', err);
    }
  }
}

/**
 * Install the OSC 633 handler on a freshly-created terminal. Idempotent —
 * if the session already has a handler installed we leave it alone.
 *
 * Returns a disposable for callers that want explicit teardown; in practice
 * the registry's `destroySession` handles cleanup via `uninstallShellIntegration`.
 */
export function installShellIntegration(
  terminal: Terminal,
  sessionId: string,
): { dispose: () => void } {
  const existing = sessions.get(sessionId);
  if (existing && existing.oscDisposable) {
    return existing.oscDisposable;
  }

  const state = getOrCreateState(sessionId, terminal);

  // xterm's parser strips the OSC framing and hands us only the
  // payload after `633;` (e.g. "A", "D;0", "E;ls -la", "P;Cwd=/tmp").
  const handler = (data: string): boolean => {
    try {
      handleOscPayload(state, data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[shellIntegration] osc handler error:', err, data);
    }
    // Returning true tells xterm we consumed the sequence so it doesn't
    // re-emit it as text.
    return true;
  };

  const disposable = terminal.parser.registerOscHandler(633, handler);
  state.oscDisposable = disposable;

  // OSC 0/1/2 title (handled natively by xterm.js). Captures titles emitted
  // by the shell prompt (e.g. zsh's `title` hook) or programs that set their
  // own title (vim, ssh, claude, etc.).
  if (!state.titleDisposable) {
    state.titleDisposable = terminal.onTitleChange((title) => {
      const trimmed = title.trim();
      if (!trimmed || trimmed === state.title) return;
      state.title = trimmed;
      emitTitle(state, trimmed);
    });
  }

  return disposable;
}

/** Tear down a session's tracking state. Safe to call for unknown ids. */
export function uninstallShellIntegration(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (!state) return;
  try {
    state.oscDisposable?.dispose();
  } catch {
    /* ignore */
  }
  try {
    state.titleDisposable?.dispose();
  } catch {
    /* ignore */
  }
  sessions.delete(sessionId);
}

/** Snapshot of finished commands for a session. */
export function getCommands(sessionId: string): TerminalCommand[] {
  const state = sessions.get(sessionId);
  return state ? state.commands.slice() : [];
}

/** The command currently being entered/executed, if any. */
export function getCurrentCommand(sessionId: string): TerminalCommand | null {
  return sessions.get(sessionId)?.current ?? null;
}

/** Subscribe to command-finished events. Returns an unsubscribe fn. */
export function onCommandFinished(
  sessionId: string,
  listener: CommandFinishedListener,
): () => void {
  const state = sessions.get(sessionId);
  if (!state) {
    // No session yet — nothing to subscribe to. Caller should install first.
    return () => {};
  }
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/** Latest OSC 0/1/2 title for a session, if any. */
export function getSessionTitle(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.title;
}

/** Latest known cwd for a session (from OSC 633;P;Cwd=…). */
export function getSessionCwd(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.cwd;
}

/**
 * Subscribe to OSC 0/1/2 title changes for a session. Returns an unsubscribe fn.
 *
 * Unlike `onCommandFinished`, this is safe to call before `installShellIntegration`
 * runs — listeners get queued against a lazily-created state record so we don't
 * miss titles emitted right after the terminal mounts.
 */
export function onTitleChange(
  sessionId: string,
  listener: TitleListener,
): () => void {
  let state = sessions.get(sessionId);
  if (!state) {
    // Pre-create a partial state without a terminal so listeners can subscribe
    // before the addon is installed. installShellIntegration will adopt this
    // record (getOrCreateState returns the existing one).
    state = {
      // The terminal field is filled in by installShellIntegration; until then
      // it's never read because nothing emits without a terminal.
      terminal: undefined as unknown as Terminal,
      commands: [],
      current: null,
      listeners: new Set(),
      titleListeners: new Set(),
    };
    sessions.set(sessionId, state);
  }
  state.titleListeners.add(listener);
  return () => state.titleListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Protocol handler
// ---------------------------------------------------------------------------

function handleOscPayload(state: SessionState, payload: string): void {
  // Payload formats:
  //   "A"
  //   "B"
  //   "C"
  //   "D" | "D;<exit>"
  //   "E;<escaped-command>" | "E;<cmd>;<nonce>"
  //   "P;Cwd=<escaped-path>" | other "P;Key=Value"
  const semi = payload.indexOf(';');
  const code = semi === -1 ? payload : payload.slice(0, semi);
  const rest = semi === -1 ? '' : payload.slice(semi + 1);

  switch (code) {
    case 'A':
      handlePromptStart(state);
      return;
    case 'B':
      handleCommandStart(state);
      return;
    case 'C':
      handleCommandExecuted(state);
      return;
    case 'D':
      handleCommandFinished(state, rest);
      return;
    case 'E':
      handleCommandLine(state, rest);
      return;
    case 'P':
      handleProperty(state, rest);
      return;
    default:
      // F/G/H/I (continuation, right-prompt) — not needed for v1.
      return;
  }
}

function handlePromptStart(state: SessionState): void {
  const marker = state.terminal.registerMarker(0);
  if (!marker) return;

  // If a previous command never closed (no D), drop it — a fresh prompt
  // indicates the shell moved on (e.g. Ctrl+C).
  state.current = {
    command: '',
    cwd: state.cwd,
    promptStartMarker: marker,
    hasOutput: false,
    timestamp: Date.now(),
  };
}

function handleCommandStart(state: SessionState): void {
  const cur = state.current;
  if (!cur) return;
  cur.commandStartMarker = state.terminal.registerMarker(0) ?? undefined;
}

function handleCommandExecuted(state: SessionState): void {
  const cur = state.current;
  if (!cur) return;
  cur.executedMarker = state.terminal.registerMarker(0) ?? undefined;
  cur.hasOutput = true;
}

function handleCommandFinished(state: SessionState, rest: string): void {
  const cur = state.current;
  if (!cur) return;

  // rest may be empty (shell ran a no-op prompt) or the exit code, optionally
  // followed by other fields we ignore (";<nonce>" in VS Code's variant).
  if (rest.length > 0) {
    const firstField = rest.split(';')[0];
    const code = Number.parseInt(firstField, 10);
    if (Number.isFinite(code)) cur.exitCode = code;
  } else {
    // No exit code reported (typically: empty prompt with no command).
    // Drop the entry rather than store a meaningless one.
    state.current = null;
    return;
  }

  cur.endMarker = state.terminal.registerMarker(0) ?? undefined;

  state.commands.push(cur);
  state.current = null;
  emitFinished(state, cur);
}

function handleCommandLine(state: SessionState, rest: string): void {
  const cur = state.current;
  if (!cur) return;
  // rest = "<escaped-command>[;<nonce>]". We split on the LAST `;` — but only
  // if the trailing token looks like a nonce. Our bash/zsh scripts don't emit
  // nonces, so the simple path of `unescape(rest)` is correct.
  cur.command = unescapeOscValue(rest);
}

function handleProperty(state: SessionState, rest: string): void {
  // rest = "Cwd=<escaped>" or other "Key=Value"
  const eq = rest.indexOf('=');
  if (eq === -1) return;
  const key = rest.slice(0, eq);
  const value = rest.slice(eq + 1);

  if (key === 'Cwd') {
    const cwd = unescapeOscValue(value);
    state.cwd = cwd;
    if (state.current) state.current.cwd = cwd;
  }
  // Ignore other properties (PromptType, IsWindows, etc.) for now.
}

// ---------------------------------------------------------------------------
// Debug aids — exposed on window so DevTools can poke at sessions.
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).getCommands = getCommands;
  (window as unknown as Record<string, unknown>).getCurrentCommand =
    getCurrentCommand;
}
