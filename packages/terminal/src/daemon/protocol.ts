/**
 * PhantomOS Terminal Daemon — NDJSON Protocol Types
 * Defines all message types for the Unix socket protocol between
 * the terminal daemon and its clients.
 * @author Subash Karki
 */

// ─── Request Messages (client → daemon) ─────────────────────────────

export interface CreateOrAttachRequest {
  type: 'createOrAttach';
  id: string;
  /** Sequence number for request/response correlation */
  seq: number;
  cols?: number;
  rows?: number;
  cwd?: string;
}

export interface InputRequest {
  type: 'input';
  id: string;
  data: string;
}

export interface ResizeRequest {
  type: 'resize';
  id: string;
  cols: number;
  rows: number;
}

export interface DetachRequest {
  type: 'detach';
  id: string;
  seq: number;
}

export interface KillRequest {
  type: 'kill';
  id: string;
  seq: number;
}

export interface ListRequest {
  type: 'list';
  seq: number;
}

export interface SnapshotRequest {
  type: 'snapshot';
  id: string;
  seq: number;
}

export interface PingRequest {
  type: 'ping';
  seq: number;
}

export type DaemonRequest =
  | CreateOrAttachRequest
  | InputRequest
  | ResizeRequest
  | DetachRequest
  | KillRequest
  | ListRequest
  | SnapshotRequest
  | PingRequest;

// ─── Response Messages (daemon → client) ─────────────────────────────

export interface OkResponse {
  type: 'ok';
  seq: number;
}

export interface ErrorResponse {
  type: 'error';
  seq: number;
  message: string;
}

export interface OutputMessage {
  type: 'output';
  id: string;
  data: string;
}

export interface ExitMessage {
  type: 'exit';
  id: string;
  code: number;
}

export interface SessionInfo {
  id: string;
  pid: number;
  cols: number;
  rows: number;
  cwd: string;
  createdAt: number;
}

export interface ListResponse {
  type: 'list';
  seq: number;
  sessions: SessionInfo[];
}

export interface SnapshotResponse {
  type: 'snapshot';
  seq: number;
  id: string;
  scrollback: string;
}

export interface PongResponse {
  type: 'pong';
  seq: number;
}

export type DaemonResponse =
  | OkResponse
  | ErrorResponse
  | OutputMessage
  | ExitMessage
  | ListResponse
  | SnapshotResponse
  | PongResponse;

// ─── Helpers ─────────────────────────────────────────────────────────

/** Encode a message as an NDJSON line (no trailing newline — caller adds it) */
export const encode = (msg: DaemonRequest | DaemonResponse): string =>
  JSON.stringify(msg);

/** Parse a single NDJSON line into a message */
export const decode = (line: string): DaemonRequest | DaemonResponse =>
  JSON.parse(line);
