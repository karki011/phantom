/**
 * PhantomOS Terminal Manager
 * Connects to the terminal daemon for PTY management.
 * Falls back to direct node-pty spawn if the daemon isn't running.
 * @author Subash Karki
 */
import { logger } from './logger.js';
import * as pty from 'node-pty';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { DaemonClient } from '@phantom-os/terminal/daemon';

// ─── Types ─────────────────────────────────────────────────────────────

export interface PtySession {
  id: string;
  /** Direct PTY — only set when running in fallback mode */
  pty: pty.IPty | null;
  listeners: Set<(data: string) => void>;
  /** Whether this session is managed by the daemon */
  daemonManaged: boolean;
}

// ─── State ─────────────────────────────────────────────────────────────

const sessions = new Map<string, PtySession>();
let daemonClient: DaemonClient | null = null;
let daemonAvailable = false;

// ─── Daemon Client ─────────────────────────────────────────────────────

/**
 * Initialize the daemon client connection.
 * Call this once at server startup.
 */
export const initDaemonClient = async (): Promise<boolean> => {
  if (daemonClient?.connected) return true;

  // Check if daemon is reachable
  const reachable = await DaemonClient.isDaemonReachable();
  if (!reachable) {
    logger.info('TerminalManager', 'Daemon not reachable, using direct PTY fallback');
    daemonAvailable = false;
    return false;
  }

  try {
    daemonClient = new DaemonClient();

    // Wire up output events — route to session listeners
    daemonClient.on('output', (sessionId: string, data: string) => {
      const session = sessions.get(sessionId);
      if (session) {
        for (const listener of session.listeners) {
          listener(data);
        }
      }
    });

    daemonClient.on('exit', (sessionId: string, _code: number) => {
      const session = sessions.get(sessionId);
      if (session) {
        session.listeners.clear();
        sessions.delete(sessionId);
      }
    });

    daemonClient.on('disconnected', () => {
      logger.warn('TerminalManager', 'Daemon disconnected');
      daemonAvailable = false;
    });

    daemonClient.on('connected', () => {
      logger.info('TerminalManager', 'Daemon reconnected');
      daemonAvailable = true;
    });

    daemonClient.on('error', (err: Error) => {
      logger.warn('TerminalManager', `Daemon client error: ${err.message}`);
    });

    await daemonClient.connect();
    daemonAvailable = true;
    logger.info('TerminalManager', 'Connected to terminal daemon');
    return true;
  } catch (err) {
    logger.warn('TerminalManager', `Failed to connect to daemon: ${(err as Error).message}`);
    daemonClient = null;
    daemonAvailable = false;
    return false;
  }
};

/** Get the daemon client instance (may be null if not connected) */
export const getDaemonClient = (): DaemonClient | null =>
  daemonAvailable ? daemonClient : null;

/** Check if we're using the daemon */
export const isDaemonMode = (): boolean => daemonAvailable;

// ─── Fallback: Direct PTY ──────────────────────────────────────────────

/** Resolve a working shell binary — Electron can strip PATH */
const resolveShell = (): string => {
  const candidates = [
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
  ].filter(Boolean) as string[];

  for (const shell of candidates) {
    if (existsSync(shell)) return shell;
  }
  return '/bin/sh';
};

/** Env vars that break tools inside the PTY (e.g. nvm vs homebrew) */
const STRIP_ENV_KEYS = new Set([
  'npm_config_prefix',
  'npm_config_globalconfig',
  'ELECTRON_RUN_AS_NODE',
]);

/** Build a clean env for the PTY — inherit process.env but ensure PATH */
const buildPtyEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !STRIP_ENV_KEYS.has(k)) env[k] = v;
  }
  env.TERM = 'xterm-256color';
  if (!env.PATH || !env.PATH.includes('/usr/local/bin')) {
    env.PATH = `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${env.PATH ? `:${env.PATH}` : ''}`;
  }
  return env;
};

