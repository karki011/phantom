/**
 * PhantomOS Terminal Daemon — Client Library
 * Connects to the terminal daemon via Unix domain socket.
 * Used by the server process to relay terminal data.
 * @author Subash Karki
 */
import * as net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { EventEmitter } from 'node:events';
import {
  encode,
  decode,
  type DaemonRequest,
  type DaemonResponse,
  type OutputMessage,
  type ExitMessage,
  type OkResponse,
  type ErrorResponse,
  type ListResponse,
  type SnapshotResponse,
  type SessionInfo,
} from './protocol.js';

const SOCKET_PATH = path.join(homedir(), '.phantom-os', 'terminal-host.sock');
const PID_FILE = path.join(homedir(), '.phantom-os', 'terminal-host.pid');

/** Timeout for RPC requests (ms) */
const REQUEST_TIMEOUT_MS = 10_000;

/** Reconnect delay after disconnect (ms) */
const RECONNECT_DELAY_MS = 1_000;

/** Max reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 5;

// ─── Types ─────────────────────────────────────────────────────────────

type PendingRequest = {
  resolve: (msg: DaemonResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export interface DaemonClientEvents {
  output: (sessionId: string, data: string) => void;
  exit: (sessionId: string, code: number) => void;
  connected: () => void;
  disconnected: () => void;
  error: (err: Error) => void;
}

// ─── Client ────────────────────────────────────────────────────────────

export class DaemonClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private seq = 0;
  private pending = new Map<number, PendingRequest>();
  private _connected = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private autoReconnect = true;

  get connected(): boolean {
    return this._connected;
  }

  // ─── Connection ────────────────────────────────────────────────────

  /** Connect to the daemon socket */
  async connect(): Promise<void> {
    if (this._connected) return;

    return new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ path: SOCKET_PATH });
      let settled = false;

      socket.on('connect', () => {
        this.socket = socket;
        this._connected = true;
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        settled = true;
        this.emit('connected');
        resolve();
      });

      socket.on('data', (chunk) => {
        this.handleData(chunk.toString());
      });

      socket.on('close', () => {
        this._connected = false;
        this.socket = null;
        this.rejectAllPending('Connection closed');
        this.emit('disconnected');

        if (this.autoReconnect && !this.reconnecting) {
          this.scheduleReconnect();
        }
      });

      socket.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
          return;
        }
        this.emit('error', err);
      });
    });
  }

  /** Disconnect from the daemon */
  disconnect(): void {
    this.autoReconnect = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this._connected = false;
    this.rejectAllPending('Client disconnected');
  }

  // ─── RPC Methods ───────────────────────────────────────────────────

  /** Create a new session or attach to an existing one */
  async createOrAttach(
    id: string,
    opts?: { cols?: number; rows?: number; cwd?: string },
  ): Promise<void> {
    const resp = await this.request({
      type: 'createOrAttach',
      id,
      seq: this.nextSeq(),
      cols: opts?.cols,
      rows: opts?.rows,
      cwd: opts?.cwd,
    });

    if (resp.type === 'error') {
      throw new Error(resp.message);
    }
  }

  /** Send input to a session */
  input(id: string, data: string): void {
    // Fire-and-forget — no seq, no response expected
    this.send({ type: 'input', id, data });
  }

  /** Resize a session */
  resize(id: string, cols: number, rows: number): void {
    // Fire-and-forget
    this.send({ type: 'resize', id, cols, rows });
  }

  /** Detach from a session (stop receiving output) */
  async detach(id: string): Promise<void> {
    const resp = await this.request({
      type: 'detach',
      id,
      seq: this.nextSeq(),
    });

    if (resp.type === 'error') {
      throw new Error(resp.message);
    }
  }

  /** Kill a session */
  async kill(id: string): Promise<void> {
    const resp = await this.request({
      type: 'kill',
      id,
      seq: this.nextSeq(),
    });

    if (resp.type === 'error') {
      throw new Error(resp.message);
    }
  }

  /** List all active sessions */
  async list(): Promise<SessionInfo[]> {
    const resp = await this.request({
      type: 'list',
      seq: this.nextSeq(),
    });

    if (resp.type === 'list') {
      return resp.sessions;
    }
    if (resp.type === 'error') {
      throw new Error(resp.message);
    }
    return [];
  }

  /** Get scrollback snapshot for a session */
  async snapshot(id: string): Promise<string> {
    const resp = await this.request({
      type: 'snapshot',
      id,
      seq: this.nextSeq(),
    });

    if (resp.type === 'snapshot') {
      return resp.scrollback;
    }
    if (resp.type === 'error') {
      throw new Error(resp.message);
    }
    return '';
  }

  /** Ping the daemon to check connectivity */
  async ping(): Promise<boolean> {
    try {
      const resp = await this.request({
        type: 'ping',
        seq: this.nextSeq(),
      });
      return resp.type === 'pong';
    } catch {
      return false;
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private nextSeq(): number {
    return ++this.seq;
  }

  private send(msg: DaemonRequest): void {
    if (!this.socket || this.socket.destroyed) return;
    this.socket.write(encode(msg) + '\n');
  }

  private request(msg: DaemonRequest & { seq: number }): Promise<DaemonResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.seq);
        reject(new Error(`Request timed out (seq=${msg.seq}, type=${msg.type})`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(msg.seq, { resolve, reject, timer });
      this.send(msg);
    });
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;

    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (line.length === 0) continue;

      try {
        const msg = decode(line) as DaemonResponse;
        this.handleMessage(msg);
      } catch (err) {
        console.error('[DaemonClient] Failed to parse:', line, err);
      }
    }
  }

  private handleMessage(msg: DaemonResponse): void {
    // Push messages (no seq correlation) — emit as events
    if (msg.type === 'output') {
      const output = msg as OutputMessage;
      this.emit('output', output.id, output.data);
      return;
    }

    if (msg.type === 'exit') {
      const exit = msg as ExitMessage;
      this.emit('exit', exit.id, exit.code);
      return;
    }

    // RPC responses — correlate by seq
    if ('seq' in msg && typeof msg.seq === 'number') {
      const pending = this.pending.get(msg.seq);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.seq);
        pending.resolve(msg);
      }
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [seq, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[DaemonClient] Max reconnect attempts reached, giving up');
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts;
    console.log(
      `[DaemonClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    );

    setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // connect() failure will trigger 'close' which will reschedule
        this.reconnecting = false;
      }
    }, delay);
  }

  // ─── Static Helpers ────────────────────────────────────────────────

  /** Check if the daemon process is running by reading the PID file */
  static isDaemonRunning(): boolean {
    try {
      if (!fs.existsSync(PID_FILE)) return false;
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
      // Signal 0 checks if process exists without killing
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** Check if the daemon socket exists and is connectable */
  static async isDaemonReachable(): Promise<boolean> {
    if (!fs.existsSync(SOCKET_PATH)) return false;

    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ path: SOCKET_PATH });
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 2_000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /** Get the socket path */
  static getSocketPath(): string {
    return SOCKET_PATH;
  }

  /** Get the PID file path */
  static getPidFilePath(): string {
    return PID_FILE;
  }
}
