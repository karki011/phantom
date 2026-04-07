/**
 * PhantomOS Terminal Daemon — PTY Session
 * Manages a single PTY process with a rolling scrollback buffer
 * for reconnection replay.
 * @author Subash Karki
 */
import * as pty from 'node-pty';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import type { SessionInfo } from './protocol.js';

/** 64 KB rolling scrollback buffer for reconnection replay */
const SCROLLBACK_MAX = 64 * 1024;

/** Batched output flush interval — ~60fps */
const FLUSH_INTERVAL_MS = 16;

/** Max bytes per flush to avoid backpressure */
const MAX_FLUSH_BYTES = 128 * 1024;

export type SessionOutputHandler = (sessionId: string, data: string) => void;
export type SessionExitHandler = (sessionId: string, code: number) => void;

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

/** Build a clean env for the PTY — inherit process.env but ensure PATH */
const buildPtyEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  env.TERM = 'xterm-256color';
  if (!env.PATH || !env.PATH.includes('/usr/local/bin')) {
    env.PATH = `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${env.PATH ? `:${env.PATH}` : ''}`;
  }
  return env;
};

export class Session {
  readonly id: string;
  readonly createdAt: number;
  readonly cwd: string;

  private ptyProcess: pty.IPty;
  private scrollback = '';
  private outputBuffer = '';
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private exited = false;
  private exitCode = 0;

  /** Callbacks — the daemon wires these up to push data to connected clients */
  onOutput: SessionOutputHandler | null = null;
  onExit: SessionExitHandler | null = null;

  constructor(id: string, cols = 80, rows = 24, cwd?: string) {
    this.id = id;
    this.createdAt = Date.now();
    this.cwd = cwd || homedir();

    const shell = resolveShell();
    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: this.cwd,
      env: buildPtyEnv(),
    });

    this.ptyProcess.onData((data) => {
      this.appendScrollback(data);
      this.outputBuffer += data;
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.exited = true;
      this.exitCode = exitCode;
      // Flush any remaining buffered output
      this.flush();
      this.stopFlushing();
      this.onExit?.(this.id, exitCode);
    });

    this.startFlushing();
  }

  get pid(): number {
    return this.ptyProcess.pid;
  }

  get cols(): number {
    return (this.ptyProcess as any).cols ?? 80;
  }

  get rows(): number {
    return (this.ptyProcess as any).rows ?? 24;
  }

  get hasExited(): boolean {
    return this.exited;
  }

  /** Write user input to the PTY */
  write(data: string): void {
    if (!this.exited) {
      this.ptyProcess.write(data);
    }
  }

  /** Resize the PTY */
  resize(cols: number, rows: number): void {
    if (!this.exited) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  /** Kill the PTY process */
  kill(): void {
    if (!this.exited) {
      this.ptyProcess.kill();
    }
    this.stopFlushing();
  }

  /** Get the rolling scrollback buffer for reconnection replay */
  getScrollback(): string {
    return this.scrollback;
  }

  /** Return session metadata */
  toInfo(): SessionInfo {
    return {
      id: this.id,
      pid: this.pid,
      cols: this.cols,
      rows: this.rows,
      cwd: this.cwd,
      createdAt: this.createdAt,
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private appendScrollback(data: string): void {
    this.scrollback += data;
    if (this.scrollback.length > SCROLLBACK_MAX) {
      // Keep the tail of the buffer
      this.scrollback = this.scrollback.slice(-SCROLLBACK_MAX);
    }
  }

  private startFlushing(): void {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  private stopFlushing(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private flush(): void {
    if (this.outputBuffer.length === 0) return;

    // Cap at MAX_FLUSH_BYTES to avoid backpressure
    let chunk = this.outputBuffer;
    if (chunk.length > MAX_FLUSH_BYTES) {
      chunk = this.outputBuffer.slice(0, MAX_FLUSH_BYTES);
      this.outputBuffer = this.outputBuffer.slice(MAX_FLUSH_BYTES);
    } else {
      this.outputBuffer = '';
    }

    this.onOutput?.(this.id, chunk);
  }
}
