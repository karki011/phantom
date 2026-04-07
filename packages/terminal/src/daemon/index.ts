/**
 * PhantomOS Terminal Daemon — Public API
 * Re-exports the client, protocol types, and session for consumers.
 * @author Subash Karki
 */
export { DaemonClient } from './client.js';
export type { DaemonClientEvents } from './client.js';

export {
  encode,
  decode,
  type DaemonRequest,
  type DaemonResponse,
  type CreateOrAttachRequest,
  type InputRequest,
  type ResizeRequest,
  type DetachRequest,
  type KillRequest,
  type ListRequest,
  type SnapshotRequest,
  type PingRequest,
  type OkResponse,
  type ErrorResponse,
  type OutputMessage,
  type ExitMessage,
  type ListResponse,
  type SnapshotResponse,
  type PongResponse,
  type SessionInfo,
} from './protocol.js';

export { Session } from './session.js';
export type { SessionOutputHandler, SessionExitHandler } from './session.js';