const createDirectPty = (id: string, cwd?: string, cols?: number, rows?: number, envOverrides?: Record<string, string>): PtySession => {
  const shell = resolveShell();
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || homedir(),
    env: { ...buildPtyEnv(), ...envOverrides },
  });

  const session: PtySession = {
    id,
    pty: ptyProcess,
    listeners: new Set(),
    daemonManaged: false,
  };

  ptyProcess.onData((data) => {
    for (const listener of session.listeners) {
      listener(data);
    }
  });

  sessions.set(id, session);
  return session;
};

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Create or attach to a PTY session (async — prefers daemon).
 */
export const createPty = async (
  id: string,
  cwd?: string,
  cols?: number,
  rows?: number,
  /** Pre-attach a listener BEFORE daemon subscription to avoid losing initial output */
  initialListener?: (data: string) => void,
  envOverrides?: Record<string, string>,
): Promise<PtySession> => {
  // Try daemon first
  if (daemonAvailable && daemonClient?.connected) {
    try {
      // CRITICAL: Register session with listener BEFORE calling createOrAttach.
      // The daemon sends output immediately after attach — if listeners is empty,
      // the shell prompt is silently dropped and the terminal appears black.
      const session: PtySession = {
        id,
        pty: null,
        listeners: new Set(),
        daemonManaged: true,
      };
      if (initialListener) session.listeners.add(initialListener);
      sessions.set(id, session);

      await daemonClient.createOrAttach(id, { cols, rows, cwd });
      return session;
    } catch (err) {
      sessions.delete(id); // Clean up on failure
      logger.warn('TerminalManager', `Daemon createOrAttach failed for ${id}, falling back: ${(err as Error).message}`);
    }
  }

  // Fallback to direct PTY
  const session = createDirectPty(id, cwd, cols, rows, envOverrides);
  if (initialListener) session.listeners.add(initialListener);
  return session;
};

/**
 * Synchronous create — for backward compatibility.
 * Prefers daemon if connected, otherwise direct PTY.
 */
export const createPtySync = (id: string, cwd?: string): PtySession => {
  if (daemonAvailable && daemonClient?.connected) {
    // Fire-and-forget the daemon createOrAttach
    daemonClient.createOrAttach(id, { cwd }).catch((err) => {
      logger.warn('TerminalManager', `Async daemon create failed for ${id}: ${(err as Error).message}`);
    });

    const session: PtySession = {
      id,
      pty: null,
      listeners: new Set(),
      daemonManaged: true,
    };
    sessions.set(id, session);
    return session;
  }

  return createDirectPty(id, cwd);
};

export const writePty = (id: string, data: string): void => {
  const session = sessions.get(id);
  if (!session) return;

  if (session.daemonManaged && daemonClient?.connected) {
    daemonClient.input(id, data);
  } else if (session.pty) {
    session.pty.write(data);
  }
};

export const resizePty = (
  id: string,
  cols: number,
  rows: number,
): void => {
  const session = sessions.get(id);
  if (!session) return;

  if (session.daemonManaged && daemonClient?.connected) {
    daemonClient.resize(id, cols, rows);
  } else if (session.pty) {
    session.pty.resize(cols, rows);
  }
};

export const destroyPty = (id: string): void => {
  const session = sessions.get(id);
  if (!session) return;

  if (session.daemonManaged && daemonClient?.connected) {
    daemonClient.kill(id).catch((err) => {
      logger.warn('TerminalManager', `Daemon kill failed for ${id}: ${(err as Error).message}`);
    });
  } else if (session.pty) {
    session.pty.kill();
  }

  session.listeners.clear();
  sessions.delete(id);
};

export const getPtySession = (
  id: string,
): PtySession | undefined => sessions.get(id);

export const destroyAllPtys = (): void => {
  for (const [id] of sessions) destroyPty(id);
};

/** Disconnect the daemon client (call on server shutdown) */
export const disconnectDaemon = (): void => {
  if (daemonClient) {
    daemonClient.disconnect();
    daemonClient = null;
    daemonAvailable = false;
  }
};
